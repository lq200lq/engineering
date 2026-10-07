import { glob } from "node:fs/promises";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { ConfigError } from "../config/load.js";
import type { CheckSpec, ProjectProfile, Registry } from "../config/types.js";
import { matchRules } from "../resolver/match.js";
import type { ValidationReport, ValidationResult } from "./types.js";

interface PackageDependencies {
  available: true;
  names: Set<string>;
}

interface PackageDependenciesUnknown {
  available: false;
  reason: string;
}

type DependencyInventory = PackageDependencies | PackageDependenciesUnknown;

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function validateGlobPattern(pattern: string): string {
  if (
    pattern.length === 0 ||
    pattern.includes("\\") ||
    pattern.startsWith("!") ||
    pattern.includes("{") ||
    pattern.includes("}") ||
    path.posix.isAbsolute(pattern) ||
    path.win32.isAbsolute(pattern)
  ) {
    throw new ConfigError(`檢查 pattern 必須是非空的項目相對 glob: ${pattern}`);
  }
  if (pattern.split("/").some((part) => part.includes("..") || part === "." || part.length === 0)) {
    throw new ConfigError(`檢查 pattern 不允許 .、.. 或空路徑片段: ${pattern}`);
  }
  return pattern;
}

async function findProjectFiles(projectRoot: string, pattern: string): Promise<string[]> {
  const safePattern = validateGlobPattern(pattern);
  const canonicalRoot = await realpath(projectRoot);
  const matches: string[] = [];
  try {
    for await (const relativePath of glob(safePattern, { cwd: canonicalRoot })) {
      const absolutePath = path.resolve(canonicalRoot, relativePath);
      if (!isWithin(canonicalRoot, absolutePath)) continue;
      let stat;
      try {
        stat = await lstat(absolutePath);
      } catch {
        continue;
      }
      if (stat.isSymbolicLink()) {
        try {
          const target = await realpath(absolutePath);
          if (!isWithin(canonicalRoot, target)) continue;
          stat = await lstat(target);
        } catch {
          continue;
        }
      }
      if (!stat.isFile()) continue;
      const canonicalFile = await realpath(absolutePath);
      if (!isWithin(canonicalRoot, canonicalFile)) continue;
      matches.push(path.relative(canonicalRoot, canonicalFile).split(path.sep).join("/"));
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new ConfigError(`無法展開檢查 pattern "${safePattern}": ${detail}`);
  }
  return [...new Set(matches)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

async function readDependencyInventory(projectRoot: string): Promise<DependencyInventory> {
  const packagePath = path.join(projectRoot, "package.json");
  let value: unknown;
  try {
    value = JSON.parse(await readFile(packagePath, "utf8"));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { available: false, reason: `無法解析 package.json: ${detail}` };
  }

  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { available: false, reason: "package.json 根值必須是物件" };
  }
  const names = new Set<string>();
  for (const section of ["dependencies", "devDependencies", "optionalDependencies"] as const) {
    const dependencies = (value as Record<string, unknown>)[section];
    if (dependencies === undefined) continue;
    if (dependencies === null || typeof dependencies !== "object" || Array.isArray(dependencies)) {
      return { available: false, reason: `package.json 的 ${section} 必須是物件` };
    }
    for (const [name, version] of Object.entries(dependencies)) {
      if (typeof version !== "string") {
        return { available: false, reason: `package.json 的 ${section}.${name} 必須是字串` };
      }
      names.add(name);
    }
  }
  return { available: true, names };
}

async function runCheck(
  projectRoot: string,
  check: CheckSpec,
  ruleId: string,
  dependencyInventory: Promise<DependencyInventory>,
): Promise<ValidationResult> {
  if (check.type === "file_exists" || check.type === "migration_exists") {
    const files = await findProjectFiles(projectRoot, check.pattern);
    return {
      ruleId,
      level: check.level,
      type: check.type,
      status: files.length > 0 ? "pass" : "fail",
      path: check.pattern,
      actual: files.length > 0 ? files.join(", ") : "未找到匹配文件",
      expected: "至少一个匹配文件",
      reason: files.length > 0 ? `找到 ${files.length} 个匹配文件` : `没有文件匹配 ${check.pattern}`,
    };
  }

  const inventory = await dependencyInventory;
  const expectedPresent = check.type === "dependency_present";
  if (!inventory.available) {
    return {
      ruleId,
      level: check.level,
      type: check.type,
      status: "unknown",
      path: "package.json",
      actual: null,
      expected: expectedPresent,
      reason: inventory.reason,
    };
  }
  const present = inventory.names.has(check.name);
  return {
    ruleId,
    level: check.level,
    type: check.type,
    status: present === expectedPresent ? "pass" : "fail",
    path: "package.json",
    actual: present,
    expected: expectedPresent,
    reason: present === expectedPresent ? `依赖 ${check.name} 符合要求` : `依赖 ${check.name} 不符合要求`,
  };
}

export async function runChecks(
  projectRoot: string,
  registry: Registry,
  profile: ProjectProfile,
): Promise<ValidationReport> {
  const dependencyInventory = readDependencyInventory(projectRoot);
  const scheduled = matchRules(profile, registry).flatMap(({ id, rule }) =>
    (rule.checks ?? []).map((check, index) => ({ id, check, index })),
  );
  const indexedResults = await Promise.all(
    scheduled.map(async ({ id, check, index }) => ({
      index,
      result: await runCheck(projectRoot, check, id, dependencyInventory),
    })),
  );
  indexedResults.sort((a, b) =>
    a.result.ruleId === b.result.ruleId
      ? a.index - b.index
      : a.result.ruleId < b.result.ruleId
        ? -1
        : 1,
  );
  return { results: indexedResults.map(({ result }) => result) };
}

export function exitCodeFor(report: ValidationReport): 0 | 1 | 3 {
  if (report.results.some((result) => result.status === "fail" && result.level === "mandatory")) return 1;
  if (report.results.some((result) => result.status === "unknown")) return 3;
  return 0;
}

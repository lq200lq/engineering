import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { ConfigError, parseManifest, parseProfile, parseRegistry, readYamlFile } from "../config/load.js";
import type { Manifest, ProjectProfile, Registry } from "../config/types.js";
import { resolveRegularFileInside } from "../io/paths.js";
import type { StandardsSource } from "../io/standards.js";
import { createManifest } from "../manifest/manifest.js";
import { hashTree, sha256 } from "../manifest/hash.js";
import { resolveRules } from "../resolver/resolve.js";
import { runChecks } from "./checks.js";
import type { ValidationReport } from "./types.js";

interface TreeFile {
  path: string;
  content: string;
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

async function readManifest(outputRoot: string): Promise<Manifest> {
  const manifestPath = path.join(outputRoot, "manifest.yaml");
  let stat;
  try {
    stat = await lstat(manifestPath);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new ConfigError(`缺少或无法读取 Manifest ${manifestPath}: ${detail}`);
  }
  if (stat.isSymbolicLink() || !stat.isFile()) throw new ConfigError(`Manifest 必须是普通文件: ${manifestPath}`);
  let value: unknown;
  try {
    const { parseDocument } = await import("yaml");
    const document = parseDocument(await readFile(manifestPath, "utf8"), { uniqueKeys: true });
    if (document.errors.length > 0 || document.contents === null) {
      throw new ConfigError(`Manifest YAML 无效: ${manifestPath}`);
    }
    value = document.toJSON();
  } catch (error) {
    if (error instanceof ConfigError) throw error;
    const detail = error instanceof Error ? error.message : String(error);
    throw new ConfigError(`无法解析 Manifest ${manifestPath}: ${detail}`);
  }
  return parseManifest(value);
}

async function collectResolvedFiles(root: string): Promise<TreeFile[]> {
  let rootStat;
  try {
    rootStat = await lstat(root);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new ConfigError(`缺少 resolved 目录 ${root}: ${detail}`);
  }
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw new ConfigError(`resolved 必须是普通目录: ${root}`);
  }
  const canonicalRoot = await realpath(root);
  const files: TreeFile[] = [];

  async function walk(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      const stat = await lstat(absolutePath);
      if (stat.isSymbolicLink()) throw new ConfigError(`resolved 不允許符號連結: ${absolutePath}`);
      if (stat.isDirectory()) {
        await walk(absolutePath);
      } else if (stat.isFile()) {
        const canonicalFile = await realpath(absolutePath);
        if (!isWithin(canonicalRoot, canonicalFile)) throw new ConfigError(`resolved 文件越出輸出目錄: ${absolutePath}`);
        const bytes = await readFile(absolutePath);
        const content = bytes.toString("utf8");
        if (!Buffer.from(content, "utf8").equals(bytes)) throw new ConfigError(`resolved 文件不是有效 UTF-8: ${absolutePath}`);
        files.push({ path: path.relative(canonicalRoot, absolutePath).split(path.sep).join("/"), content });
      } else {
        throw new ConfigError(`resolved 只允许普通文件和目录: ${absolutePath}`);
      }
    }
  }

  await walk(canonicalRoot);
  return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

function assertManifestMatches(actual: Manifest, expected: Manifest): void {
  const rulesMatch =
    actual.rules.length === expected.rules.length &&
    actual.rules.every((rule, index) => {
      const expectedRule = expected.rules[index];
      return (
        expectedRule !== undefined &&
        rule.id === expectedRule.id &&
        rule.path === expectedRule.path &&
        rule.sha256 === expectedRule.sha256
      );
    });
  if (
    actual.formatVersion !== expected.formatVersion ||
    actual.standards.source !== expected.standards.source ||
    actual.standards.version !== expected.standards.version ||
    actual.standards.revision !== expected.standards.revision ||
    actual.standards.resolverVersion !== expected.standards.resolverVersion ||
    actual.inputs.profileSha256 !== expected.inputs.profileSha256 ||
    actual.inputs.registrySha256 !== expected.inputs.registrySha256 ||
    actual.generatedSha256 !== expected.generatedSha256 ||
    !rulesMatch
  ) {
    throw new ConfigError("Manifest 与当前 Profile、Registry、Standards 或解析结果不一致，请重新执行 eng resolve");
  }
}

export async function validateGeneratedState(
  standards: StandardsSource,
  profileContent: string,
  registryContent: string,
  profile: ProjectProfile,
  registry: Registry,
  outputRoot: string,
): Promise<void> {
  let outputStat;
  try {
    outputStat = await lstat(outputRoot);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new ConfigError(`缺少或无法读取输出目录 ${outputRoot}: ${detail}`);
  }
  if (outputStat.isSymbolicLink() || !outputStat.isDirectory()) {
    throw new ConfigError(`输出路径必须是普通目录，不能是符号链接: ${outputRoot}`);
  }
  const actualManifest = await readManifest(outputRoot);
  if (actualManifest.standards.revision !== standards.revision) {
    throw new ConfigError(`Manifest revision 已过期：${actualManifest.standards.revision} != ${standards.revision}`);
  }

  const resolvedFiles = await resolveRules(profile, registry, standards);
  const expectedManifest = await createManifest({ registry, revision: standards.revision, profileContent, registryContent, resolvedFiles });
  assertManifestMatches(actualManifest, expectedManifest);

  const actualFiles = await collectResolvedFiles(path.join(outputRoot, "resolved"));
  const expectedFiles = resolvedFiles
    .map(({ destinationPath, content }) => ({ path: destinationPath.replace(/^resolved\//, ""), content }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
    throw new ConfigError("resolved 文件与当前 Standards 解析结果不一致，请重新执行 eng resolve");
  }
  if (hashTree(actualFiles.map((file) => ({ ...file, path: `resolved/${file.path}` }))) !== actualManifest.generatedSha256) {
    throw new ConfigError("resolved 树摘要与 Manifest 不一致，请重新执行 eng resolve");
  }

  for (const file of resolvedFiles) {
    if (sha256(file.content) !== file.sourceSha256) {
      throw new ConfigError(`规则文件摘要错误: ${file.sourcePath}`);
    }
  }
}

export async function validateProject(
  projectRoot: string,
  standards: StandardsSource,
  profilePath: string,
  outputRoot: string,
): Promise<ValidationReport> {
  const profileContent = await readFile(profilePath, "utf8").catch((error: unknown) => {
    const detail = error instanceof Error ? error.message : String(error);
    throw new ConfigError(`${profilePath}: 无法读取 Profile: ${detail}`);
  });
  const profile = parseProfile(await readYamlFile(profilePath));
  const registryPath = await resolveRegularFileInside(standards.root, "registry.yaml");
  const registryContent = await readFile(registryPath, "utf8").catch((error: unknown) => {
    const detail = error instanceof Error ? error.message : String(error);
    throw new ConfigError(`${registryPath}: 无法读取 Registry: ${detail}`);
  });
  const registry = parseRegistry(await readYamlFile(registryPath));
  await standards.assertFileMatches("registry.yaml", registryContent);
  await validateGeneratedState(standards, profileContent, registryContent, profile, registry, outputRoot);
  return runChecks(projectRoot, registry, profile);
}

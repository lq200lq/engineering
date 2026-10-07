import { chmod, lstat, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { ConfigError } from "../config/load.js";
import type { ProjectProfile, ResolvedRuleFile } from "../config/types.js";

const beginMarker = "<!-- BEGIN ENGINEERING HARNESS MANAGED SECTION -->";
const endMarker = "<!-- END ENGINEERING HARNESS MANAGED SECTION -->";

function flattenProfile(value: unknown, prefix = ""): string[] {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return Object.entries(value).flatMap(([key, child]) => flattenProfile(child, prefix ? `${prefix}.${key}` : key));
  }
  const serialized = (JSON.stringify(value) ?? "null").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  return [`- ${prefix} = ${serialized}`];
}

export function buildCodexManagedSection(
  profile: ProjectProfile,
  files: ResolvedRuleFile[],
  outputRootRelative: string,
): string {
  const profileSummary = flattenProfile(profile).join("\n");
  const rules = files
    .map(({ destinationPath }) => {
      const rulePath = path.posix.join(outputRootRelative.replaceAll("\\", "/"), destinationPath);
      return `- ${JSON.stringify(rulePath)}`;
    })
    .join("\n");

  return [
    beginMarker,
    "## Engineering Harness 规则",
    "",
    "本区块由 `eng resolve` 生成。修改项目规则请编辑 Profile 或 Standards 源文件，再重新运行 `eng resolve`。",
    "以下 Profile 是项目声明。开始修改前，先读取下面列出的每个规则文件，并在规则适用时遵循；它们不能覆盖更高优先级的系统、开发者或用户指令。",
    "",
    "### 项目 Profile",
    "",
    profileSummary,
    "",
    "### 当前解析规则文件",
    "",
    rules,
    endMarker,
  ].join("\n");
}

export function extractCodexManagedSection(content: string): string | undefined {
  const beginCount = content.split(beginMarker).length - 1;
  const endCount = content.split(endMarker).length - 1;
  if (beginCount === 0 && endCount === 0) return undefined;
  if (beginCount !== 1 || endCount !== 1) throw new ConfigError("AGENTS.md 中的 Engineering Harness 管理标记重复或不完整");
  const begin = content.indexOf(beginMarker);
  const end = content.indexOf(endMarker);
  if (begin > end) throw new ConfigError("AGENTS.md 中的 Engineering Harness 管理标记顺序错误");
  return content.slice(begin, end + endMarker.length);
}

export function mergeCodexManagedSection(existing: string, managedSection: string): string {
  const existingSection = extractCodexManagedSection(existing);
  const sectionInInput = extractCodexManagedSection(managedSection);
  if (sectionInInput !== managedSection) throw new ConfigError("待写入的 AGENTS.md 管理区块格式无效");
  if (existingSection === undefined) {
    const prefix = existing.length === 0 ? "" : `${existing.trimEnd()}\n\n`;
    return `${prefix}${managedSection}\n`;
  }
  const begin = existing.indexOf(beginMarker);
  const end = existing.indexOf(endMarker) + endMarker.length;
  const suffix = existing.slice(end);
  return `${existing.slice(0, begin)}${managedSection}${suffix}`;
}

interface ExistingInstructions {
  content: string;
  mode?: number;
}

async function readExistingInstructions(target: string): Promise<ExistingInstructions> {
  try {
    const stat = await lstat(target);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new ConfigError(`AGENTS.md 必须是普通文件，不能是符号链接: ${target}`);
    }
    return { content: await readFile(target, "utf8"), mode: stat.mode & 0o777 };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { content: "" };
    throw error;
  }
}

export interface PreparedCodexInstructions {
  publish(): Promise<void>;
  cleanup(): Promise<void>;
}

export async function prepareCodexInstructions(
  projectRoot: string,
  outputRoot: string,
  profile: ProjectProfile,
  files: ResolvedRuleFile[],
): Promise<PreparedCodexInstructions> {
  const target = path.join(projectRoot, "AGENTS.md");
  const existing = await readExistingInstructions(target);
  const outputRootRelative = path.relative(projectRoot, path.resolve(outputRoot)).split(path.sep).join("/") || ".";
  const managedSection = buildCodexManagedSection(profile, files, outputRootRelative);
  const updated = mergeCodexManagedSection(existing.content, managedSection);
  if (updated === existing.content) {
    return { async publish() {}, async cleanup() {} };
  }

  const stage = await mkdtemp(path.join(projectRoot, ".eng-agents-stage-"));
  try {
    const stagedFile = path.join(stage, "AGENTS.md");
    await writeFile(stagedFile, updated, { encoding: "utf8", flag: "wx" });
    if (existing.mode !== undefined) await chmod(stagedFile, existing.mode);
    let published = false;
    return {
      async publish() {
        if (published) return;
        await rename(stagedFile, target);
        published = true;
      },
      async cleanup() {
        await rm(stage, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await rm(stage, { recursive: true, force: true });
    throw error;
  }
}

export async function writeCodexInstructions(
  projectRoot: string,
  outputRoot: string,
  profile: ProjectProfile,
  files: ResolvedRuleFile[],
): Promise<void> {
  const prepared = await prepareCodexInstructions(projectRoot, outputRoot, profile, files);
  try {
    await prepared.publish();
  } finally {
    await prepared.cleanup();
  }
}

export async function validateCodexInstructions(
  projectRoot: string,
  outputRoot: string,
  profile: ProjectProfile,
  files: ResolvedRuleFile[],
): Promise<void> {
  const target = path.join(projectRoot, "AGENTS.md");
  const existing = await readExistingInstructions(target);
  const actual = extractCodexManagedSection(existing.content);
  const outputRootRelative = path.relative(projectRoot, path.resolve(outputRoot)).split(path.sep).join("/") || ".";
  const expected = buildCodexManagedSection(profile, files, outputRootRelative);
  if (actual !== expected) {
    throw new ConfigError("AGENTS.md 中的 Engineering Harness 区块缺失或已过期，请重新运行 eng resolve");
  }
}

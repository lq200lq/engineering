import { readFile } from "node:fs/promises";
import { ConfigError } from "../config/load.js";
import { collectMarkdownFiles } from "../io/paths.js";
import { assertGitFileMatchesHead, getGitHead } from "../io/git.js";
import type { ProjectProfile, Registry, ResolvedRuleFile } from "../config/types.js";
import { sha256 } from "../manifest/hash.js";
import { matchRules } from "./match.js";

function toRegistryPaths(rulePath: string | string[]): string[] {
  return typeof rulePath === "string" ? [rulePath] : rulePath;
}

export async function resolveRules(
  profile: ProjectProfile,
  registry: Registry,
  standardsRoot: string,
): Promise<ResolvedRuleFile[]> {
  const revision = await getGitHead(standardsRoot);
  const matched = matchRules(profile, registry);
  const resolved: ResolvedRuleFile[] = [];

  for (const [index, { id, rule }] of matched.entries()) {
    const ruleFiles = new Map<string, { absolutePath: string; relativePath: string }>();
    for (const requestedPath of toRegistryPaths(rule.path)) {
      for (const source of await collectMarkdownFiles(standardsRoot, requestedPath)) {
        ruleFiles.set(source.relativePath, source);
      }
    }

    for (const source of [...ruleFiles.values()].sort((a, b) => (a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0))) {
      const bytes = await readFile(source.absolutePath);
      const content = bytes.toString("utf8");
      if (!Buffer.from(content, "utf8").equals(bytes)) {
        throw new ConfigError(`规则文件不是有效 UTF-8: ${source.relativePath}`);
      }
      await assertGitFileMatchesHead(standardsRoot, revision, source.relativePath, content);
      const sourceSha256 = sha256(content);
      const destinationPath = `resolved/${String(index).padStart(3, "0")}-${id}/${source.relativePath}`;
      resolved.push({ ruleId: id, sourcePath: source.relativePath, sourceSha256, destinationPath, content });
    }
  }

  return resolved;
}

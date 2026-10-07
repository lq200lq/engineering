import { lstat, mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { stringify } from "yaml";
import { ConfigError, parseManifest } from "../config/load.js";
import type { Manifest, ResolvedRuleFile } from "../config/types.js";
import { validateRelativePath } from "./paths.js";
import { hashTree, sha256 } from "../manifest/hash.js";
import type { PreparedCodexInstructions } from "./codex-adapter.js";

async function exists(target: string): Promise<boolean> {
  try {
    await lstat(target);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export async function writeResolvedGeneration(
  outputRoot: string,
  files: ResolvedRuleFile[],
  manifest: Manifest,
  codexInstructions?: PreparedCodexInstructions,
): Promise<void> {
  parseManifest(manifest);
  const treeEntries = files.map((file) => ({ path: file.destinationPath, content: file.content }));
  if (hashTree(treeEntries) !== manifest.generatedSha256) {
    throw new ConfigError("生成文件摘要与 Manifest 不一致");
  }
  for (const file of files) {
    if (sha256(file.content) !== file.sourceSha256) {
      throw new ConfigError(`生成文件内容摘要不一致: ${file.sourcePath}`);
    }
  }
  const absoluteOutput = path.resolve(outputRoot);
  const parent = path.dirname(absoluteOutput);
  const base = path.basename(absoluteOutput);
  await mkdir(parent, { recursive: true });
  await mkdir(absoluteOutput, { recursive: true });
  const outputStat = await lstat(absoluteOutput);
  if (outputStat.isSymbolicLink() || !outputStat.isDirectory()) {
    throw new ConfigError(`输出路径必须是普通目录，不能是符号链接: ${absoluteOutput}`);
  }

  const stage = await mkdtemp(path.join(parent, `.${base}.eng-stage-`));
  const backup = await mkdtemp(path.join(parent, `.${base}.eng-backup-`));
  const stagedResolved = path.join(stage, "resolved");
  const stagedManifest = path.join(stage, "manifest.yaml");
  const targetResolved = path.join(absoluteOutput, "resolved");
  const targetManifest = path.join(absoluteOutput, "manifest.yaml");
  const backupResolved = path.join(backup, "resolved");
  const backupManifest = path.join(backup, "manifest.yaml");
  let movedResolved = false;
  let movedManifest = false;
  let installedResolved = false;
  let installedManifest = false;
  let preserveBackup = false;

  try {
    await mkdir(stagedResolved, { recursive: true });
    for (const file of files) {
      const safePath = validateRelativePath(file.destinationPath, "生成路径");
      if (!safePath.startsWith("resolved/")) throw new ConfigError(`生成路径必须位于 resolved/ 下: ${safePath}`);
      const destination = path.join(stage, ...safePath.split("/"));
      const relative = path.relative(stage, destination);
      if (relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) {
        throw new ConfigError(`生成路径越出暂存目录: ${file.destinationPath}`);
      }
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, file.content, "utf8");
    }
    await writeFile(stagedManifest, stringify(manifest), "utf8");

    for (const target of [targetResolved, targetManifest]) {
      if (await exists(target)) {
        const stat = await lstat(target);
        if (stat.isSymbolicLink()) throw new ConfigError(`拒绝替换符号链接: ${target}`);
        if (target === targetResolved && !stat.isDirectory()) throw new ConfigError(`resolved 输出必须是目录: ${target}`);
        if (target === targetManifest && !stat.isFile()) throw new ConfigError(`Manifest 输出必须是文件: ${target}`);
      }
    }

    if (await exists(targetResolved)) {
      await rename(targetResolved, backupResolved);
      movedResolved = true;
    }
    if (await exists(targetManifest)) {
      await rename(targetManifest, backupManifest);
      movedManifest = true;
    }

    await rename(stagedResolved, targetResolved);
    installedResolved = true;
    await rename(stagedManifest, targetManifest);
    installedManifest = true;
    // 指令入口发布成功后，才允许清理生成物备份。
    await codexInstructions?.publish();
  } catch (error) {
    try {
      if (installedManifest) await rm(targetManifest, { force: true });
      if (installedResolved) await rm(targetResolved, { recursive: true, force: true });
      if (movedResolved) await rename(backupResolved, targetResolved);
      if (movedManifest) await rename(backupManifest, targetManifest);
    } catch (rollbackError) {
      preserveBackup = true;
      const detail = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
      throw new ConfigError(`发布失败且无法完整回滚；旧生成物保留在 ${backup}: ${detail}`);
    }
    throw error;
  } finally {
    await rm(stage, { recursive: true, force: true });
    if (!preserveBackup) await rm(backup, { recursive: true, force: true });
  }
}

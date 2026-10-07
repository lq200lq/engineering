#!/usr/bin/env node
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { ConfigError, parseManifest, parseProfile, parseRegistry, readYamlFile } from "./config/load.js";
import type { Manifest } from "./config/types.js";
import { assertGitFileMatchesHead, getGitHead } from "./io/git.js";
import { resolveRegularFileInside } from "./io/paths.js";
import { createManifest } from "./manifest/manifest.js";
import { resolveRules } from "./resolver/resolve.js";
import { writeResolvedGeneration } from "./io/publish.js";

const usage = `Engineering Harness\n\n用法:\n  eng <命令> [选项]\n\n命令:\n  resolve    解析并生成项目规则\n  validate   校验已生成规则和项目约束\n\n选项:\n  --standards <path>  Standards Repository 本地路径\n  --profile <path>    项目 Profile（默认 ./engineering.yaml）\n  --output <path>     输出目录（默认 ./.ai）\n  --upgrade <sha>     显式锁定本地 Standards HEAD\n  --help              显示帮助`;

const commandOptions = {
  standards: { type: "string" },
  profile: { type: "string" },
  output: { type: "string" },
  upgrade: { type: "string" },
  help: { type: "boolean" },
} as const;

type CommandOptions =
  | { help: true }
  | { help: false; standards: string; profile?: string; output?: string; upgrade?: string };

function parseOptions(command: string, args: string[]): CommandOptions {
  const { values, tokens } = parseArgs({
    args,
    options: commandOptions,
    strict: true,
    allowPositionals: false,
    tokens: true,
  });
  const seen = new Set<string>();
  for (const token of tokens) {
    if (token.kind !== "option") continue;
    if (seen.has(token.name)) throw new Error(`选项 --${token.name} 不能重复`);
    seen.add(token.name);
  }

  if (seen.has("help")) return { help: true };
  if (!seen.has("standards")) throw new Error(`${command} 命令必须提供 --standards <path>`);
  if (command === "validate" && seen.has("upgrade")) {
    throw new Error("validate 命令不接受 --upgrade");
  }
  if (typeof values.standards !== "string") throw new Error(`${command} 命令必须提供 --standards <path>`);
  return {
    help: false,
    standards: values.standards,
    ...(typeof values.profile === "string" ? { profile: values.profile } : {}),
    ...(typeof values.output === "string" ? { output: values.output } : {}),
    ...(typeof values.upgrade === "string" ? { upgrade: values.upgrade } : {}),
  };
}

async function readPreviousManifest(outputRoot: string): Promise<Manifest | undefined> {
  let outputStat;
  try {
    outputStat = await lstat(outputRoot);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  if (outputStat.isSymbolicLink() || !outputStat.isDirectory()) {
    throw new ConfigError(`输出路径必须是普通目录，不能是符号链接: ${outputRoot}`);
  }

  const manifestPath = path.join(outputRoot, "manifest.yaml");
  let manifestStat;
  try {
    manifestStat = await lstat(manifestPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  if (manifestStat.isSymbolicLink() || !manifestStat.isFile()) {
    throw new ConfigError(`Manifest 必须是普通文件: ${manifestPath}`);
  }
  return parseManifest(await readYamlFile(manifestPath));
}

async function resolveCommand(options: CommandOptions): Promise<void> {
  if (options.help) throw new ConfigError("resolve 命令参数不完整");
  const standardsRoot = path.resolve(options.standards);
  const profilePath = path.resolve(options.profile ?? "./engineering.yaml");
  const outputRoot = path.resolve(options.output ?? "./.ai");
  const registryPath = await resolveRegularFileInside(standardsRoot, "registry.yaml");
  const revision = await getGitHead(standardsRoot);

  if (options.upgrade !== undefined && options.upgrade !== revision) {
    throw new ConfigError(`--upgrade 必须等于本地 Standards HEAD: ${revision}`);
  }

  const profileContent = await readFile(profilePath, "utf8").catch((error: unknown) => {
    const detail = error instanceof Error ? error.message : String(error);
    throw new ConfigError(`${profilePath}: 无法读取 Profile: ${detail}`);
  });
  const registryContent = await readFile(registryPath, "utf8").catch((error: unknown) => {
    const detail = error instanceof Error ? error.message : String(error);
    throw new ConfigError(`${registryPath}: 无法读取 Registry: ${detail}`);
  });
  await assertGitFileMatchesHead(standardsRoot, revision, "registry.yaml", registryContent);

  const profile = parseProfile(await readYamlFile(profilePath));
  const registry = parseRegistry(await readYamlFile(registryPath));

  const previous = await readPreviousManifest(outputRoot);
  if (previous !== undefined) {
    if (previous.standards.revision !== revision && options.upgrade === undefined) {
      throw new ConfigError(`Standards HEAD 已变化；请显式使用 --upgrade ${revision}`);
    }
    if (previous.standards.source !== registry.standards.id && options.upgrade === undefined) {
      throw new ConfigError(`Standards 源已变化；请显式使用 --upgrade ${revision}`);
    }
  }

  const resolvedFiles = await resolveRules(profile, registry, standardsRoot);
  const manifest = await createManifest({ registry, revision, profileContent, registryContent, resolvedFiles });
  await writeResolvedGeneration(outputRoot, resolvedFiles, manifest);
  process.stdout.write(`已生成 ${resolvedFiles.length} 条规则文件，revision ${revision}\n`);
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (command === undefined || command === "--help" || command === "-h") {
    process.stdout.write(`${usage}\n`);
    return;
  }
  if (command !== "resolve" && command !== "validate") {
    process.stderr.write(`未知命令 "${command}"\n\n${usage}\n`);
    process.exitCode = 2;
    return;
  }
  try {
    const options = parseOptions(command, args);
    if (options.help) {
      process.stdout.write(`${usage}\n`);
      return;
    }
    if (command === "resolve") {
      await resolveCommand(options);
      return;
    }
    throw new ConfigError("validate 命令尚未实现");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n\n${usage}\n`);
    process.exitCode = 2;
  }
}

await main();

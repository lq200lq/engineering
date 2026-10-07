#!/usr/bin/env node
import { lstat, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { stringify } from "yaml";
import { ConfigError, parseManifest, parseProfile, parseRegistry, readYamlFile } from "./config/load.js";
import type { Manifest } from "./config/types.js";
import { resolveRegularFileInside } from "./io/paths.js";
import { prepareCodexInstructions } from "./io/codex-adapter.js";
import { resolveStandardsSource } from "./io/standards.js";
import { createManifest } from "./manifest/manifest.js";
import { resolveRules } from "./resolver/resolve.js";
import { findUnsupportedStackValues } from "./resolver/diagnostics.js";
import { writeResolvedGeneration } from "./io/publish.js";
import { exitCodeFor } from "./validator/checks.js";
import { validateProject } from "./validator/run.js";
import { formatValidationSummary } from "./validator/summary.js";

const usage = `Engineering Harness\n\n用法:\n  eng <命令> [选项]\n\n命令:\n  init       交互式配置并创建项目 Profile\n  resolve    解析规则并更新 Codex 的 AGENTS.md 入口\n  validate   检查规则快照与已声明的确定性条件\n\n选项:\n  --standards <path>  Standards Git 仓库路径（默认优先 ./standards，否则用 CLI 内置规范）\n  --profile <path>    项目 Profile（默认 ./engineering.yaml）\n  --output <path>     输出目录（默认 ./.ai）\n  --upgrade <sha>     显式锁定规范版本的完整 revision\n  --help              显示帮助`;

const commandOptions = {
  standards: { type: "string" },
  profile: { type: "string" },
  output: { type: "string" },
  upgrade: { type: "string" },
  help: { type: "boolean" },
} as const;

type CommandOptions =
  | { help: true }
  | { help: false; standards?: string; profile?: string; output?: string; upgrade?: string };

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
  if (command === "validate" && seen.has("upgrade")) {
    throw new Error("validate 命令不接受 --upgrade");
  }
  return {
    help: false,
    ...(typeof values.standards === "string" ? { standards: values.standards } : {}),
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

async function initCommand(options: CommandOptions): Promise<void> {
  if (options.help) throw new ConfigError("init 命令参数不完整");
  const profilePath = path.resolve(options.profile ?? "./engineering.yaml");
  try {
    await lstat(profilePath);
    throw new ConfigError(`Profile 文件已存在，未覆盖: ${profilePath}`);
  } catch (error) {
    if (error instanceof ConfigError) throw error;
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new ConfigError("eng init 需要交互式终端；请在终端中运行，或使用 --help 查看用法");
  }

  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  const askText = async (label: string, fallback = ""): Promise<string> => {
    const hint = fallback ? `（默认：${fallback}）` : "（回车跳过）";
    const answer = (await terminal.question(`${label}${hint}: `)).trim();
    return answer || fallback;
  };
  const askYesNo = async (label: string, fallback: boolean): Promise<boolean> => {
    const defaultLabel = fallback ? "Y/n" : "y/N";
    while (true) {
      const answer = (await terminal.question(`${label} [${defaultLabel}]: `)).trim().toLowerCase();
      if (!answer) return fallback;
      if (["y", "yes", "是"].includes(answer)) return true;
      if (["n", "no", "否"].includes(answer)) return false;
      process.stdout.write("请输入 y 或 n。\n");
    }
  };

  let profileData: Record<string, unknown>;
  try {
    const project: Record<string, string> = {
      name: await askText("项目名称", path.basename(process.cwd()) || "my-project"),
      type: await askText("项目类型（如 web-application、api-service、mobile-app）", "application"),
    };
    const scale = await askText("项目规模（如 small、medium、large）");
    if (scale) project.scale = scale;

    const capabilityOptions = [
      ["backend", "后端"],
      ["frontend", "前端"],
      ["database", "数据库"],
      ["ai", "AI"],
      ["cache", "缓存"],
      ["mq", "消息队列"],
      ["fileStorage", "文件存储"],
      ["apiDocumentation", "API 文档"],
      ["authorization", "身份认证与授权"],
    ] as const;
    process.stdout.write("\n需要哪些能力？输入序号，多个用逗号分隔；直接回车表示暂不选择：\n");
    capabilityOptions.forEach(([key, label], index) => process.stdout.write(`  ${index + 1}. ${label} (${key})\n`));
    let selected: number[] = [];
    while (true) {
      const answer = (await terminal.question("能力 [回车跳过]: ")).trim();
      if (!answer) break;
      const values = answer.split(/[,，\s]+/).filter(Boolean).map(Number);
      if (values.every((value) => Number.isInteger(value) && value >= 1 && value <= capabilityOptions.length)) {
        selected = [...new Set(values)];
        break;
      }
      process.stdout.write(`请输入 1 到 ${capabilityOptions.length} 之间的序号。\n`);
    }

    const capabilities = Object.fromEntries(
      selected.map((value) => [capabilityOptions[value - 1]![0], true]),
    );
    const stack: Record<string, unknown> = {};
    if (capabilities.backend) {
      const backend = {
        language: await askText("后端语言"),
        framework: await askText("后端框架"),
      };
      stack.backend = Object.fromEntries(Object.entries(backend).filter(([, value]) => value));
    }
    if (capabilities.frontend) {
      const frontend = {
        framework: await askText("前端框架"),
        uiLibrary: await askText("UI 组件库"),
        adminScaffold: await askText("管理后台脚手架"),
        cssFramework: await askText("CSS 框架"),
      };
      stack.frontend = Object.fromEntries(Object.entries(frontend).filter(([, value]) => value));
    }
    if (capabilities.database) {
      const database = {
        type: await askText("数据库类型"),
        migrationTool: await askText("数据库迁移工具"),
      };
      stack.database = Object.fromEntries(Object.entries(database).filter(([, value]) => value));
    }

    const deploymentType = await askText("部署类型（如 public、private、offline）");
    const deployment: Record<string, unknown> = {};
    if (deploymentType) {
      deployment.type = deploymentType;
      deployment.internetAccess = await askYesNo("部署环境是否可访问互联网？", deploymentType !== "offline");
    }
    const architecture = await askText("架构偏好（如 modular-monolith）");
    const simplicity = await askText("简洁性偏好（如 high、medium）");

    profileData = {
      project,
      ...(selected.length ? { capabilities } : {}),
      ...(Object.keys(stack).length ? { stack } : {}),
      ...(Object.keys(deployment).length ? { deployment } : {}),
      ...(architecture || simplicity
        ? { preferences: { ...(architecture ? { architecture } : {}), ...(simplicity ? { simplicity } : {}) } }
        : {}),
    };
  } finally {
    terminal.close();
  }

  const profile = stringify(parseProfile(profileData), { lineWidth: 0 });
  try {
    await writeFile(profilePath, profile, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new ConfigError(`Profile 文件已存在，未覆盖: ${profilePath}`);
    }
    throw error;
  }
  process.stdout.write(`\n已创建项目 Profile: ${profilePath}\n`);

  const followUp = createInterface({ input: process.stdin, output: process.stdout });
  try {
    while (true) {
      const answer = (await followUp.question("是否立即运行 eng resolve 生成规则？ [Y/n]: ")).trim().toLowerCase();
      if (!answer || ["y", "yes", "是"].includes(answer)) {
        await resolveCommand({ help: false, ...(options.profile ? { profile: options.profile } : {}) });
        break;
      }
      if (["n", "no", "否"].includes(answer)) {
        process.stdout.write("已跳过规则生成，之后可运行 eng resolve。\n");
        break;
      }
      process.stdout.write("请输入 y 或 n。\n");
    }
  } finally {
    followUp.close();
  }
}

async function resolveCommand(options: CommandOptions): Promise<void> {
  if (options.help) throw new ConfigError("resolve 命令参数不完整");
  const lock = path.join(process.cwd(), ".eng-resolve.lock");
  try {
    await mkdir(lock);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new ConfigError(`另一个 eng resolve 正在运行或留下了锁: ${lock}；确认没有运行中的进程后再删除此锁目录`);
    }
    throw error;
  }
  try {
    await writeFile(path.join(lock, "owner.json"), JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }), { flag: "wx" });
    await resolveUnlocked(options);
  } finally {
    await rm(lock, { recursive: true, force: true });
  }
}

async function resolveUnlocked(options: CommandOptions): Promise<void> {
  if (options.help) throw new ConfigError("resolve 命令参数不完整");
  const standards = await resolveStandardsSource(process.cwd(), options.standards);
  const standardsRoot = standards.root;
  const profilePath = path.resolve(options.profile ?? "./engineering.yaml");
  const outputRoot = path.resolve(options.output ?? "./.ai");
  const registryPath = await resolveRegularFileInside(standardsRoot, "registry.yaml");
  const revision = standards.revision;

  if (options.upgrade !== undefined && options.upgrade !== revision) {
    throw new ConfigError(`--upgrade 必须等于当前 Standards 来源的 revision: ${revision}`);
  }

  const profileContent = await readFile(profilePath, "utf8").catch((error: unknown) => {
    const detail = error instanceof Error ? error.message : String(error);
    throw new ConfigError(`${profilePath}: 无法读取 Profile: ${detail}`);
  });
  const registryContent = await readFile(registryPath, "utf8").catch((error: unknown) => {
    const detail = error instanceof Error ? error.message : String(error);
    throw new ConfigError(`${registryPath}: 无法读取 Registry: ${detail}`);
  });
  await standards.assertFileMatches("registry.yaml", registryContent);

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

  const resolvedFiles = await resolveRules(profile, registry, standards);
  const manifest = await createManifest({ registry, revision, profileContent, registryContent, resolvedFiles });
  const codexInstructions = await prepareCodexInstructions(process.cwd(), outputRoot, profile, resolvedFiles);
  try {
    await writeResolvedGeneration(outputRoot, resolvedFiles, manifest, codexInstructions);
  } finally {
    await codexInstructions.cleanup();
  }
  process.stdout.write(`已生成 ${resolvedFiles.length} 条规则文件，revision ${revision}\n`);
  process.stdout.write("已更新 AGENTS.md 中由 Engineering Harness 管理的区块（Codex 会读取）。\n");
  for (const warning of findUnsupportedStackValues(profile, registry)) {
    process.stdout.write(`WARN [profile] Profile 的 ${warning.path}="${warning.value}" 没有对应的 Registry 规则；该技术栈不会加载专项规则\n`);
  }
}

async function validateCommand(options: CommandOptions): Promise<void> {
  if (options.help) throw new ConfigError("validate 命令参数不完整");
  const projectRoot = process.cwd();
  const standards = await resolveStandardsSource(process.cwd(), options.standards);
  const profilePath = path.resolve(options.profile ?? "./engineering.yaml");
  const outputRoot = path.resolve(options.output ?? "./.ai");
  const report = await validateProject(projectRoot, standards, profilePath, outputRoot);
  for (const warning of report.profileWarnings ?? []) {
    process.stdout.write(`WARN [profile] ${warning}\n`);
  }
  for (const result of report.results) {
    const marker =
      result.status === "unknown"
        ? "UNKNOWN"
        : result.status === "pass"
          ? "PASS"
          : result.level === "mandatory"
            ? "FAIL"
            : result.level === "recommended"
              ? "WARN"
              : "INFO";
    process.stdout.write(
      `${marker} [${result.level}] ${result.ruleId} ${result.type} ${result.path ?? "-"} actual=${JSON.stringify(result.actual)} expected=${JSON.stringify(result.expected)} — ${result.reason}\n`,
    );
  }
  const exitCode = exitCodeFor(report);
  process.stdout.write(`${formatValidationSummary(report)}\n`);
  process.stdout.write(`命令退出码：${exitCode}\n`);
  process.exitCode = exitCode;
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (command === undefined || command === "--help" || command === "-h") {
    process.stdout.write(`${usage}\n`);
    return;
  }
  if (command !== "init" && command !== "resolve" && command !== "validate") {
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
    if (command === "init") {
      if (options.standards !== undefined || options.output !== undefined || options.upgrade !== undefined) {
        throw new ConfigError("init 命令只接受 --profile 和 --help");
      }
      await initCommand(options);
      return;
    }
    await validateCommand(options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n\n${usage}\n`);
    process.exitCode = 2;
  }
}

await main();

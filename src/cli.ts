#!/usr/bin/env node
import { parseArgs } from "node:util";

const usage = `Engineering Harness\n\n用法:\n  eng <命令> [选项]\n\n命令:\n  resolve    解析并生成项目规则\n  validate   校验已生成规则和项目约束\n\n选项:\n  --standards <path>  Standards Repository 本地路径\n  --profile <path>    项目 Profile（默认 ./engineering.yaml）\n  --output <path>     输出目录（默认 ./.ai）\n  --upgrade <sha>     显式锁定本地 Standards HEAD\n  --help              显示帮助`;

const commandOptions = {
  standards: { type: "string" },
  profile: { type: "string" },
  output: { type: "string" },
  upgrade: { type: "string" },
  help: { type: "boolean" },
} as const;

function parseOptions(command: string, args: string[]): void {
  const { tokens } = parseArgs({
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

  if (seen.has("help")) {
    process.stdout.write(`${usage}\n`);
    return;
  }
  if (!seen.has("standards")) throw new Error(`${command} 命令必须提供 --standards <path>`);
  if (command === "validate" && seen.has("upgrade")) {
    throw new Error("validate 命令不接受 --upgrade");
  }
  throw new Error(`${command} 命令尚未完成初始化`);
}

function main(): void {
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
    parseOptions(command, args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n\n${usage}\n`);
    process.exitCode = 2;
  }
}

main();

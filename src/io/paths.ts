import { lstat, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { ConfigError } from "../config/load.js";

export interface MarkdownSource {
  absolutePath: string;
  relativePath: string;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

export function validateRelativePath(value: string, label: string): string {
  if (value.length === 0 || value.includes("\\") || path.isAbsolute(value) || path.win32.isAbsolute(value)) {
    throw new ConfigError(`${label}: 必须是非空的相对路径`);
  }
  const parts = value.split("/");
  if (parts.some((part) => part === ".." || part === "." || part.length === 0)) {
    throw new ConfigError(`${label}: 不允许 .、.. 或空路径片段`);
  }
  return parts.join("/");
}

async function ensureNoSymlinkComponents(root: string, relative: string): Promise<string> {
  const canonicalRoot = await realpath(root);
  let current = canonicalRoot;
  for (const part of relative.split("/")) {
    current = path.join(current, part);
    let stat;
    try {
      stat = await lstat(current);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") throw new ConfigError(`规则路径不存在: ${relative}`);
      throw error;
    }
    if (stat.isSymbolicLink()) throw new ConfigError(`规则路径不允许经过符号链接: ${relative}`);
  }
  if (!isWithin(canonicalRoot, current)) throw new ConfigError(`规则路径越出 Standards Repository: ${relative}`);
  return current;
}

export async function resolveRegularFileInside(root: string, relative: string): Promise<string> {
  const safePath = validateRelativePath(relative, "Standards 文件路径");
  const absolutePath = await ensureNoSymlinkComponents(root, safePath);
  const stat = await lstat(absolutePath);
  if (!stat.isFile()) throw new ConfigError(`Standards 路径必须是普通文件: ${safePath}`);
  return absolutePath;
}

export async function collectMarkdownFiles(standardsRoot: string, requestedPath: string): Promise<MarkdownSource[]> {
  const safePath = validateRelativePath(requestedPath, "Registry 规则 path");
  const absolutePath = await ensureNoSymlinkComponents(standardsRoot, safePath);
  const root = await realpath(standardsRoot);
  const output: MarkdownSource[] = [];

  async function walk(current: string): Promise<void> {
    const stat = await lstat(current);
    if (stat.isSymbolicLink()) throw new ConfigError(`规则目录不允许包含符号链接: ${current}`);
    if (stat.isFile()) {
      if (!current.toLowerCase().endsWith(".md")) {
        throw new ConfigError(`规则文件必须使用 .md 扩展名: ${current}`);
      }
      const relativePath = path.relative(root, current).split(path.sep).join("/");
      if (!isWithin(root, current)) throw new ConfigError(`规则文件越出 Standards Repository: ${relativePath}`);
      output.push({ absolutePath: current, relativePath });
      return;
    }
    if (!stat.isDirectory()) throw new ConfigError(`规则路径必须是文件或目录: ${current}`);

    const entries = await readdir(current, { withFileTypes: true });
    entries.sort((a, b) => compareText(a.name, b.name));
    for (const entry of entries) {
      const child = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw new ConfigError(`规则目录不允许包含符号链接: ${child}`);
      if (entry.isDirectory()) await walk(child);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) await walk(child);
    }
  }

  await walk(absolutePath);
  if (output.length === 0) throw new ConfigError(`规则路径没有包含 Markdown 文件: ${safePath}`);
  return output.sort((a, b) => compareText(a.relativePath, b.relativePath));
}

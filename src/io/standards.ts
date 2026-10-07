import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ConfigError } from "../config/load.js";
import { sha256 } from "../manifest/hash.js";
import { assertGitFileMatchesHead, getGitHead } from "./git.js";

interface StandardsLock {
  formatVersion: 1;
  revision: string;
  files: Record<string, string>;
}

export interface StandardsSource {
  root: string;
  revision: string;
  assertFileMatches(relativePath: string, content: string): Promise<void>;
}

async function isGitCheckout(root: string): Promise<boolean> {
  try {
    const stat = await lstat(path.join(root, ".git"));
    return stat.isFile() || stat.isDirectory();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function gitSource(root: string): Promise<StandardsSource> {
  const revision = await getGitHead(root);
  return {
    root,
    revision,
    assertFileMatches: (relativePath, content) => assertGitFileMatchesHead(root, revision, relativePath, content),
  };
}

async function readStandardsLock(root: string): Promise<StandardsLock> {
  const lockPath = path.join(root, "standards.lock.json");
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(lockPath, "utf8"));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new ConfigError(`CLI 内置规范缺少有效的 standards.lock.json: ${detail}`);
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ConfigError("CLI 内置规范锁文件必须是 JSON 对象");
  }
  const value = parsed as Record<string, unknown>;
  if (
    value.formatVersion !== 1 ||
    typeof value.revision !== "string" ||
    !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value.revision) ||
    value.files === null ||
    typeof value.files !== "object" ||
    Array.isArray(value.files)
  ) {
    throw new ConfigError("CLI 内置规范锁文件格式错误");
  }
  const files: Record<string, string> = {};
  for (const [filePath, digest] of Object.entries(value.files)) {
    if (typeof digest !== "string" || !/^[a-f0-9]{64}$/.test(digest)) {
      throw new ConfigError(`CLI 内置规范锁文件包含无效摘要: ${filePath}`);
    }
    files[filePath] = digest;
  }
  if (!Object.hasOwn(files, "registry.yaml")) {
    throw new ConfigError("CLI 内置规范锁文件没有锁定 registry.yaml");
  }
  return { formatVersion: 1, revision: value.revision, files };
}

async function bundledSource(root: string): Promise<StandardsSource> {
  const lock = await readStandardsLock(root);
  return {
    root,
    revision: lock.revision,
    async assertFileMatches(relativePath, content) {
      const expected = lock.files[relativePath];
      if (expected === undefined || sha256(content) !== expected) {
        throw new ConfigError(`CLI 内置规范文件与包内锁定摘要不一致: ${relativePath}`);
      }
    },
  };
}

export async function resolveStandardsSource(
  projectRoot: string,
  explicitPath?: string,
): Promise<StandardsSource> {
  if (explicitPath !== undefined) {
    return gitSource(path.resolve(projectRoot, explicitPath));
  }

  const localRoot = path.resolve(projectRoot, "standards");
  if (await isGitCheckout(localRoot)) return gitSource(localRoot);

  const packagedRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../standards");
  return bundledSource(packagedRoot);
}

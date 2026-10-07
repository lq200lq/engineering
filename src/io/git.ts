import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { ConfigError } from "../config/load.js";

const execFile = promisify(execFileCallback);

export async function getGitMarkdownPaths(standardsRoot: string, revision: string): Promise<string[]> {
  try {
    const { stdout } = await execFile("git", ["-C", standardsRoot, "ls-tree", "-r", "--name-only", "-z", revision], {
      encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
    });
    return stdout.split("\0").filter((file) => file.toLowerCase().endsWith(".md"));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new ConfigError(`无法读取 Standards ${revision} 的文件清单: ${detail}`);
  }
}

export async function getGitHead(standardsRoot: string): Promise<string> {
  try {
    const { stdout } = await execFile("git", ["-C", standardsRoot, "rev-parse", "--verify", "HEAD"]);
    const sha = stdout.trim();
    if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(sha)) {
      throw new ConfigError(`Standards Repository 返回了无效的 Git revision: ${sha}`);
    }
    return sha;
  } catch (error) {
    if (error instanceof ConfigError) throw error;
    const detail = error instanceof Error ? error.message : String(error);
    throw new ConfigError(`无法读取 Standards Repository 的 HEAD: ${detail}`);
  }
}

export async function assertGitFileMatchesHead(
  standardsRoot: string,
  revision: string,
  relativePath: string,
  workingContent: string,
): Promise<void> {
  try {
    const { stdout } = await execFile(
      "git",
      ["-C", standardsRoot, "show", `${revision}:${relativePath}`],
      { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
    );
    if (stdout !== workingContent) {
      throw new ConfigError(`Standards 文件与 HEAD ${revision} 不一致，请先提交或切换到已提交版本: ${relativePath}`);
    }
  } catch (error) {
    if (error instanceof ConfigError) throw error;
    const detail = error instanceof Error ? error.message : String(error);
    throw new ConfigError(`无法从 Standards HEAD ${revision} 读取文件 ${relativePath}: ${detail}`);
  }
}

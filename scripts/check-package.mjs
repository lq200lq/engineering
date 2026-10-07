import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standardsRoot = path.join(packageRoot, "dist", "standards");
const lockPath = path.join(standardsRoot, "standards.lock.json");
const lock = JSON.parse(await readFile(lockPath, "utf8"));

if (lock.formatVersion !== 1 || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(lock.revision)) {
  throw new Error("打包规范锁文件的格式或 revision 无效");
}
if (lock.files === null || typeof lock.files !== "object" || Array.isArray(lock.files)) {
  throw new Error("打包规范锁文件缺少 files 映射");
}

for (const [relativePath, expectedDigest] of Object.entries(lock.files)) {
  const content = await readFile(path.join(standardsRoot, ...relativePath.split("/")));
  const actualDigest = createHash("sha256").update(content).digest("hex");
  if (actualDigest !== expectedDigest) throw new Error(`打包规范文件摘要不匹配: ${relativePath}`);
}
if (!Object.hasOwn(lock.files, "registry.yaml")) throw new Error("打包规范锁文件没有 registry.yaml");

const packed = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
  cwd: packageRoot,
  encoding: "utf8",
}));
if (!Array.isArray(packed) || packed.length !== 1 || !Array.isArray(packed[0].files)) {
  throw new Error("无法读取 npm pack --dry-run 的文件清单");
}

const files = new Set(packed[0].files.map(({ path: relativePath }) => relativePath));
for (const required of ["dist/cli.js", "dist/standards/registry.yaml", "dist/standards/standards.lock.json", "README.md", "LICENSE"]) {
  if (!files.has(required)) throw new Error(`npm 包缺少必需文件: ${required}`);
}
for (const relativePath of files) {
  if (/^(?:src|test|docs|standards|\.github)\//.test(relativePath) || relativePath === "AGENTS.md") {
    throw new Error(`npm 包包含仓库开发文件: ${relativePath}`);
  }
}

process.stdout.write(`npm 包校验通过：${files.size} 个文件，规范 revision ${lock.revision}\n`);

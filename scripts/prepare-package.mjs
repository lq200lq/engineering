import { execFileSync } from "node:child_process";
import { copyFile, lstat, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standardsRoot = path.join(packageRoot, "standards");
const outputRoot = path.join(packageRoot, "dist", "standards");

const revision = execFileSync("git", ["-C", standardsRoot, "rev-parse", "--verify", "HEAD"], { encoding: "utf8" }).trim();
if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(revision)) {
  throw new Error(`Standards submodule returned an invalid Git revision: ${revision}`);
}
const status = execFileSync("git", ["-C", standardsRoot, "status", "--porcelain", "--untracked-files=all"], {
  encoding: "utf8",
});
if (status.trim().length > 0) {
  throw new Error("Standards submodule must be clean before packaging; commit its changes first.");
}

async function copyTree(source, destination) {
  const stat = await lstat(source);
  if (stat.isSymbolicLink()) throw new Error(`Standards package cannot contain symlinks: ${source}`);
  if (stat.isDirectory()) {
    await mkdir(destination, { recursive: true });
    for (const entry of await readdir(source)) {
      if (entry === ".git") continue;
      await copyTree(path.join(source, entry), path.join(destination, entry));
    }
    return;
  }
  if (!stat.isFile()) throw new Error(`Standards package can only contain regular files: ${source}`);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(source, destination);
}

async function listFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory)) {
    const absolute = path.join(directory, entry);
    const stat = await lstat(absolute);
    if (stat.isDirectory()) files.push(...(await listFiles(absolute)));
    else if (stat.isFile()) files.push(absolute);
    else throw new Error(`Unexpected file type in packaged standards: ${absolute}`);
  }
  return files.sort((a, b) => a.localeCompare(b, "en"));
}

await rm(outputRoot, { recursive: true, force: true });
await copyTree(standardsRoot, outputRoot);

const files = {};
for (const absolute of await listFiles(outputRoot)) {
  const relative = path.relative(outputRoot, absolute).split(path.sep).join("/");
  const digest = createHash("sha256").update(await readFile(absolute)).digest("hex");
  files[relative] = digest;
}
await writeFile(
  path.join(outputRoot, "standards.lock.json"),
  `${JSON.stringify({ formatVersion: 1, revision, files }, null, 2)}\n`,
  "utf8",
);

process.stdout.write(`Packaged standards revision ${revision} (${Object.keys(files).length} files)\n`);

import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { buildCodexManagedSection, extractCodexManagedSection, mergeCodexManagedSection, validateCodexInstructions, writeCodexInstructions } from "../dist/io/codex-adapter.js";

const profile = {
  project: { name: "sample", type: "service", scale: "small" },
  preferences: { architecture: "modular-monolith", simplicity: "high" },
};
const cli = path.resolve("dist/cli.js");
const standards = path.resolve("standards");

const files = [
  {
    ruleId: "backend",
    sourcePath: "capabilities/backend.md",
    sourceSha256: "a".repeat(64),
    destinationPath: "resolved/capabilities/backend.md",
    content: "# Backend\nKeep boundaries clear.\n",
  },
];

test("buildCodexManagedSection includes project context and resolved rules", () => {
  const section = buildCodexManagedSection(profile, files, ".ai");
  assert.match(section, /project\.name = "sample"/);
  assert.match(section, /preferences\.architecture = "modular-monolith"/);
  assert.match(section, /\.ai\/resolved\/capabilities\/backend\.md/);
  assert.match(section, /开始修改前，先读取下面列出的每个规则文件/);
  assert.match(section, /<!-- BEGIN ENGINEERING HARNESS MANAGED SECTION -->/);
  assert.match(section, /<!-- END ENGINEERING HARNESS MANAGED SECTION -->/);
});

test("mergeCodexManagedSection preserves user instructions and replaces only the managed section", () => {
  const existing = "# My project\n\nUse the existing formatter.\n";
  const firstBlock = buildCodexManagedSection(profile, [{ ...files[0], destinationPath: "resolved/rules-v1.md" }], ".ai");
  const secondBlock = buildCodexManagedSection(profile, [{ ...files[0], destinationPath: "resolved/rules-v2.md" }], ".ai");
  const first = mergeCodexManagedSection(existing, firstBlock);
  const updated = mergeCodexManagedSection(first, secondBlock);

  assert.match(updated, /^# My project\n\nUse the existing formatter\./);
  assert.match(updated, /rules-v2\.md/);
  assert.doesNotMatch(updated, /rules-v1\.md/);
  assert.equal(extractCodexManagedSection(updated), secondBlock);
});

test("mergeCodexManagedSection rejects malformed or repeated markers", () => {
  const validBlock = buildCodexManagedSection(profile, files, ".ai");
  assert.throws(() => mergeCodexManagedSection("<!-- BEGIN ENGINEERING HARNESS MANAGED SECTION -->", validBlock), /标记/);
  assert.throws(
    () => mergeCodexManagedSection("<!-- BEGIN ENGINEERING HARNESS MANAGED SECTION -->old<!-- END ENGINEERING HARNESS MANAGED SECTION -->\n<!-- BEGIN ENGINEERING HARNESS MANAGED SECTION -->old<!-- END ENGINEERING HARNESS MANAGED SECTION -->", validBlock),
    /标记/,
  );
});

test("writeCodexInstructions creates and updates AGENTS.md without removing user content", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "eng-codex-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const agentsPath = path.join(root, "AGENTS.md");
  await writeFile(agentsPath, "# Project guidance\n\nUse the existing formatter.\n");

  await writeCodexInstructions(root, path.join(root, ".ai"), profile, files);
  await validateCodexInstructions(root, path.join(root, ".ai"), profile, files);
  await writeCodexInstructions(root, path.join(root, ".ai"), profile, [{ ...files[0], destinationPath: "resolved/updated.md" }]);
  const contents = await readFile(agentsPath, "utf8");

  assert.match(contents, /Use the existing formatter\./);
  assert.match(contents, /\.ai\/resolved\/updated\.md/);
  await assert.rejects(
    validateCodexInstructions(root, path.join(root, ".ai"), profile, [{ ...files[0], destinationPath: "resolved/previous.md" }]),
    /缺失或已过期/,
  );
});

test("writeCodexInstructions preserves the mode of an existing AGENTS.md", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "eng-codex-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const agentsPath = path.join(root, "AGENTS.md");
  await writeFile(agentsPath, "# Private guidance\n");
  await chmod(agentsPath, 0o600);

  await writeCodexInstructions(root, path.join(root, ".ai"), profile, files);

  assert.equal((await stat(agentsPath)).mode & 0o777, 0o600);
});

test("writeCodexInstructions refuses to replace a symlinked AGENTS.md", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "eng-codex-"));
  const outside = await mkdtemp(path.join(os.tmpdir(), "eng-codex-outside-"));
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });
  const externalFile = path.join(outside, "instructions.md");
  await writeFile(externalFile, "Do not replace me.\n");
  await symlink(externalFile, path.join(root, "AGENTS.md"));

  await assert.rejects(writeCodexInstructions(root, path.join(root, ".ai"), profile, files), /不能是符号链接/);
  assert.equal(await readFile(externalFile, "utf8"), "Do not replace me.\n");
});

test("CLI resolve installs Codex rules and validate reports the actual guarantee", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "eng-codex-cli-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, "engineering.yaml"), [
    "project:",
    "  name: sample-web",
    "  type: web-application",
    "capabilities:",
    "  frontend: true",
    "stack:",
    "  frontend:",
    "    framework: react",
    "preferences:",
    "  simplicity: high",
    "",
  ].join("\n"));
  await writeFile(path.join(root, "AGENTS.md"), "# Local guidance\n\nKeep the existing style.\n");

  const resolve = spawnSync(process.execPath, [cli, "resolve", "--standards", standards], { cwd: root, encoding: "utf8" });
  assert.equal(resolve.status, 0, resolve.stderr);
  assert.match(resolve.stdout, /更新 AGENTS\.md/);
  assert.match(resolve.stdout, /stack\.frontend\.framework="react" 没有对应的 Registry 规则/);
  const agents = await readFile(path.join(root, "AGENTS.md"), "utf8");
  assert.match(agents, /Keep the existing style\./);
  assert.match(agents, /stack\.frontend\.framework = "react"/);
  assert.match(agents, /\.ai\/resolved\/\d+-constitution\/constitution\/simple-first\.md/);

  const validate = spawnSync(process.execPath, [cli, "validate", "--standards", standards], { cwd: root, encoding: "utf8" });
  assert.equal(validate.status, 0, validate.stderr);
  assert.match(validate.stdout, /stack\.frontend\.framework="react" 没有对应的 Registry 规则/);
  assert.match(validate.stdout, /不判断 Markdown 自然语言规则是否已遵守/);
  assert.match(validate.stdout, /recommended 失败 1/);
});

test("CLI resolve rejects a symlinked AGENTS.md before publishing generated rules", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "eng-codex-cli-"));
  const outside = await mkdtemp(path.join(os.tmpdir(), "eng-codex-cli-outside-"));
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });
  await writeFile(path.join(root, "engineering.yaml"), "project:\n  name: sample\n  type: app\n");
  const outsideFile = path.join(outside, "AGENTS.md");
  await writeFile(outsideFile, "External instructions.\n");
  await symlink(outsideFile, path.join(root, "AGENTS.md"));

  const resolve = spawnSync(process.execPath, [cli, "resolve", "--standards", standards], { cwd: root, encoding: "utf8" });
  assert.equal(resolve.status, 2);
  assert.match(resolve.stderr, /不能是符号链接/);
  await assert.rejects(readFile(path.join(root, ".ai", "manifest.yaml")), { code: "ENOENT" });
  assert.equal(await readFile(outsideFile, "utf8"), "External instructions.\n");
});

for (const initial of [undefined, "", "Original guidance\n"]) {
  test(`prepared instructions preserve concurrent changes (initial=${JSON.stringify(initial)})`, async (t) => {
    const { prepareCodexInstructions } = await import("../dist/io/codex-adapter.js");
    const root = await mkdtemp(path.join(os.tmpdir(), "eng-agents-edit-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    const target = path.join(root, "AGENTS.md");
    if (initial !== undefined) await writeFile(target, initial);
    const prepared = await prepareCodexInstructions(root, path.join(root, ".ai"), profile, files);
    t.after(() => prepared.cleanup());
    await writeFile(target, "New human instructions\n");
    await assert.rejects(prepared.publish(), /准备后发生变化/);
    assert.equal(await readFile(target, "utf8"), "New human instructions\n");
  });
}

test("prepared instructions refuse a symlink introduced before publication", async (t) => {
  const { prepareCodexInstructions } = await import("../dist/io/codex-adapter.js");
  const root = await mkdtemp(path.join(os.tmpdir(), "eng-agents-edit-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const prepared = await prepareCodexInstructions(root, path.join(root, ".ai"), profile, files);
  t.after(() => prepared.cleanup());
  await writeFile(path.join(root, "external.md"), "Keep me\n");
  await symlink(path.join(root, "external.md"), path.join(root, "AGENTS.md"));
  await assert.rejects(prepared.publish(), /符号链接/);
  assert.equal(await readFile(path.join(root, "external.md"), "utf8"), "Keep me\n");
});

test("CLI resolve refuses an occupied project lock and succeeds after release", async (t) => {
  const { mkdir, readdir } = await import("node:fs/promises");
  const root = await mkdtemp(path.join(os.tmpdir(), "eng-resolve-lock-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, "engineering.yaml"), "project: { name: sample, type: service }\n");
  const lock = path.join(root, ".eng-resolve.lock");
  await mkdir(lock);
  const blocked = spawnSync(process.execPath, [cli, "resolve", "--standards", standards], { cwd: root, encoding: "utf8" });
  assert.equal(blocked.status, 2);
  assert.match(blocked.stderr, /另一个 eng resolve/);
  await assert.rejects(readFile(path.join(root, ".ai/manifest.yaml")), { code: "ENOENT" });
  await rm(lock, { recursive: true });
  const success = spawnSync(process.execPath, [cli, "resolve", "--standards", standards], { cwd: root, encoding: "utf8" });
  assert.equal(success.status, 0, success.stderr);
  assert.equal((await readdir(root)).includes(".eng-resolve.lock"), false);
});

test("CLI resolve releases its lock after an invalid profile", async (t) => {
  const { readdir } = await import("node:fs/promises");
  const root = await mkdtemp(path.join(os.tmpdir(), "eng-resolve-lock-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, "engineering.yaml"), "unexpected: true\n");
  const failed = spawnSync(process.execPath, [cli, "resolve", "--standards", standards], { cwd: root, encoding: "utf8" });
  assert.equal(failed.status, 2);
  assert.equal((await readdir(root)).includes(".eng-resolve.lock"), false);
});

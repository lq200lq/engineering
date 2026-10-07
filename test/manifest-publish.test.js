import assert from "node:assert/strict";
import { lstat, mkdtemp, readFile, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ConfigError } from "../dist/config/load.js";
import { writeResolvedGeneration } from "../dist/io/publish.js";
import { createManifest } from "../dist/manifest/manifest.js";
import { sha256 } from "../dist/manifest/hash.js";
import { profile, registry, rule } from "./helpers.js";

const revision = "a".repeat(40);

function resolved(content = "# Rule\n") {
  return [{
    ruleId: "base",
    sourcePath: "base.md",
    sourceSha256: sha256(content),
    destinationPath: "resolved/000-base/base.md",
    content,
  }];
}

async function makeManifest(files = resolved()) {
  return createManifest({
    registry: registry({ base: rule("base") }),
    revision,
    profileContent: "project: { name: sample, type: service }\n",
    registryContent: "registry\n",
    resolvedFiles: files,
  });
}

test("createManifest changes generated digest when rule content changes", async () => {
  const first = await makeManifest(resolved("first\n"));
  const second = await makeManifest(resolved("second\n"));
  assert.notEqual(first.generatedSha256, second.generatedSha256);
});

test("writeResolvedGeneration publishes manifest and rule files", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "eng-publish-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const files = resolved();
  await writeResolvedGeneration(root, files, await makeManifest(files));
  assert.equal(await readFile(path.join(root, "resolved/000-base/base.md"), "utf8"), "# Rule\n");
  assert.match(await readFile(path.join(root, "manifest.yaml"), "utf8"), /generatedSha256/);
});

test("failed generation validation leaves the previous output intact", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "eng-publish-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const previous = resolved("previous\n");
  const previousManifest = await makeManifest(previous);
  await writeResolvedGeneration(root, previous, previousManifest);
  const manifestBefore = await readFile(path.join(root, "manifest.yaml"), "utf8");
  const invalid = resolved("new\n");
  await assert.rejects(writeResolvedGeneration(root, invalid, previousManifest), ConfigError);
  assert.equal(await readFile(path.join(root, "resolved/000-base/base.md"), "utf8"), "previous\n");
  assert.equal(await readFile(path.join(root, "manifest.yaml"), "utf8"), manifestBefore);
});

test("writeResolvedGeneration rejects symlink targets without replacing them", async (t) => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "eng-publish-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const root = path.join(parent, "output");
  await mkdir(root);
  const external = path.join(parent, "external");
  await mkdir(external);
  await writeFile(path.join(external, "preserve.md"), "safe\n");
  await import("node:fs/promises").then(({ symlink }) => symlink(external, path.join(root, "resolved")));
  await assert.rejects(writeResolvedGeneration(root, resolved(), await makeManifest()), /符号链接/);
  assert.equal((await lstat(path.join(root, "resolved"))).isSymbolicLink(), true);
  assert.equal(await readFile(path.join(external, "preserve.md"), "utf8"), "safe\n");
});

for (const hasPrevious of [false, true]) {
  test(`AGENTS publication failure rolls back generation (previous=${hasPrevious})`, async (t) => {
    const { prepareCodexInstructions } = await import("../dist/io/codex-adapter.js");
    const root = await mkdtemp(path.join(os.tmpdir(), "eng-transaction-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    const output = path.join(root, ".ai");
    let manifestBefore;
    if (hasPrevious) {
      const oldFiles = resolved("previous\n");
      await writeResolvedGeneration(output, oldFiles, await makeManifest(oldFiles));
      manifestBefore = await readFile(path.join(output, "manifest.yaml"), "utf8");
    }
    await writeFile(path.join(root, "AGENTS.md"), "Previous instructions\n");
    const next = resolved("new\n");
    const prepared = await prepareCodexInstructions(root, output, profile(), next);
    t.after(() => prepared.cleanup());
    // A directory cannot be replaced by the staged regular file: real rename failure.
    await rm(path.join(root, "AGENTS.md"));
    await mkdir(path.join(root, "AGENTS.md"));
    await assert.rejects(writeResolvedGeneration(output, next, await makeManifest(next), prepared));
    if (hasPrevious) {
      assert.equal(await readFile(path.join(output, "resolved/000-base/base.md"), "utf8"), "previous\n");
      assert.equal(await readFile(path.join(output, "manifest.yaml"), "utf8"), manifestBefore);
    } else {
      await assert.rejects(lstat(path.join(output, "resolved")), { code: "ENOENT" });
      await assert.rejects(lstat(path.join(output, "manifest.yaml")), { code: "ENOENT" });
    }
    assert.equal((await lstat(path.join(root, "AGENTS.md"))).isDirectory(), true);
  });
}

test("successful generation publishes matching instructions and removes backups", async (t) => {
  const { prepareCodexInstructions, validateCodexInstructions } = await import("../dist/io/codex-adapter.js");
  const { readdir } = await import("node:fs/promises");
  const root = await mkdtemp(path.join(os.tmpdir(), "eng-transaction-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const output = path.join(root, ".ai");
  const oldFiles = resolved("previous\n");
  await writeResolvedGeneration(output, oldFiles, await makeManifest(oldFiles));
  await writeFile(path.join(root, "AGENTS.md"), "Human guidance\n");
  const next = resolved("new\n");
  const prepared = await prepareCodexInstructions(root, output, profile(), next);
  try {
    await writeResolvedGeneration(output, next, await makeManifest(next), prepared);
  } finally {
    await prepared.cleanup();
  }
  assert.equal(await readFile(path.join(output, "resolved/000-base/base.md"), "utf8"), "new\n");
  assert.match(await readFile(path.join(root, "AGENTS.md"), "utf8"), /Human guidance/);
  await validateCodexInstructions(root, output, profile(), next);
  assert.deepEqual((await readdir(root)).sort(), [".ai", "AGENTS.md"]);
});

for (const hasPrevious of [false, true]) {
  test(`rename failure restores generation and preserves old instructions (previous=${hasPrevious})`, async (t) => {
    const { prepareCodexInstructions } = await import("../dist/io/codex-adapter.js");
    const { readdir } = await import("node:fs/promises");
    const root = await mkdtemp(path.join(os.tmpdir(), "eng-rename-failure-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    const output = path.join(root, ".ai");
    let manifestBefore;
    if (hasPrevious) {
      const previous = resolved("previous\n");
      await writeResolvedGeneration(output, previous, await makeManifest(previous));
      manifestBefore = await readFile(path.join(output, "manifest.yaml"), "utf8");
    }
    await writeFile(path.join(root, "AGENTS.md"), "Old human guidance\n");
    const next = resolved("next\n");
    const prepared = await prepareCodexInstructions(root, output, profile(), next);
    t.after(() => prepared.cleanup());
    // Remove the staged source to force rename itself to fail after the target check.
    const stage = (await readdir(root)).find((entry) => entry.startsWith(".eng-agents-stage-"));
    assert.ok(stage);
    await rm(path.join(root, stage, "AGENTS.md"));
    await assert.rejects(writeResolvedGeneration(output, next, await makeManifest(next), prepared), { code: "ENOENT" });
    assert.equal(await readFile(path.join(root, "AGENTS.md"), "utf8"), "Old human guidance\n");
    if (hasPrevious) {
      assert.equal(await readFile(path.join(output, "manifest.yaml"), "utf8"), manifestBefore);
      assert.equal(await readFile(path.join(output, "resolved/000-base/base.md"), "utf8"), "previous\n");
    } else {
      await assert.rejects(lstat(path.join(output, "manifest.yaml")), { code: "ENOENT" });
      await assert.rejects(lstat(path.join(output, "resolved")), { code: "ENOENT" });
    }
  });
}

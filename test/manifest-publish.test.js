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

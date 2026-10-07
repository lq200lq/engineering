import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { stringify } from "yaml";
import { exitCodeFor, runChecks } from "../dist/validator/checks.js";
import { validateGeneratedState } from "../dist/validator/run.js";
import { createManifest } from "../dist/manifest/manifest.js";
import { formatValidationSummary } from "../dist/validator/summary.js";
import { profile, registry, rule } from "./helpers.js";

const cli = path.resolve("dist/cli.js");

test("runChecks records mandatory failures and maps them to exit code 1", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "eng-checks-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const checks = registry({ base: rule("base", {
    checks: [{ type: "file_exists", level: "mandatory", pattern: "README.md" }],
  }) });
  const report = await runChecks(root, checks, profile());
  assert.equal(report.results[0].status, "fail");
  assert.equal(exitCodeFor(report), 1);
});

test("runChecks reports unknown dependency results with exit code 3", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "eng-checks-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const checks = registry({ base: rule("base", {
    checks: [{ type: "dependency_present", level: "mandatory", name: "typescript" }],
  }) });
  const report = await runChecks(root, checks, profile());
  assert.equal(report.results[0].status, "unknown");
  assert.equal(exitCodeFor(report), 3);
});

test("mandatory failures take precedence over unknown results", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "eng-checks-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const checks = registry({ base: rule("base", {
    checks: [
      { type: "file_exists", level: "mandatory", pattern: "README.md" },
      { type: "dependency_present", level: "mandatory", name: "typescript" },
    ],
  }) });
  const report = await runChecks(root, checks, profile());
  assert.deepEqual(report.results.map(({ status }) => status), ["fail", "unknown"]);
  assert.equal(exitCodeFor(report), 1);
});

test("validateGeneratedState rejects a stale standards revision", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "eng-stale-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const inputProfile = profile();
  const inputRegistry = registry({ base: rule("base") });
  const manifest = await createManifest({
    registry: inputRegistry,
    revision: "a".repeat(40),
    profileContent: "profile\n",
    registryContent: "registry\n",
    resolvedFiles: [],
  });
  await writeFile(path.join(root, "manifest.yaml"), stringify(manifest));
  const standards = { root, revision: "b".repeat(40), async assertFileMatches() {} };
  await assert.rejects(
    validateGeneratedState(standards, "profile\n", "registry\n", inputProfile, inputRegistry, root),
    /Manifest revision 已过期/,
  );
});

test("runChecks treats a declared dependency as a pass", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "eng-checks-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, "package.json"), JSON.stringify({ devDependencies: { typescript: "^7.0.0" } }));
  const checks = registry({ base: rule("base", {
    checks: [{ type: "dependency_present", level: "mandatory", name: "typescript" }],
  }) });
  const report = await runChecks(root, checks, profile());
  assert.equal(report.results[0].status, "pass");
  assert.equal(exitCodeFor(report), 0);
});

test("runChecks warns when a profile stack value has no registered rule", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "eng-checks-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const inputProfile = profile({ stack: { frontend: { framework: "react" } } });
  const inputRegistry = registry({ vue: rule("vue", { when: { "stack.frontend.framework": "vue" } }) });
  const report = await runChecks(root, inputRegistry, inputProfile);
  assert.deepEqual(report.profileWarnings, [
    'Profile 的 stack.frontend.framework="react" 没有对应的 Registry 规则；该技术栈不会加载专项规则',
  ]);
  assert.equal(exitCodeFor(report), 0);
});

test("formatValidationSummary states the scope and does not imply semantic rule compliance", () => {
  const summary = formatValidationSummary({
    results: [
      { ruleId: "docs", level: "recommended", type: "file_exists", status: "fail", path: "README.md", actual: null, expected: "at least one", reason: "missing" },
      { ruleId: "deps", level: "mandatory", type: "dependency_present", status: "unknown", path: "package.json", actual: null, expected: true, reason: "invalid JSON" },
    ],
  });
  assert.match(summary, /不判断 Markdown 自然语言规则是否已遵守/);
  assert.match(summary, /mandatory 失败 0/);
  assert.match(summary, /recommended 失败 1/);
  assert.match(summary, /无法判断 1/);
});

test("CLI prints help and rejects unknown commands with exit code 2", () => {
  const help = spawnSync(process.execPath, [cli, "--help"], { encoding: "utf8" });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /eng <命令>/);
  const invalid = spawnSync(process.execPath, [cli, "not-a-command"], { encoding: "utf8" });
  assert.equal(invalid.status, 2);
  assert.match(invalid.stderr, /未知命令/);
});

test("CLI rejects upgrade option for validate with exit code 2", () => {
  const result = spawnSync(process.execPath, [cli, "validate", "--upgrade", "abc"], { encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /validate 命令不接受 --upgrade/);
});

import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parseProfile, parseRegistry, ConfigError } from "../dist/config/load.js";
import { matchRules } from "../dist/resolver/match.js";
import { resolveRules } from "../dist/resolver/resolve.js";
import { profile, registry, rule } from "./helpers.js";

test("parseProfile rejects unknown properties", () => {
  assert.throws(() => parseProfile({ ...profile(), extra: true }), ConfigError);
});

test("matchRules sorts rules and suppresses superseded matches", () => {
  const result = matchRules(profile(), registry({
    base: rule("base", { priority: 1 }),
    replacement: rule("replacement", { priority: 5, supersedes: ["base"] }),
    later: rule("later", { priority: 8 }),
  }));
  assert.deepEqual(result.map(({ id }) => id), ["replacement", "later"]);
});

test("matchRules rejects active conflicting rules", () => {
  const input = registry({
    alpha: rule("alpha", { conflicts: ["beta"] }),
    beta: rule("beta"),
  });
  assert.throws(() => matchRules(profile(), input), /冲突/);
});

test("matchRules rejects supersedes cycles", () => {
  const input = registry({
    alpha: rule("alpha", { supersedes: ["beta"] }),
    beta: rule("beta", { supersedes: ["alpha"] }),
  });
  assert.throws(() => matchRules(profile(), input), /循环/);
});

test("parseRegistry rejects references to missing rules", () => {
  assert.throws(() => parseRegistry(registry({ alpha: rule("alpha", { conflicts: ["missing"] }) })), ConfigError);
});

test("resolveRules rejects traversal outside the standards root", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "eng-resolver-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, "outside.md"), "outside\n");
  const standards = { root, revision: "a".repeat(40), async assertFileMatches() {} };
  await assert.rejects(resolveRules(profile(), registry({ alpha: rule("alpha", { path: "../outside.md" }) }), standards), ConfigError);
});

test("resolveRules rejects symlinked rules", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "eng-resolver-"));
  const outside = await mkdtemp(path.join(os.tmpdir(), "eng-outside-"));
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });
  await writeFile(path.join(outside, "rule.md"), "outside\n");
  await symlink(path.join(outside, "rule.md"), path.join(root, "linked.md"));
  const standards = { root, revision: "a".repeat(40), async assertFileMatches() {} };
  await assert.rejects(resolveRules(profile(), registry({ alpha: rule("alpha", { path: "linked.md" }) }), standards), /符号链接/);
});

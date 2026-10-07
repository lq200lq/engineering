import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { stringify } from "yaml";
import { sha256 } from "../dist/manifest/hash.js";
import { registry, rule } from "./helpers.js";

for (const change of ["delete", "add"]) {
  test(`bundled rules reject file set changes: ${change}`, async (t) => {
    const root = await mkdtemp(path.join(os.tmpdir(), "eng-bundle-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    const packageRoot = path.join(root, "package");
    const projectRoot = path.join(root, "project");
    await cp(path.resolve("dist"), path.join(packageRoot, "dist"), { recursive: true });
    await writeFile(path.join(packageRoot, "package.json"), '{"type":"module"}');
    await symlink(path.resolve("node_modules"), path.join(packageRoot, "node_modules"), "dir");
    const bundle = path.join(packageRoot, "dist/standards");
    await rm(bundle, { recursive: true, force: true });
    await mkdir(path.join(bundle, "rules"), { recursive: true });
    const contents = {
      "registry.yaml": stringify(registry({ base: rule("base", { path: "rules" }) })),
      "rules/a.md": "A\n",
      "rules/b.md": "B\n",
    };
    for (const [file, content] of Object.entries(contents)) await writeFile(path.join(bundle, file), content);
    await writeFile(path.join(bundle, "standards.lock.json"), JSON.stringify({
      formatVersion: 1,
      revision: "a".repeat(40),
      files: Object.fromEntries(Object.entries(contents).map(([file, content]) => [file, sha256(content)])),
    }));
    await mkdir(projectRoot);
    await writeFile(path.join(projectRoot, "engineering.yaml"), "project: { name: sample, type: service }\n");
    const cli = path.join(packageRoot, "dist/cli.js");
    const run = (command) => spawnSync(process.execPath, [cli, command], { cwd: projectRoot, encoding: "utf8" });
    const initial = run("resolve");
    assert.equal(initial.status, 0, initial.stderr);
    const before = await readFile(path.join(projectRoot, ".ai/manifest.yaml"), "utf8");
    if (change === "delete") await rm(path.join(bundle, "rules/b.md"));
    else await writeFile(path.join(bundle, "rules/c.md"), "unlocked\n");
    for (const command of ["resolve", "validate"]) {
      const result = run(command);
      assert.equal(result.status, 2, result.stderr);
      assert.match(result.stderr, /文件集合/);
    }
    assert.equal(await readFile(path.join(projectRoot, ".ai/manifest.yaml"), "utf8"), before);
  });
}

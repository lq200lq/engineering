# Engineering Harness CLI 基础能力实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 实现本地优先的 `eng resolve` 与 `eng validate`，按已批准规格解析工程规则、生成可追溯 Manifest 并执行确定性检查。

**Architecture:** TypeScript ESM CLI 将输入加载/schema 校验、规则解析/Manifest、确定性检查器分成独立模块。它只读取用户提供的本地 Standards Git checkout，不访问网络；输出先写入 `.ai` 同级暂存目录，校验完整后再发布。

**Tech Stack:** Node.js `>=22.17.0`、TypeScript、`yaml`（`parseDocument`）、Ajv JSON Schema validator、Node 内置 `util.parseArgs` 与 `fs/promises.glob`。Node 22.17 起 `fs.glob` 已稳定；CLI 参数解析由 Node 内置 API 提供。[Node.js fs 文档](https://nodejs.org/api/fs.html) [Node.js util 文档](https://nodejs.org/api/util.html) [`yaml` 文档](https://eemeli.org/yaml/) [Ajv TypeScript 文档](https://ajv.js.org/guide/typescript.html)

**Spec:** [CLI 基础能力实现规格](../specs/2026-10-07-engineering-harness-cli-foundation.md)

## Global Constraints

- Standards Repository 以本地 Git checkout 提供。
- `registry.yaml` 与本次解析选中的 Markdown 文件必须与该 HEAD 中已提交的 Git blob 内容一致。
- 首轮 `resolve` 从该 checkout 的 HEAD 建立锁定；后续默认要求 Manifest 的 commit SHA 与 checkout HEAD 一致。
- 显式 `--upgrade <revision>` 才允许切换锁定 revision。
- 默认 Profile 为 `./engineering.yaml`，默认输出目录为 `./.ai`。
- `mandatory` 检查必须使用支持的检查器；没有检查器的 mandatory 规则属于 Registry 配置错误。
- mandatory 失败返回 1；配置、Schema、锁定或 Resolver 错误返回 2；检查器无法确定结果或输入格式不支持返回 3；无失败返回 0。
- 本阶段不实现远程下载/`eng sync`、交互式 `eng init`、`eng explain`、AI Review、IDE Adapter、CI 集成或服务端。
- 不新增或运行自动化测试；每个任务完成后运行 `npm run build` 与 `git diff --check`，并用中文 commit message 提交。

## File Structure

- `package.json`, `package-lock.json`, `tsconfig.json`: Node CLI 包与构建设置。
- `src/cli.ts`: `resolve` / `validate` 参数、调度与退出码。
- `src/config/types.ts`: Profile、Registry、Manifest、检查结果类型。
- `src/config/schemas/*.schema.json`: Profile、Registry、Manifest JSON Schema。
- `src/config/load.ts`: YAML 单文档读取、Ajv Schema 校验和错误格式化。
- `src/io/git.ts`: Standards HEAD SHA 查询与 Git 元数据读取。
- `src/io/paths.ts`: 相对路径安全校验和 glob 展开。
- `src/io/publish.ts`: 暂存生成物并在校验完成后发布。
- `src/manifest/hash.ts`: SHA-256 文件与树摘要。
- `src/manifest/manifest.ts`: Manifest 创建、解析和一致性检查。
- `src/resolver/match.ts`: Profile 条件匹配、冲突及 supersedes 处理、稳定排序。
- `src/resolver/resolve.ts`: 收集规则文件并生成 resolved 文件内容。
- `src/validator/types.ts`: 检查器输入、报告和退出码类型。
- `src/validator/checks.ts`: `file_exists`、`dependency_present`、`dependency_absent`、`migration_exists` 检查器。
- `src/validator/run.ts`: 适用规则筛选、检查器调度和稳定报告输出。

## Review Focus

- 未知 Schema 字段、错误类型、重复 Registry ID 必须给出路径化配置错误并返回 2。
- 绝对路径、`..`、符号链接越界不得读取或写入仓库边界之外。
- `supersedes` 环路与同时匹配的 `conflicts` 必须阻止生成，且旧 `.ai` 输出保持完整。
- 生成摘要必须忽略时间戳，但必须随 Profile、Registry、规则内容变化。
- `package.json` 依赖检查必须覆盖三种依赖区段；不支持或损坏的项目清单不得被当作通过。

---

### Task 1: CLI 包与配置 Schema

**Files:**
- Create: `package.json`, `package-lock.json`, `tsconfig.json`
- Create: `src/cli.ts`
- Create: `src/config/types.ts`
- Create: `src/config/schemas/profile.schema.json`
- Create: `src/config/schemas/registry.schema.json`
- Create: `src/config/schemas/manifest.schema.json`
- Create: `src/config/load.ts`

**Interfaces:**
- Produces: `readYamlFile(path: string): Promise<unknown>`
- Produces: `parseProfile(value: unknown): ProjectProfile`
- Produces: `parseRegistry(value: unknown): Registry`
- Produces: `parseManifest(value: unknown): Manifest`
- Produces: `CheckSpec` union for the four check types in the spec.

- [x] Set package `type` to `module`, `engines.node` to `>=22.17.0`, `bin.eng` to `dist/cli.js`, and a `build` script using `tsc`. Install `yaml`, `ajv`, and `ajv-formats` as runtime dependencies and TypeScript plus `@types/node` as development dependencies; pin resolved versions in `package-lock.json`.
- [x] Configure TypeScript for strict checking, Node ESM resolution, `src` input and `dist` output; use `node:util` `parseArgs` for CLI parsing.
- [x] Define JSON Schemas with `additionalProperties: false` at every object level. Profile contains only the documented `project`, `capabilities`, `stack`, `deployment`, and `preferences` fields. Registry requires `standards.id`, semver `standards.version`, and `rules` keyed by rule ID; each rule requires matching `id`, integer `priority`, `path`, and exactly one of `always: true` or non-empty `when`. Manifest requires `formatVersion: 1`, source/version, a 40- or 64-character lowercase hexadecimal revision, semver resolver version, ISO timestamp, input hashes, generated hash, and ordered rule records. Define all checker parameters and reject unsupported checker types.
- [x] Implement single-document YAML loading with `parseDocument`; report syntax and Schema errors with the source filename and location, then return typed values only after validation.
- [x] Add top-level and subcommand `--help`; use `parseArgs({ tokens: true })` to reject missing, repeated, or unknown options with usage output and exit code 2.
- [x] Run `npm run build` and `git diff --check`; commit as `建立 TypeScript CLI 与配置 Schema`.

### Task 2: Resolver 与 Manifest

**Files:**
- Create: `src/io/git.ts`, `src/io/paths.ts`, `src/io/publish.ts`
- Create: `src/manifest/hash.ts`, `src/manifest/manifest.ts`
- Create: `src/resolver/match.ts`, `src/resolver/resolve.ts`
- Modify: `src/cli.ts`

**Interfaces:**
- Consumes: Task 1 `ProjectProfile`, `Registry`, `Manifest`, `parseProfile`, `parseRegistry`, `parseManifest`.
- Produces: `resolveRules(profile: ProjectProfile, registry: Registry, standardsRoot: string): Promise<ResolvedRuleFile[]>`
- Produces: `createManifest(input: ManifestInput): Promise<Manifest>`
- Produces: `writeResolvedGeneration(outputRoot: string, files: ResolvedRuleFile[], manifest: Manifest): Promise<void>`

- [x] Require `--standards`; resolve and validate `--profile`, `--output`, and optional `--upgrade` paths/revision; require the upgrade revision to equal the local checkout's full HEAD SHA. Resolve registry and rule paths relative to the Standards root, and project checks relative to the project root.
- [x] Resolve dotted scalar conditions with AND semantics; validate rule paths stay inside the standards root and reject symlink traversal. Directory paths recursively include `.md` files only.
- [x] Reject duplicate IDs, declared conflicts, and supersedes cycles. If matched rule A supersedes B, omit B; sort remaining rule/file output by priority, rule ID, then source-relative path.
- [x] Build each resolved file under `.ai/resolved/<ordered-rule-id>/<source-relative-path>` so equal basenames do not collide. Preserve UTF-8 source bytes and use POSIX separators in the manifest.
- [x] Compute SHA-256 for Profile, Registry, each selected Markdown file and the normalized resolved tree; exclude audit timestamps from the tree digest.
- [x] Compare `registry.yaml` and each selected rule file with their blobs at the locked HEAD; reject dirty or untracked standards inputs so the recorded revision actually identifies the hashed standards content.
- [x] On first resolve, lock the local HEAD. On later resolve, reject a changed HEAD unless `--upgrade <revision>` was explicitly provided. Write the full generation into a temporary sibling directory; publish only `.ai/resolved/` and `.ai/manifest.yaml`, preserving other `.ai` content. If publication fails, restore the prior versions of both generated targets and remove the temporary output.
- [x] Run `npm run build` and `git diff --check`; commit as `实现确定性规则解析与 Manifest`.

### Task 3: Deterministic Validator

**Files:**
- Create: `src/validator/types.ts`, `src/validator/checks.ts`, `src/validator/run.ts`
- Modify: `src/cli.ts`

**Interfaces:**
- Consumes: Task 1 configuration types and Task 2 resolver/path/Manifest functions.
- Produces: `runChecks(projectRoot: string, registry: Registry, profile: ProjectProfile): Promise<ValidationReport>`
- Produces: `exitCodeFor(report: ValidationReport): 0 | 1 | 2 | 3`

- [x] Implement `file_exists` and `migration_exists` using project-root-relative `fs.promises.glob`; validate patterns before traversal and exclude symlink targets outside the project root.
- [x] Implement dependency presence/absence checks against `dependencies`, `devDependencies`, and `optionalDependencies` in `package.json`; malformed or unreadable `package.json` returns an unknown result.
- [x] Run checks only for matched rules. Emit stable result records with rule ID, level, check type, path, actual, expected, and reason; sort by rule ID then check index.
- [x] Return exit code 1 for mandatory failures, 3 for any unknown result, and 0 otherwise. Keep configuration and Resolver failures at 2; recommended findings remain warnings and do not alter the exit code. Print results in stable order with a final exit-code summary.
- [x] Validate Manifest revision, Profile/Registry hashes, rule hashes, and resolved-tree digest before checks; stale or inconsistent generated state returns 2.
- [x] Run `npm run build` and `git diff --check`; commit as `实现确定性工程规则校验`.

### Task 4: Usage and Release Notes

**Files:**
- Create: `README.md`
- Modify: `docs/engineering-harness-design.md`

**Interfaces:**
- Consumes: shipped CLI flags, defaults, supported checks, and exit codes from Tasks 1–3.
- Produces: installation/build instructions, a minimal `engineering.yaml` + `registry.yaml` example, command examples, and a clear list of deferred commands.

- [x] Document only commands implemented by the package; distinguish local checkout resolution from deferred remote `sync`.
- [x] Check examples against the approved specification and avoid claiming unsupported ecosystems or checkers.
- [x] Run `npm run build` and `git diff --check`; commit as `补充 CLI 使用说明`.

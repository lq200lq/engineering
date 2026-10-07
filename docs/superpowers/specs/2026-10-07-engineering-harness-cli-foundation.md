# Engineering Harness CLI 基础能力实现规格

## 目标

为 `engineering-standards` 提供一个本地优先的 Node.js + TypeScript CLI 首版基础能力：验证项目 Profile 和规则 Registry，确定性解析规则并生成 Manifest，再按启用规则执行确定性项目检查。

## 本阶段范围

- 输入：项目根目录中的 `engineering.yaml`、Standards Repository 中的 `registry.yaml` 与 Markdown 规则文件。
- 命令：`eng resolve` 和 `eng validate`。
- `resolve` 校验输入 Schema，按 Profile 选择规则，生成 `.ai/resolved/` 和 `.ai/manifest.yaml`。
- `validate` 校验 Profile、Registry、Manifest、生成文件摘要及适用的确定性项目规则。
- Standards Repository 以本地 Git checkout 提供。首轮 `resolve` 从该 checkout 的 HEAD 建立锁定；后续默认要求 Manifest 的 commit SHA 与 checkout HEAD 一致。显式 `--upgrade <revision>` 才允许切换锁定 revision。
- CLI 参数：`eng resolve --standards <path> [--profile <path>] [--output <path>] [--upgrade <revision>]`；`eng validate --standards <path> [--profile <path>] [--output <path>]`。默认 Profile 为 `./engineering.yaml`，默认输出目录为 `./.ai`。升级 revision 必须是本地 checkout 当前 HEAD 的完整 commit SHA。
- 本阶段不实现远程下载/`eng sync`、交互式 `eng init`、`eng explain`、AI Review、IDE Adapter、CI 集成或服务端。

## 输入格式

### Project Profile

`engineering.yaml` 使用现有设计文档第 10 节的 `project`、`capabilities`、`stack`、`deployment` 和 `preferences` 字段。Schema 拒绝未知字段和类型错误；Profile 中缺失的能力字段在规则匹配时视为未启用。

### Registry

`registry.yaml` 顶层包含 `standards` 元数据（稳定 `id` 和语义版本 `version`）以及 `rules` 映射。每项包含稳定的 `id`、整数 `priority`、匹配条件（`always: true` 或非空 `when` 点路径精确匹配）、`path`（相对路径字符串或字符串数组），并可带 `conflicts`、`supersedes` 和 `checks`。

`checks` 中每项包含 `type`、`level` 及类型特定参数。MVP 类型为：

- `file_exists`：必填 `pattern`，作为项目根目录下的相对路径或 glob。
- `dependency_present` / `dependency_absent`：必填 `name`，MVP 仅解析 `package.json` 的 `dependencies`、`devDependencies`、`optionalDependencies`，只检查包名是否存在，不比较版本范围。
- `migration_exists`：必填 `pattern`，对项目根目录下的相对 glob 检查 Migration 文件。

`mandatory` 检查必须使用支持的检查器；没有检查器的 mandatory 规则属于 Registry 配置错误。`recommended` 产生 warning，`guideline` 产生 info。

## Resolver 行为

1. 解析前验证 Profile 和 Registry Schema；规则 ID 重复、非法路径、条件格式错误、未知检查器或 `supersedes` 循环均报错。
2. `always: true` 与 `when` 互斥；`when` 中所有条件按 AND 判断。只支持 scalar 精确匹配，字段缺失时不匹配，类型不一致时报错。
3. 规则路径必须留在 Standards Repository 内。目录仅递归收集 `.md` 文件；拒绝绝对路径、`..` 越界和越出仓库的符号链接。
4. 匹配规则按 `priority` 升序、`id` 字典序、文件相对路径字典序输出。若 A supersedes B 且两者均匹配，只输出 A；`conflicts` 声明的规则同时匹配时失败。未声明的自然语言冲突不作推断。
5. 从相同 Git revision、Profile 和 Registry 生成相同规则列表与 SHA-256 摘要。
6. 先在临时目录生成并校验完整输出；失败不修改已发布的 Manifest 或 resolved 文件。

## Manifest

`.ai/manifest.yaml` 记录 `formatVersion`、规范源标识、显示版本、Git commit SHA `revision`、`resolverVersion`、审计时间、Profile/Registry SHA-256、按输出顺序排列的规则 ID/路径/内容 SHA-256，以及 resolved 树摘要。时间戳不参与生成摘要。

`eng validate` 检查 Manifest revision 与本地 Standards HEAD 相同、输入摘要和文件摘要与现状相符。只有 `eng resolve --upgrade <revision>` 可用指定的本地 Git revision 更新锁定；升级解析失败时保留现有生成结果。

## Validator 行为

- 仅执行 Registry 中明确适用的检查；不把 README、测试目录或 Migration 要求默认套用于所有项目。
- 每条结果包含规则 ID、级别、检查类型、路径（如适用）、实际结果、期望结果和原因。
- mandatory 失败使命令返回 1；配置、Schema、锁定或 Resolver 错误返回 2；检查器无法确定结果或输入格式不支持返回 3；无失败返回 0，recommended warning 不改变退出码。
- Validator 不执行自然语言规则判断，不调用 AI，不把不确定结果当作通过。

## 文件边界

- `package.json`、`tsconfig.json`：CLI 包配置与 TypeScript 编译设置。
- `src/cli.ts`：命令参数和退出码入口。
- `src/config/`：Profile、Registry、Manifest 的类型与 Schema 解析。
- `src/resolver/`：条件匹配、路径安全、冲突处理、稳定排序与摘要。
- `src/manifest/`：锁定信息读写和内容摘要。
- `src/validator/`：检查器接口与三类检查器实现。
- `src/io/`：安全文件读写、Git revision 查询和暂存发布。

具体依赖选择由实施计划根据当前官方文档决定；运行时只添加完成 YAML 解析、Schema 校验和 CLI 参数所需的依赖。

## 验收标准

- 合法输入能生成可重复的 resolved 文件和 Manifest。
- 非法 Schema、路径逃逸、重复规则 ID、冲突规则和 supersedes 环路均得到可定位的错误。
- Profile 或规则内容改变会被 Manifest 摘要检查发现。
- 升级失败不会破坏之前已生成的规则。
- 每类 Validator 结果、级别和退出码与本规格一致。
- 具体验证步骤在获批后的实施计划中定义；本规格阶段不运行验证命令。

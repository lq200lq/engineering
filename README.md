# Engineering Harness

Engineering Harness 是一个本地优先的 TypeScript CLI，用项目 Profile 选择 Standards Repository 中的 Markdown 规则，生成可校验的 `.ai/manifest.yaml` 和 `.ai/resolved/`，并执行 Registry 声明的确定性检查。

## 环境要求

- Node.js `>=22.17.0`
- 一个包含已提交 `registry.yaml` 和 Markdown 规则文件的 Standards Git 仓库

`registry.yaml` 和本次选中的规则文件必须与 Standards 仓库当前 HEAD 的内容一致。修改规范后，先在 Standards 仓库提交，再运行 `eng resolve`。

本项目通过 `standards/` Git submodule 关联默认规范库。克隆项目时使用 `git clone --recurse-submodules https://github.com/lq200lq/engineering.git`；已有 checkout 可运行 `git submodule update --init --recursive`。当前关联的规范库尚只有 `LICENSE`，需要先向规范库提交 `registry.yaml` 和规则 Markdown 后，`eng resolve` / `eng validate` 才能成功。

## 安装与构建

在本仓库根目录运行：

```sh
npm install
npm run build
```

开发时可以通过 `node dist/cli.js` 调用。安装或链接此 npm 包后也可以使用 `eng` 命令。

```sh
node dist/cli.js --help
```

## 项目 Profile

在业务项目根目录创建 `engineering.yaml`。下面的最小 Profile 使用已支持的字段：

```yaml
project:
  name: sample-web
  type: web-application

capabilities:
  frontend: true

stack:
  frontend:
    framework: react
```

Profile 只支持设计文档定义的 `project`、`capabilities`、`stack`、`deployment` 和 `preferences` 字段；未知字段会报 Schema 错误。

## Standards 示例

Standards 仓库至少包含一个 `registry.yaml` 和被规则引用的 Markdown 文件：

```text
standards/
├── registry.yaml
└── rules/
    └── project-baseline.md
```

`registry.yaml` 示例：

```yaml
standards:
  id: example-engineering-standards
  version: 0.1.0

rules:
  project-baseline:
    id: project-baseline
    priority: 100
    always: true
    path: rules/project-baseline.md
    checks:
      - type: file_exists
        level: recommended
        pattern: README.md
      - type: dependency_present
        level: mandatory
        name: typescript
```

支持的检查类型：

- `file_exists`：项目根目录下匹配至少一个文件的相对 glob。
- `migration_exists`：项目根目录下匹配至少一个 Migration 文件的相对 glob。
- `dependency_present` / `dependency_absent`：仅检查 `package.json` 的 `dependencies`、`devDependencies` 和 `optionalDependencies` 中是否存在包名，不比较版本。

`file_exists` 和 `migration_exists` 的 pattern 必须是项目相对路径，不允许绝对路径、`..` 路径片段或花括号展开；指向项目根目录外的符号链接不会计为匹配。

## 命令

命令从业务项目根目录执行。`--standards` 可覆盖 Standards Git checkout，缺省使用 submodule 路径 `./standards`；默认 Profile 是 `./engineering.yaml`，默认输出目录是 `./.ai`。

```sh
# 首次解析并锁定 Standards 当前 HEAD
node /path/to/engineering/dist/cli.js resolve

# Standards 已提交新版本后显式升级锁定
node /path/to/engineering/dist/cli.js resolve --upgrade <完整 commit SHA>

# 检查 Manifest、生成文件和项目规则
node /path/to/engineering/dist/cli.js validate
```

也可传 `--standards <path>` 覆盖默认规范库路径；用 `--profile <path>` 指定其他 Profile，或用 `--output <path>` 指定生成目录。这些路径相对于执行命令时的当前目录解析。

| 退出码 | 含义 |
| --- | --- |
| `0` | 校验通过；recommended 或 guideline 级失败作为提示，不改变退出码 |
| `1` | 至少一条 mandatory 检查失败 |
| `2` | 参数、Schema、锁定 revision、Manifest 或 Resolver 配置错误 |
| `3` | 检查输入不足，无法确定结果，例如依赖检查所需的 `package.json` 无法解析 |

mandatory 失败与 unknown 同时出现时，退出码为 `1`。输出按规则 ID 和 Registry 中检查项顺序排列。

## 当前范围

目前实现 `eng resolve` 和 `eng validate`。`resolve` 只读取本地 Standards checkout，不下载或切换版本；显式 `--upgrade` 只能确认使用 checkout 当前 HEAD 的完整 commit SHA。发布只替换 `.ai/resolved/` 与 `.ai/manifest.yaml`，保留输出目录内其他内容。

以下能力仍是设计方向，尚未实现：`eng init`、远程 `eng sync`、`eng explain`、AI Review、AI 工具适配器、CI 集成和服务端功能。Validator 也不判断自然语言规范，不比较依赖版本，不支持非 Node 包清单。

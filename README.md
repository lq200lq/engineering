# Engineering Harness

<p align="center"><img src="assets/engineering-harness-banner.png" alt="Engineering Harness：从工程规则注册表生成并校验项目规范快照" width="100%"></p>

[![CI](https://github.com/lq200lq/engineering/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/lq200lq/engineering/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/engineering-harness)](https://www.npmjs.com/package/engineering-harness)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)

Engineering Harness 是一个本地优先的工程规范 CLI。它根据项目 Profile 选择适用规则，生成带版本锁定和摘要的 `.ai/` 文件，并对 Registry 声明的项目条件执行确定性检查。

## 快速开始

要求 Node.js `>=22.17.0`。在业务项目根目录先初始化 Profile：

```sh
npx --yes --package=engineering-harness -- eng init
```

`eng init` 会通过终端询问项目名称、类型、能力和相关技术栈，并生成 `engineering.yaml`；部署和架构偏好可跳过。配置路径也可用 `eng init --profile <path>` 指定。向导不会覆盖已有文件，创建后会询问是否立即运行 `resolve`（默认是）；输入 `n` 可稍后再运行：

```yaml
project:
  name: sample-web
  type: web-application

capabilities:
  frontend: true
  fileStorage: false

stack:
  frontend:
    framework: react
```

无需克隆本仓库或安装 CLI，编辑 Profile 后直接生成并校验规则：

```sh
npx --yes --package=engineering-harness -- eng resolve
npx --yes --package=engineering-harness -- eng validate
```

`resolve` 首次运行会创建 `.ai/manifest.yaml`、`.ai/resolved/`，并在项目根目录的 `AGENTS.md` 中添加 Engineering Harness 管理区块。[Codex 会自动读取仓库中的 `AGENTS.md`](https://developers.openai.com/cookbook/examples/gpt-5/codex_prompting_guide)；该区块包含项目 Profile 摘要和规则文件清单，并要求 Codex 在修改前读取这些文件。若已有 `AGENTS.md`，CLI 只替换自身标记区块并保留其他内容；遇到符号链接或损坏的管理标记时会报错，不会覆盖文件。完成一轮实现或更新 Profile 后再次运行 `validate`，检查规则快照、管理区块和 Registry 声明的确定性项目条件。

也可以把 CLI 安装到项目中：

```sh
npm install --save-dev engineering-harness
npx eng init
npx eng resolve
npx eng validate
```

或全局安装后直接运行 `eng resolve`、`eng validate`。

## 工作方式

1. Profile 描述项目类型、能力、技术栈、部署条件和偏好。
2. Registry 根据这些字段选择规则，并按优先级确定顺序。
3. `eng resolve` 生成规则文件与 Manifest；Manifest 锁定 Standards commit 和输入、输出摘要。
4. `eng validate` 重算解析结果，检查 Manifest 与生成文件是否过期，并执行 Registry 中声明的确定性检查。

默认使用随 npm 包发布的固定 Standards 快照。若业务项目根目录下存在 `./standards` Git checkout，CLI 优先使用它；也可通过 `--standards <path>` 指定其他 checkout。CLI 不会联网下载或切换规范版本。切换到新的本地 revision 或更新后的 CLI 快照时，用 `--upgrade <完整 commit SHA>` 明确更新 Manifest 锁定。

CLI 内置快照让一般使用者不需要维护第二个仓库。参与规范开发时，Engineering Harness 源码仓库通过 `standards/` 子模块连接 [Engineering Standards](https://github.com/lq200lq/engineering-standards)。

## 命令

命令在业务项目根目录执行，默认 Profile 为 `./engineering.yaml`，默认输出目录为 `./.ai`。

| 命令 | 用途 |
| --- | --- |
| `eng init` | 交互式创建 `engineering.yaml`；支持 `--profile <path>` 指定路径 |
| `eng resolve` | 根据 Profile 解析规则、更新 Manifest、规则文件和 Codex 的 `AGENTS.md` 管理区块 |
| `eng resolve --upgrade <SHA>` | 显式锁定新的 Standards commit revision |
| `eng validate` | 校验配置、锁定、生成文件和确定性检查结果 |

两个命令都支持以下参数：

| 参数 | 用途 |
| --- | --- |
| `--standards <path>` | 指定 Standards Git checkout |
| `--profile <path>` | 指定 Profile 文件 |
| `--output <path>` | 指定生成目录 |
| `--help` | 显示命令帮助 |

退出码：

| 退出码 | 含义 |
| --- | --- |
| `0` | 没有 mandatory 检查失败；recommended 和 guideline 结果不会阻断 |
| `1` | 至少一条 mandatory 检查失败 |
| `2` | 参数、Schema、锁定 revision、Manifest 或 Resolver 配置错误 |
| `3` | 输入不足，无法确定检查结果 |

## 检查范围

当前 Validator 能确定地检查项目相对路径下的 `file_exists`、`migration_exists`，以及 Node.js `package.json` 中依赖是否存在或不应存在。依赖检查读取 `dependencies`、`devDependencies` 和 `optionalDependencies`，不比较版本。Profile 中未在 Registry 注册的技术栈值会显示警告，但不阻断生成或改变退出码。

`validate` 还会核对 `AGENTS.md` 中的受管区块是否与当前 Profile 和生成规则一致。它报告规则快照状态及 Registry 检查结果，不判断 Markdown 自然语言规范是否已遵守，也不自动扫描和推断非 Node.js 的依赖清单；退出码为 `0` 不等同于代码质量通过。检查级别和边界由 Registry 明确声明，recommended 与 guideline 结果不会改变退出码。

## 规范仓库结构

Engineering Standards 的 `registry.yaml` 是解析入口。规则按 Constitution、能力、决策、检查器和技术栈分类维护。新增技术栈或能力时，需同时维护规则文件和 Registry 条目；详见 [Engineering Standards README](standards/README.md) 与[贡献指南](CONTRIBUTING.md)。

## 在本仓库开发

```sh
git clone --recurse-submodules https://github.com/lq200lq/engineering.git
cd engineering
npm ci
npm test
npm run package:check
```

`npm test` 会构建 CLI 并运行回归测试；`npm run package:check` 检查发布文件清单和包内锁定的规范快照。Node.js CI 在项目最低支持版本和当前 LTS 上运行这些检查。

## 相关文档

- [Engineering Standards 规则库](https://github.com/lq200lq/engineering-standards)：规则文件、Registry 与规范维护入口。
- [设计说明](docs/engineering-harness-design.md)：架构、配置模型与未实现的后续方向。
- [贡献指南](CONTRIBUTING.md)：开发、验证及双仓库提交流程。
- [手动发布指南](docs/releasing.md)：版本、规范快照和 npm 包发布步骤。
- [安全政策](SECURITY.md)、[行为准则](CODE_OF_CONDUCT.md)、[变更记录](CHANGELOG.md)。

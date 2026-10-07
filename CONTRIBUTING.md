# 贡献指南

感谢你为 Engineering Harness 和 Engineering Standards 提交改进。

## 开发环境

- Node.js `>=22.17.0`。
- 克隆时初始化规范子仓库：

  ```sh
  git clone --recurse-submodules https://github.com/lq200lq/engineering.git
  cd engineering
  npm ci
  ```

- 运行 `npm test` 构建 CLI 并执行回归测试。
- 运行 `npm run package:check` 验证 npm 包文件清单和内置规范快照。

## 修改 CLI

- TypeScript 源码位于 `src/`，测试位于 `test/`；命令、Schema、Registry 类型或生成行为改变时，应加入相应回归测试。
- 保持 `eng resolve` 和 `eng validate` 的现有参数、输出与退出码契约；有意变更时同步更新 README 和设计文档。
- 不要提交 `dist/` 或 `node_modules/`。运行 `git diff --check` 检查补丁格式。

## 修改工程规范

`standards/` 是独立 Git 子仓库，规范内容和 CLI 代码需要分别提交：

1. 在 `standards/` 中编辑规则和 `registry.yaml`，检查 `git -C standards diff --check`。
2. 在子仓库提交规范改动，并确认子仓库工作区干净。
3. 回到父仓库，审阅新的 `standards/` 子模块引用；运行 `npm test` 和 `npm run package:check`。
4. 在父仓库单独提交子模块引用更新。

不要把 `standards/` 中尚未提交的内容作为父仓库提交的一部分；npm 包会从已提交的子模块 revision 生成规范快照。

## Pull Request

- 一个 Pull Request 聚焦一个主题，描述动机、用户可见影响和必要的迁移说明。
- 列出实际运行的验证命令及结果；未执行的检查应明确标记。
- 涉及规范时，同时说明已提交的规范 revision 与父仓库子模块引用。
- 使用清楚、简短的中文提交说明；不要在未获授权时发布 npm 包。

## 社区与安全

- 参与项目时请遵守 [行为准则](CODE_OF_CONDUCT.md)。
- 安全漏洞请按 [安全政策](SECURITY.md) 私下报告，不要创建公开 Issue。

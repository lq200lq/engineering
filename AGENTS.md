# Repository Guidelines

## 项目结构

- `src/cli.ts` 是 CLI 入口；`config/` 负责配置解析与 JSON Schema，`resolver/` 选择规则，`manifest/` 生成锁定清单，`validator/` 执行确定性检查，`io/` 管理文件、Git 和发布操作。
- `standards/` 是独立 Git 子仓库，保存规范、Registry 和规则；`docs/` 用于本地保存设计、规格与实施计划，不纳入 Git 提交；`scripts/prepare-package.mjs` 准备 npm 发布内容。
- `dist/` 是编译输出，`node_modules/` 是依赖目录，均不应提交。

## 开发、构建与验证

- 使用 Node.js `>=22.17.0`。运行 `npm install` 安装依赖，`npm run build` 用 TypeScript 编译到 `dist/`。
- 初始化或同步规范子仓库：`git submodule update --init --recursive`。
- `npm test` 会先构建，再使用 Node.js 内置测试运行器执行 `test/*.test.js`。改动完成后运行相关回归测试；提交前运行完整测试，并在 PR 中如实记录结果。
- `npm run package:check` 会构建、准备内置规范快照并检查 npm 发布清单；发布相关改动必须运行此检查。

## 编码风格

- TypeScript 使用两个空格缩进，并遵守 `tsconfig.json` 的严格检查选项。保持 ESM 风格；相对导入写 `.js` 后缀，例如 `import { parse } from "./config.js"`。
- 按职责将代码放入 `src/config/`、`src/io/`、`src/manifest/`、`src/resolver/` 或 `src/validator/`。新增配置字段时同步更新相应类型、Schema 和解析逻辑。

## 测试指南

- 自动化测试放在 `test/`，使用 Node.js 内置 `node:test` 和 `node:assert/strict`，导入构建后的 `dist/` 模块。新功能应覆盖正常输入、无效配置和关键边界行为；文件与 Git 场景使用临时目录，并在测试结束后清理。

## 提交与 Pull Request

- 现有提交以简短中文动词描述变更，例如 `补充 CLI 使用说明`；保持单一主题，不要求 Conventional Commits 前缀。
- PR 应说明目的和主要变化，列出运行过的验证命令及结果；有相关问题时附链接。涉及 `standards/` 时，先在子仓库提交规范改动，再在父仓库提交更新后的子模块引用。

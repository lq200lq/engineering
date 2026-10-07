# Repository Guidelines

## 项目结构

- `src/cli.ts` 是 CLI 入口；`config/` 负责配置解析与 JSON Schema，`resolver/` 选择规则，`manifest/` 生成锁定清单，`validator/` 执行确定性检查，`io/` 管理文件、Git 和发布操作。
- `standards/` 是独立 Git 子仓库，保存规范、Registry 和规则；`docs/` 保存设计、规格与实施计划；`scripts/prepare-package.mjs` 准备 npm 发布内容。
- `dist/` 是编译输出，`node_modules/` 是依赖目录，均不应提交。

## 开发、构建与验证

- 使用 Node.js `>=22.17.0`。运行 `npm install` 安装依赖，`npm run build` 用 TypeScript 编译到 `dist/`。
- 初始化或同步规范子仓库：`git submodule update --init --recursive`。
- 当前未配置测试框架、测试目录或测试脚本；不要假设 `npm test` 可用。改动完成后至少运行构建，并在 PR 中如实记录结果。

## 编码风格

- TypeScript 使用两个空格缩进，并遵守 `tsconfig.json` 的严格检查选项。保持 ESM 风格；相对导入写 `.js` 后缀，例如 `import { parse } from "./config.js"`。
- 按职责将代码放入 `src/config/`、`src/io/`、`src/manifest/`、`src/resolver/` 或 `src/validator/`。新增配置字段时同步更新相应类型、Schema 和解析逻辑。

## 测试指南

- 暂无自动化测试约定。新功能应覆盖正常输入、无效配置和关键边界行为；如新增测试框架或脚本，请同时更新本指南与 `package.json`。

## 提交与 Pull Request

- 现有提交以简短中文动词描述变更，例如 `补充 CLI 使用说明`；保持单一主题，不要求 Conventional Commits 前缀。
- PR 应说明目的和主要变化，列出运行过的验证命令及结果；有相关问题时附链接。涉及 `standards/` 时，先在子仓库提交规范改动，再在父仓库提交更新后的子模块引用。

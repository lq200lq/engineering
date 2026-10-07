# 手动发布指南

本指南面向 Engineering Harness 维护者。发布通过人工审查和 `npm publish` 完成；仓库 CI 只验证改动，不会发布包。

## 版本约定

- npm 包版本使用语义化版本。对已有用户可见行为的兼容修复升 patch；新增向后兼容能力升 minor；移除或改变既有 CLI 契约升 major。
- `standards/registry.yaml` 中的规范版本独立于 npm 包版本。规则新增或非破坏性调整升规范 patch/minor；规则删除、mandatory 含义变化等破坏性改动升规范 major。
- 规范修改必须先在 `standards/` 子仓库提交，再在父仓库提交新的子模块引用。npm 包只会内置该已提交 revision 的快照。
- 将面向用户的变更记入 `CHANGELOG.md` 的 `[未发布]` 区域，并在发版时移动到对应版本标题下。

## 发布前检查

在干净的默认分支 checkout 中确认所有需要的改动已经合并，并执行：

```sh
npm ci
npm test
npm run package:check
npm pack --dry-run
git diff --check
git status --short
git -C standards status --short
```

检查 CI 的最低 Node.js 版本和当前 LTS 作业均通过。审阅 `npm pack --dry-run` 清单，确认包只包含 CLI、内置规范快照、README、许可证及贡献者治理文件；确认 `standards.lock.json` revision 与父仓库的 `standards/` 子模块指向相同。

发布前若规范库有改动，必须先在 `standards/` 提交并更新父仓库 gitlink，再完成本仓库的版本提交。不要从脏的规范子仓库或未提交的父仓库状态制作发布包。

## 版本提交、标签与发布

1. 将 `[未发布]` 变更记录整理到即将发布的版本标题下。
2. 按发布类型更新 `package.json` 和 `package-lock.json`，例如：

   ```sh
   npm version patch --no-git-tag-version
   ```

   使用 `minor` 或 `major` 代替 `patch` 时，应有对应的新增或破坏性变更依据。
3. 重新运行 `npm test`、`npm run package:check` 和 `npm pack --dry-run`，审阅版本、包内容和锁定规范 revision。
4. 使用中文提交说明提交版本与变更记录，然后为该提交创建 `v<版本号>` 标签，例如 `git tag v0.1.1`。
5. 将版本提交和标签推送到远程仓库，并确认该提交对应的 CI 作业成功。
6. 在维护者自己的发布环境中完成 npm 登录或配置可信发布身份，再手动运行 `npm publish`。本仓库不保存 npm token，也不由 GitHub Actions 执行发布。
7. 发布后确认 `npm view engineering-harness@<版本号> version dist.integrity` 返回预期版本，并在空目录中使用该确切版本运行 `eng resolve` 和 `eng validate`，确认安装包内置规范快照可用。

## 失败处理

- 若发布前任一检查失败，修复问题后重新运行完整发布前检查；尚未发布时可继续使用同一版本号。
- `npm publish` 返回网络错误或超时后，先运行 `npm view engineering-harness@<版本号> version`。只有确认该版本尚未发布时才重试，避免把已成功发布误认为失败。
- npm 版本一经发布不可覆盖。若已发布内容有误，准备包含修复的新版本并在变更记录中说明；不要尝试复用已发布版本号。
- 若安装后的空目录验证失败，停止后续推广，记录 npm 版本与失败输出，并发布修正后的新版本。

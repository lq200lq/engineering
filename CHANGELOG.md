# 变更记录

本文件记录用户可见的变更，格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。版本按语义化版本管理。

## [未发布]

### 新增

- `eng resolve` 在项目根目录维护 Codex 使用的 `AGENTS.md` 托管区块，列出已选规则文件并引导 Codex 读取。

### 变更

- `eng validate` 明确说明校验状态仅覆盖已解析快照与 Registry 确定性检查，不代表语义或代码质量合规。

### 修复

- Profile 引用 Registry 中不存在的规则时给出非阻断警告；校验可发现 `AGENTS.md` 托管区块过期。

### 安全

## [0.1.0] - 2026-10-07

### 新增

- 首次发布本地优先的 `eng resolve` 与 `eng validate` CLI，支持 Profile、规范解析、Manifest 锁定及确定性检查。
- npm 包内置固定 revision 的 Engineering Standards 规范快照。
- 增加 Node.js CI、回归测试、npm 包清单校验及开源贡献与安全治理文档。

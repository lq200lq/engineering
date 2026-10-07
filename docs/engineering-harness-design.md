# Engineering Harness 设计方案

> 面向 AI Coding 场景的工程规范继承、动态装配与校验体系

## 1. 背景与目标

在使用 Claude Code、Codex、Cursor 等 AI 编码工具创建新项目时，项目质量很大程度依赖于“这一次是否把所有规范都重新讲完整”。

如果某次遗漏了某项要求，例如：

- 不要过度设计
- 职责要清晰
- 不要随意引入 Redis / MQ
- 数据库变更必须使用 Migration
- 不要提前拆微服务
- 抽象必须来自真实变化点
- 必须有测试、异常处理、文档约束
- AI 不应擅自做重大技术决策

那么 AI 很容易生成一个从一开始就偏离预期的项目。

因此，本方案的核心目标不是“让 AI 记住更多提示词”，而是建立一套独立于具体 AI 工具的工程约束体系，使任何新项目都能自动继承统一的工程标准。

最终目标：

> 项目质量不再依赖本次提示词是否完整，而由工程规范、项目配置、规则解析和自动校验共同保证。

核心思路：

```text
Engineering Constitution
        +
Project Profile
        +
Rule Resolver
        +
AI Adapter
        +
Validator
        =
稳定、可复用、可演进的 AI 工程体系
```

---

## 2. 产品定位

该系统可以定位为：

# Engineering Harness

它不是：

- 项目脚手架
- 固定技术栈模板
- 单一 CLAUDE.md
- 单一 AGENTS.md
- 超级 Prompt
- AI IDE 插件

它是一层位于 AI Coding 工具和具体项目之间的工程治理层。

主要负责：

```text
Context
+
Constraints
+
Decision Policy
+
Validation
```

即：

1. 给 AI 提供项目上下文
2. 给 AI 提供工程约束
3. 约束 AI 的技术决策
4. 对 AI 产出的代码进行校验

---

## 3. 总体架构

整体建议拆成四个核心模块：

```text
Engineering Standards Kit
│
├── Standards Repository
│   └── 规范源
│
├── Resolver Engine
│   └── 根据项目自动选择规则
│
├── CLI
│   └── init / resolve / sync / validate / explain
│
└── AI Adapter
    └── Claude / Codex / Cursor
```

整体关系：

```text
               engineering-standards
                       │
                       │
               ┌───────▼────────┐
               │ Rule Resolver  │
               └───────┬────────┘
                       │
                project-profile
                       │
             ┌─────────▼─────────┐
             │ Resolved Rules    │
             └─────────┬─────────┘
                       │
          ┌────────────┼─────────────┐
          ▼            ▼             ▼
      AGENTS.md    CLAUDE.md    Cursor Rules
                       │
                       ▼
                    AI Agent
                       │
                       ▼
                   Validator
```

---

## 4. 承载方式

推荐采用三层承载结构。

### 4.1 Standards Repository

单独建立一个 Git 仓库：

```text
engineering-standards
```

它作为所有工程规范的唯一真相源。

职责：

- 保存长期工程规范
- 保存架构原则
- 保存技术决策规则
- 保存技术栈专项规则
- 保存能力级规则
- 保存校验规则
- 管理版本
- 支持审查和演进

---

### 4.2 CLI / Skill

提供一个非常轻量的 CLI，例如：

```bash
eng
```

AI Skill 只作为薄适配层存在。

CLI 才是真正的底座。

原因：

- Claude Code 可以调用
- Codex 可以调用
- Cursor 可以调用
- Shell 可以调用
- CI 可以调用
- 不绑定任何 AI 厂商

Skill 可以提供更自然的 AI 调用方式，但内部仍然调用相同 CLI。

---

### 4.3 Project Repository

具体业务项目只保存：

- 当前项目 Profile
- 当前项目实际启用的规则
- 当前工程规范版本
- AI 工具适配入口

例如：

```text
my-project/
├── engineering.yaml
├── AGENTS.md
├── CLAUDE.md
├── .cursor/
├── .ai/
│   ├── manifest.yaml
│   ├── project-context.md
│   └── resolved/
└── ...
```

---

## 5. Standards Repository 设计

建议目录结构：

```text
engineering-standards/
│
├── constitution/
│   ├── principles.md
│   ├── architecture.md
│   ├── maintainability.md
│   ├── simplicity.md
│   └── ai-behavior.md
│
├── capabilities/
│   ├── backend.md
│   ├── frontend.md
│   ├── database.md
│   ├── cache.md
│   ├── mq.md
│   ├── ai.md
│   ├── file-storage.md
│   └── offline-deployment.md
│
├── stacks/
│   ├── java/
│   ├── node/
│   ├── python/
│   ├── vue/
│   ├── react/
│   ├── nextjs/
│   ├── postgresql/
│   ├── mysql/
│   └── redis/
│
├── decisions/
│   ├── architecture.md
│   ├── database.md
│   ├── cache.md
│   ├── mq.md
│   ├── microservice.md
│   ├── abstraction.md
│   └── dependency.md
│
├── validators/
│
├── profiles/
│
└── registry.yaml
```

核心原则：

> 规范仓库按“规则作用域”组织，而不是按具体项目组织。

---

## 6. Constitution：最高级工程规范

Constitution 是整个系统最重要的一层。

它与具体技术栈无关。

无论项目使用：

- Java
- Node.js
- Python
- Vue
- React
- Next.js

这些规则都应该长期成立。

示例：

```md
# Architecture Principles

## 1. Simple First

默认选择能够满足当前需求的最简单方案。

禁止为了：

- 未来可能存在的规模
- 尚未出现的性能瓶颈
- 假设性的扩展需求

提前引入复杂架构。

## 2. Clear Responsibility

每个模块必须拥有明确职责。

禁止：

- Controller 承载业务逻辑
- UI 层操作持久化细节
- 基础设施逻辑进入领域层
- 单个 Service 承载大量无关职责

## 3. Abstraction

抽象必须来源于真实变化点。

禁止：

- 为复用一两行代码建立抽象
- 为使用设计模式而使用设计模式
- 无明确扩展场景的 SPI
- 无明确需求的通用框架

## 4. Dependency

新增依赖之前必须判断：

1. 标准库是否能够解决
2. 当前框架是否已有能力
3. 自己实现成本是否非常低
4. 新依赖是否带来长期维护成本
```

Constitution 适合保存：

- 简单优先
- 职责清晰
- 最小复杂度
- 抽象原则
- 可维护性原则
- 依赖原则
- 安全原则
- 测试原则
- AI 行为规范
- 文档原则

---

## 7. Capability Rules：能力级规则

技术栈可能不同，但很多项目能力是共通的。

例如：

```text
backend
frontend
database
cache
mq
ai
file-storage
offline-deployment
```

所以建议建立：

```text
capabilities/
```

例如：

```text
capabilities/database.md
```

可以描述：

- 数据库变更必须通过 Migration
- 不允许线上手工改结构
- 批量数据处理避免 N+1
- 事务边界必须明确
- 数据访问层和业务层职责分离

这些约束并不依赖 PostgreSQL 或 MySQL。

---

## 8. Stack Rules：技术栈专项规则

只有明确技术栈后才加载。

例如：

```text
stacks/java/
stacks/vue/
stacks/postgresql/
```

Java 项目可包含：

```text
stacks/java/
├── language.md
├── project-structure.md
├── dependency.md
├── testing.md
├── concurrency.md
└── style.md
```

PostgreSQL：

```text
stacks/postgresql/
├── schema.md
├── index.md
├── query.md
├── migration.md
└── performance.md
```

这类规则不应该进入通用规范层。

---

## 9. Decision Rules：约束 AI 技术决策

这是整个设计中非常重要的一层。

AI 最大的问题往往不是代码不会写，而是：

> 擅自做了不必要或者过度复杂的技术决策。

因此建议单独建立：

```text
decisions/
```

### 9.1 Redis 引入规则

```md
# Redis Decision Rule

默认不引入 Redis。

只有满足以下至少一项时才考虑：

- 已确认存在跨实例共享状态
- 数据库查询已经成为实际性能瓶颈
- 存在明确热点数据
- 需要分布式锁
- 业务存在明确 TTL 语义

禁止因为：

“以后可能存在性能问题”

而提前引入 Redis。
```

---

### 9.2 微服务规则

```md
# Microservice Decision Rule

默认采用 Modular Monolith。

只有出现以下情况才允许考虑服务拆分：

- 明确独立团队维护
- 独立扩缩容需求
- 独立生命周期
- 明确领域边界
- 独立部署收益明显高于运维成本

没有满足以上条件时，不应为了“架构先进”而拆微服务。
```

---

### 9.3 抽象规则

```md
# Abstraction Decision Rule

默认优先直接实现。

只有出现以下情况才考虑抽象：

- 存在至少两个真实实现
- 存在明确变化点
- 存在稳定的扩展边界
- 抽象明显降低长期维护成本

禁止：

- 为未来可能的需求提前设计 SPI
- 为使用设计模式而设计模式
- 对一次性逻辑进行框架化
```

---

## 10. Project Profile

每个项目只描述自己的差异。

建议项目根目录使用：

```text
engineering.yaml
```

示例：

```yaml
project:
  name: ai-recruitment
  type: web-application
  scale: medium

capabilities:
  backend: true
  frontend: true
  database: true
  ai: true
  cache: false
  mq: false

stack:
  backend:
    language: java
    framework: spring-boot

  frontend:
    framework: vue

  database:
    type: postgresql

deployment:
  type: private
  internetAccess: false

preferences:
  architecture: modular-monolith
  simplicity: high
```

核心思想：

> 新项目不再重复描述全部工程规范，只声明“这个项目是什么”。

---

## 11. Rule Resolver

Resolver 根据 `engineering.yaml` 自动计算当前项目应该加载哪些规则。

#### MVP 解析契约

- 先按版本化 Schema 校验 `engineering.yaml` 与 `registry.yaml`；未知字段、未知规则类型、缺失必填字段或无法识别的条件均报错，不静默忽略。
- v1 条件只支持 `always: true` 或点分路径字段的精确值匹配，两者不能同时设置；同一条规则的多个字段条件按 AND 处理。Profile 中缺失字段视为未匹配，字段类型不一致视为配置错误。暂不支持表达式、通配符和脚本条件。
- 所有规则路径必须是 Standards Repository 内的相对路径。目录按路径字典序递归展开，只纳入注册支持的 Markdown 规则文件；拒绝绝对路径、`..` 越界和逃逸仓库的符号链接。
- 输出顺序固定为规则优先级升序、规则 ID 字典序、文件相对路径字典序。相同输入 revision、Profile 和 Registry 必须产生相同文件列表与内容摘要。
- 自动解析不尝试理解自然语言并推断规则优先级。规则间的明确冲突必须在 Registry 中声明；不能静默采用“后加载覆盖先加载”。
- 解析失败时不覆盖现有 `.ai/resolved/` 或 Manifest；先在临时目录组装并校验完整生成物，再发布新版本。发布失败时保留旧文件并清理临时目录。

例如：

```yaml
capabilities:
  backend: true
  database: true

stack:
  backend:
    language: java

  database:
    type: postgresql
```

自动解析：

```text
constitution/*
+
capabilities/backend.md
+
capabilities/database.md
+
stacks/java/*
+
stacks/postgresql/*
```

生成：

```text
.ai/resolved/
```

例如：

```text
.ai/
├── resolved/
│   ├── 00-constitution.md
│   ├── 10-architecture.md
│   ├── 20-backend.md
│   ├── 21-database.md
│   ├── 30-java.md
│   └── 31-postgresql.md
│
├── manifest.yaml
└── project-context.md
```

---

## 12. Registry

Resolver 不应该把所有技术判断写死在代码中。

建议通过：

```text
registry.yaml
```

进行规则注册。

MVP Registry 为每条规则提供稳定的 `id`、`priority`、匹配条件、文件路径及可选的 `conflicts` / `supersedes` 声明。重复 ID 和已声明的冲突必须被机器检查。若规则 A 的 `supersedes` 包含规则 B，且二者都匹配，则结果中只保留 A；覆盖关系必须无环。`priority` 只用于最终排序，不隐式覆盖其他规则。通过 `conflicts` 声明为不可同时启用的规则共同匹配时解析失败。没有声明关系的规则都保留在结果中。自然语言语义冲突不由 Resolver 自动推断，需在规范仓库审查中处理。Registry 随 Standards Repository 版本锁定。

示例：

```yaml
rules:

  constitution:
    id: constitution
    priority: 0
    always: true
    path: constitution

  backend:
    id: backend
    priority: 10
    when:
      capabilities.backend: true
    path:
      - capabilities/backend.md

  java:
    id: java
    priority: 20
    when:
      stack.backend.language: java
    path:
      - stacks/java

  postgresql:
    id: postgresql
    priority: 20
    when:
      stack.database.type: postgresql
    path:
      - stacks/postgresql

  offline:
    id: offline
    priority: 10
    when:
      deployment.internetAccess: false
    path:
      - capabilities/offline-deployment.md
```

这样以后新增：

- Go
- Rust
- MongoDB
- Electron
- Tauri
- Kotlin
- Flutter

不需要修改 Resolver 核心代码。

只增加：

```text
规则文件
+
registry 配置
```

即可。

---

## 13. CLI 设计

第一版不建议设计太多命令。

本仓库当前只实现 `eng resolve` 和 `eng validate`。本节中 `init`、远程 `sync` 和 `explain` 是后续设计目标，不代表当前 CLI 已支持。

核心保留五个。

### 13.1 eng init

> 当前未实现。以下内容描述未来的初始化体验。

```bash
eng init
```

初始化当前项目的 Engineering Harness。

交互示例：

```text
项目类型？
> Web Application

是否有后端？
> Yes

是否有前端？
> Yes

是否使用数据库？
> Yes

后端技术？
> Java

前端技术？
> Vue

数据库？
> PostgreSQL

部署方式？
> 企业内网
```

最终生成：

```text
engineering.yaml
.ai/
AGENTS.md
CLAUDE.md
.cursor/rules/
```

---

### 13.2 eng resolve

```bash
eng resolve --standards <本地 Standards 仓库路径> [--profile <路径>] [--output <路径>] [--upgrade <完整 commit SHA>]
```

根据当前 `engineering.yaml` 重新解析应该启用的规则。默认 Profile 为 `./engineering.yaml`，默认输出目录为 `./.ai`。Standards 必须是本地 Git checkout；`registry.yaml` 和匹配的 Markdown 规则文件须与 checkout 当前 HEAD 中的已提交内容一致。首次解析锁定当前 HEAD；后续 revision 变化时必须通过 `--upgrade` 显式确认当前完整 commit SHA。此命令不下载 Standards，也不执行远程同步。

适合：

- 修改技术栈后
- 新增能力后
- 修改部署方式后
- 更新项目约束后

---

### 13.3 eng sync

> 当前未实现。当前版本只支持 `resolve --standards <本地路径>`，不包含远程下载或缓存。

```bash
eng sync
```

同步项目 Manifest 锁定的 Standards Repository 版本，并使用锁定版本重新解析规则。`eng sync` 默认不升级版本。

```bash
eng sync --upgrade <version>
```

显式升级成功后才更新 Manifest 的版本、revision 和规则摘要。下载、校验或解析失败时必须保留原 Manifest 与已生成文件。Manifest 必须记录 Git commit SHA 作为锁定 revision；升级参数可使用版本号或标签，但必须先解析到 commit SHA，不能锁定浮动的 `latest` 或可移动标签。本地已有锁定 revision 缓存时，离线可以继续同步；否则失败并说明缺少该版本。`eng sync --upgrade` 不带版本参数时直接报配置错误。

例如，升级过程为：

```text
v1.8.0
→
v1.9.0
```

然后重新解析规则。普通 `eng sync` 始终遵循当前锁定版本，不自动追随最新版本。

---

### 13.4 eng validate

```bash
eng validate --standards <本地 Standards 仓库路径> [--profile <路径>] [--output <路径>]
```

检查 Manifest、Profile/Registry 摘要、规则文件和生成树，并运行 Registry 中适用于当前 Profile 的确定性检查。当前检查器只支持项目相对 `file_exists` / `migration_exists` glob，以及 `package.json` 中 `dependencies`、`devDependencies`、`optionalDependencies` 的依赖存在性检查；不比较版本，也不判断自然语言规范。

例如：

- 是否缺少必要文件
- 是否违反依赖规则
- 是否引入不允许的基础设施
- 是否缺少 Migration
- 是否存在基础结构问题

退出码：`0` 表示没有 mandatory 失败；`1` 表示至少一条 mandatory 检查失败；`2` 表示参数、Schema、Manifest、锁定或 Resolver 错误；`3` 表示检查输入无法确定。Recommended 和 guideline 级结果不会改变退出码。

---

### 13.5 eng explain

> 当前未实现。

```bash
eng explain redis
```

输出：

```text
Redis 当前未启用。

原因：

engineering.yaml
capabilities.cache = false

根据：
decisions/cache.md

当前项目不存在必须引入 Redis 的明确场景。
```

该命令对于 AI Agent 特别有价值。

AI 可以在做重大技术决策前主动查询：

```bash
eng explain microservice
eng explain cache
eng explain mq
eng explain abstraction
```

---

## 14. AI Adapter

不建议为不同 AI 工具维护不同的规范源。

错误方式：

```text
Claude 一套规范
Codex 一套规范
Cursor 一套规范
```

正确方式：

```text
.ai/resolved/
```

作为唯一有效规则。

不同 AI 工具只负责适配。

---

### 14.1 AGENTS.md

例如：

```md
# Engineering Instructions

Before making architectural or implementation decisions:

1. Read `.ai/project-context.md`
2. Read relevant rules under `.ai/resolved/`
3. Follow `.ai/manifest.yaml`
4. Run `eng validate` after meaningful implementation work

Do not override engineering standards without explicit approval.
```

---

### 14.2 CLAUDE.md

Claude Code 使用类似入口：

```md
# Engineering Rules

This project uses Engineering Harness.

Before implementation:

- Read `.ai/project-context.md`
- Read relevant files under `.ai/resolved/`
- Respect decision rules
- Do not introduce major infrastructure without justification
- Run `eng validate`
```

---

### 14.3 Cursor

生成：

```text
.cursor/rules/engineering.mdc
```

内容仍然只是引导 Cursor 读取：

```text
.ai/resolved/
```

避免重复维护规则。

---

## 15. Manifest

每个项目应该记录当前使用的工程规范版本。

例如：

```yaml
formatVersion: 1

standards:
  source: engineering-standards
  version: 1.3.0
  revision: 0123456789abcdef0123456789abcdef01234567
  resolverVersion: 1.0.0
  resolvedAt: 2026-10-07
inputs:
  profileSha256: <sha256>
  registrySha256: <sha256>
generatedSha256: <sha256>

rules:
  - id: constitution-principles
    path: constitution/principles.md
    sha256: <sha256>
  - id: capabilities-backend
    path: capabilities/backend.md
    sha256: <sha256>
```

`source` 标识规范源，`revision` 是唯一确定仓库内容的 Git commit SHA，`version` 仅用于显示，`resolverVersion` 标识生成语义，`rules` 按解析顺序记录全部选中文件及其 SHA-256。`inputs` 保存项目 Profile 与 Registry 的摘要；`generatedSha256` 是按相对路径和文件内容计算的解析结果摘要，不包含时间戳。`resolvedAt` 只用于审计，不参与解析结果。可重现性由 source、revision、resolver 版本和输入摘要共同确定；相同锁定输入若得到不同摘要，命令必须报错并说明版本或生成物不一致。

Manifest 与 `.ai/resolved/` 作为一个逻辑事务更新：先在同一文件系统的临时目录组装新 Manifest 与解析结果，完成全部校验后再发布；失败时回滚并保留原有生成物，不能留下新旧版本混搭。`eng resolve` 使用当前锁定 revision，不联网升级。

这样可以保证：

- 项目规则可追溯
- 项目规则可重现
- 可以比较规范版本差异
- 可以安全升级规范

---

## 16. 规则等级

不是所有规范都应该同样强制。

建议设置三种等级：

```text
mandatory
recommended
guideline
```

例如：

| 规则 | 等级 |
|---|---|
| 禁止使用 denylist 中的依赖 | mandatory |
| 数据库变更必须 Migration | mandatory |
| 优先组合而非继承 | recommended |
| 单文件建议控制规模 | guideline |

含义：

### mandatory

必须满足。

如果违反：

```text
validate = fail
```

MVP 中，`mandatory` 规则必须注册一个支持的确定性检查器；没有检查器或检查器配置不完整时，Registry 校验失败，不能把该规则当作已强制执行。主观规则在 MVP 中标记为 `recommended` 或 `guideline`；不得把 AI Review 的意见映射为确定性失败。

### recommended

原则上应该满足。

AI 如果违反，必须说明原因。

### guideline

指导性建议。

允许 AI 根据上下文自行判断。

---

## 17. 规则结构化

长期来看，不建议所有规则都只采用 Markdown。

建议逐步引入结构化格式。

例如：

```yaml
id: ARCH-001

title: Avoid Premature Abstraction

category: architecture

level: recommended

scope:
  - all

rule:
  Do not introduce abstraction without a real variation point.

reason:
  Premature abstraction increases maintenance costs.

bad:
  - Generic BaseService without multiple real implementations
  - SPI designed for hypothetical future plugins

exceptions:
  - Framework integration points
  - Explicit extension requirements
```

这样未来可以支持：

```text
eng validate
eng search
eng explain
eng diff
AI retrieval
规则统计
冲突检测
规则依赖
规则版本迁移
```

Markdown 可以作为展示层，而 YAML / JSON 作为规则元数据。

---

## 18. Validator 设计

Validator 第一版只执行有明确输入、规则和结果的检查。

不要一开始就试图构建一个完整 AI SonarQube。

第一版只做三类。

---

### 18.1 Project Structure

检查项必须由启用的规则声明适用条件；不适用时跳过，不对所有项目套用同一套文件要求。例如只有启用数据库能力且配置了数据库 Migration 规则时，才检查 Migration。

MVP 确定性检查器限定为：`file_exists`（支持明确 glob）、`dependency_present` / `dependency_absent`（按注册的包清单解析器读取依赖清单）、`migration_exists`（仅对声明支持的数据库与 Migration 工具生效）。检查器遇到不支持的清单格式或无法确定结果时返回 `unknown`，不能猜测为通过；存在 `unknown` 时本次命令以退出码 `3` 结束。

每条检查结果至少包含规则 ID、级别、文件路径（如适用）、实际值、期望值和原因。退出码固定为：`0` 无失败（允许有警告），`1` 存在 mandatory 失败，`2` 配置或规则解析错误，`3` 检查器无法运行或输入格式不支持。不得用“依赖过重”等没有阈值或证据的主观判断作为确定性失败条件。

检查：

```text
是否存在 README
是否存在测试目录
是否存在 Migration
是否存在架构说明
是否存在必要配置
```

---

### 18.2 Dependency

检查：

```text
是否存在禁止依赖
是否擅自引入 Redis
是否擅自引入 MQ
是否存在 SNAPSHOT
是否违反规则中明确列出的依赖限制
```

---

### 18.3 AI Review（MVP 之后）

主观工程问题交给 AI。

AI Review 不属于 MVP 的确定性 `eng validate`。后续若实现，可作为显式、非阻断的独立审查模式运行；报告 findings 和引用证据，不得伪装成确定性检查结果。

AI 根据 resolved rules 审查：

```text
是否存在过度抽象
是否职责混乱
是否出现巨型 Service
是否存在不合理依赖
是否存在提前设计
是否违反架构边界
是否存在重复实现
```

原则：

```text
确定性规则
→ 程序检查

主观工程规则
→ AI Review
```

不要混在一起。MVP 只实现可判定的规则检查；主观审查作为后续能力，不影响确定性命令的退出码。

---

## 19. 新项目完整使用流程

以后创建新项目时：

```bash
mkdir new-product
cd new-product

git init

eng init
```

通过交互生成：

```text
new-product/
├── engineering.yaml
├── AGENTS.md
├── CLAUDE.md
├── .cursor/
│   └── rules/
│
├── .ai/
│   ├── manifest.yaml
│   ├── project-context.md
│   └── resolved/
│
└── ...
```

然后直接打开：

- Claude Code
- Codex
- Cursor

开始描述业务需求即可。

例如：

```text
我要开发一个企业内部知识管理系统。
先帮我完成产品和技术设计。
```

AI 在进入设计前已经自动知道：

- 工程复杂度偏好
- 抽象原则
- 架构原则
- 模块职责要求
- 基础设施引入规则
- 数据库要求
- 测试原则
- 安全原则
- AI 行为规范

从而减少重复提示。

---

## 20. 推荐的使用原则

整个系统可以遵循四句话：

> 能模板化的，不提示。

> 能配置化的，不描述。

> 能程序校验的，不依赖 AI 遵守。

> 只有真正需要判断的问题，才交给 AI。

这是 Engineering Harness 最核心的设计原则。

---

## 21. 第一版 MVP 范围

原始产品建议中的第一版范围如下。当前仓库的已实现边界更小，具体以本节末尾的“当前实现”列表为准。

只实现：

```text
eng init
eng resolve
eng sync
eng validate
eng explain
```

配置：

```text
engineering.yaml
registry.yaml
rules/
```

暂时不要实现：

- Web UI
- 数据库
- 用户系统
- 权限系统
- 云端平台
- 向量数据库
- 知识库
- Workflow 引擎
- Agent 平台
- MCP 平台

第一版核心目标只有一个：

> 验证这套规范体系能否稳定提升 AI 创建新项目时的工程质量。

### 当前实现

- 已实现：`eng resolve`、`eng validate`、Profile/Registry/Manifest Schema、确定性规则匹配、暂存发布、Manifest 摘要校验，以及 Registry 声明的文件和 `package.json` 依赖检查。
- 尚未实现：`eng init`、远程 `eng sync`、`eng explain`、AI Adapter、AI Review、CI 集成和服务端。
- 依赖检查目前仅理解 Node `package.json`；文件 glob 只在项目根目录内检查。

---

## 22. 推荐技术实现

CLI 本身不需要为了主业务技术栈而选择 Java。

推荐：

```text
Node.js + TypeScript
```

原因：

- CLI 开发简单
- 文件操作方便
- YAML / JSON 处理方便
- npm / pnpm 安装方便
- Claude / Codex / Cursor 调用方便
- 后续扩展 MCP、Skill、IDE Adapter 容易

技术结构可以非常简单：

```text
eng-cli/
├── src/
│   ├── commands/
│   │   ├── init.ts
│   │   ├── resolve.ts
│   │   ├── sync.ts
│   │   ├── validate.ts
│   │   └── explain.ts
│   │
│   ├── resolver/
│   ├── registry/
│   ├── validator/
│   ├── standards/
│   └── adapters/
│
├── package.json
└── tsconfig.json
```

---

## 23. 后续演进方向

当第一版验证成功后，可以继续扩展。

### Phase 2

增加：

```text
eng diff
eng search
eng doctor
eng upgrade
```

能力：

- 规范版本 diff
- 规则全文搜索
- 项目规范健康检查
- 升级冲突提示

---

### Phase 3

增加：

- IDE Adapter
- Claude Code Skill
- Codex Skill
- Cursor Adapter
- Git Hook
- CI Pipeline

例如：

```text
git commit
↓
eng validate
↓
通过
↓
提交
```

---

### Phase 4

再考虑可视化平台。

例如：

```text
Engineering Hub
```

提供：

- 规范管理
- 规则版本
- 项目接入情况
- 规范违反统计
- 项目技术栈分布
- AI Review 结果
- 企业级规范发布

但这不应该出现在 MVP。

---

## 24. 最终推荐架构

最终形态：

```text
┌─────────────────────────┐
│ engineering-standards   │
│                         │
│ 工程规范唯一真相源       │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ eng CLI                 │
│                         │
│ init                    │
│ resolve                 │
│ sync                    │
│ validate                │
│ explain                 │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ Project Repository      │
│                         │
│ engineering.yaml        │
│ .ai/resolved            │
│ manifest.yaml           │
│ project-context.md      │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ AI Adapter Layer        │
│                         │
│ CLAUDE.md               │
│ AGENTS.md               │
│ Cursor Rules            │
│ Future Agent Adapter    │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ Claude / Codex / Cursor │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ Validator               │
│                         │
│ Deterministic Checks    │
│ AI Review               │
└─────────────────────────┘
```

---

## 25. 一句话总结

Engineering Harness 的核心不是“让 AI 记住你的开发习惯”，而是：

> 把个人工程经验从 Prompt 中抽离出来，变成可版本化、可继承、可选择、可执行、可校验的工程资产。

最终，新项目只需要声明：

```text
这个项目是什么
```

而不需要每次重新解释：

```text
这个项目应该怎么做好
```

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

示例：

```yaml
rules:

  constitution:
    always: true
    path: constitution

  backend:
    when:
      capabilities.backend: true
    path:
      - capabilities/backend.md

  java:
    when:
      stack.backend.language: java
    path:
      - stacks/java

  postgresql:
    when:
      stack.database.type: postgresql
    path:
      - stacks/postgresql

  offline:
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

核心保留五个。

### 13.1 eng init

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
eng resolve
```

根据当前 `engineering.yaml` 重新解析应该启用的规则。

适合：

- 修改技术栈后
- 新增能力后
- 修改部署方式后
- 更新项目约束后

---

### 13.3 eng sync

```bash
eng sync
```

同步最新的 Standards Repository。

例如：

```text
v1.8.0
→
v1.9.0
```

然后重新解析规则。

---

### 13.4 eng validate

```bash
eng validate
```

检查当前项目是否违反工程规范。

例如：

- 是否缺少必要文件
- 是否违反依赖规则
- 是否引入不允许的基础设施
- 是否缺少 Migration
- 是否存在基础结构问题

---

### 13.5 eng explain

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
standards:
  source: engineering-standards
  version: 1.3.0
  resolvedAt: 2026-10-07

rules:
  - constitution/principles
  - constitution/architecture
  - capabilities/backend
  - capabilities/database
  - stacks/java
  - stacks/postgresql
```

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
| 禁止提交密码 | mandatory |
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

level: mandatory

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

Validator 第一版不要做得太重。

不要一开始就试图构建一个完整 AI SonarQube。

第一版只做三类。

---

### 18.1 Project Structure

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
是否引入过重依赖
```

---

### 18.3 AI Review

主观工程问题交给 AI。

例如：

```bash
eng validate --ai
```

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

不要混在一起。

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

第一版建议严格控制。

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

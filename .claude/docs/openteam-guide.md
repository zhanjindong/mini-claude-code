# OpenTeam 使用指南

> 版本: 0.2
> 最后更新: 2026-03-17

## 简介

OpenTeam 是一个基于 Claude Code 的 **AI 研发调度中心**，通过 5 个专业 Agent 协作完成软件研发全流程。支持三种执行模式适配不同场景，内置跨会话记忆持久化机制，支持多人接续开发。

## 安装方式

将 `openteam` 目录下文件复制到你的项目根目录下即可：

```bash
cp -r openteam/*/ your-project/
```

然后在项目目录下启动 Claude，`/openteam help` 查看使用帮助。

确保项目根目录包含：
- `.claude/commands/` — 所有命令文件
- `.claude/agents/` — Agent 定义文件
- `.claude/rules/` — 项目规范文件
- `.claude/hooks/` — 自动化护栏脚本
- `CLAUDE.md` — AI 协作指南

---

## 命令速查表

### 研发流程

| 命令 | 说明 |
|------|------|
| `/openteam pipeline [需求]` | 严格流水线模式 |
| `/openteam team [需求]` | 智能调度模式 |
| `/openteam auto [需求]` | 自主规划模式 |
| `/openteam help` | 查看本使用说明 |

### 研发阶段命令

| 命令 | 说明 | 产出 |
|------|------|------|
| `/ot-product` | 需求分析 | DESIGN.md 需求规格 |
| `/ot-plan` | 规划设计 | DESIGN.md 技术方案 + TODO.md |
| `/ot-develop` | 开发实现 | 代码 + TODO.md 进度更新 |
| `/ot-testing` | 测试验证 | 测试用例 + 测试报告 |
| `/ot-review` | 审查迭代 | 审查报告 |

### 工具命令

| 命令 | 说明 |
|------|------|
| `/ot-commit` | 智能提交（Angular 格式） |
| `/ot-build-fix` | 构建排障 |
| `/ot-refactor` | 安全重构 |
| `/ot-debug` | 系统排查 |
| `/ot-changelog` | 变更日志生成 |
| `/ot-clear` | 清理项目状态，启动新项目 |

### 生成命令

| 命令 | 说明 | 适用项目 |
|------|------|---------|
| `/ot-create-api` | 生成 API 接口 | 后端 |
| `/ot-create-test` | 生成测试用例 | 全栈 |
| `/ot-create-component` | 生成 Vue 组件 | 前端 |
| `/ot-create-page` | 生成页面全套 | 前端 |

---

## 三种调度模式

### Pipeline — 严格流水线

**适用**: 新功能开发、需求不明确、全流程可追溯

按 `product → plan → develop → testing → review` 顺序执行，每阶段需用户确认。发现问题可回退迭代。

### Team — 智能调度

**适用**: 需求明确、Bug 修复、小功能迭代

调度中心根据任务自动选择 Agent 组合（如修 Bug 只需 `develop → testing`），展示计划供用户确认。

### Auto — 自主规划

**适用**: 探索性任务、跨领域复杂任务、非标准流程

突破固定流程，自主设计最优策略，可并行 Agent、自定义顺序、动态调整。

---

## Agent 分工表

| Agent | 角色 | 输入 | 输出 |
|-------|------|------|------|
| **Product** | 需求分析师 | 用户需求 | DESIGN.md 需求规格 |
| **Plan** | 架构设计师 | 需求规格 | DESIGN.md 技术方案 + TODO.md |
| **Develop** | 软件工程师 | 技术方案 + TODO.md | 代码实现 + TODO.md 进度 |
| **Testing** | 测试工程师 | 验收标准 + 代码 | 测试方案 + 测试报告 |
| **Review** | 质量专家 | 全部产出物 | 审查报告（可触发迭代回退） |

权限约束：只有 Develop 可修改源代码，Testing 可写测试代码但禁止改源码，Product/Plan 只产出文档。详见各 Agent 定义文件（`.claude/agents/*.md`）。

---

## 跨会话接续开发

> 详细说明见 `.claude/docs/continuation-guide.md`

### 记忆三件套

Claude Code 每次会话独立，上下文在会话结束后丢失。OpenTeam 通过三份文件实现跨会话接续：

| 文件 | 作用 | 谁维护 |
|------|------|--------|
| `DESIGN.md` | 需求规格 + 技术方案 | product / plan Agent |
| `TODO.md` | 任务列表 + 进度（checkbox） | plan 生成，develop 更新 |
| `.claude/memory/handoff.md` | 工作交接（状态、决策、注意事项、下一步） | Claude + Stop hook |

新会话启动时 Claude 自动读取这三份文件，恢复完整上下文。

### handoff.md 三层写入架构

handoff.md 由 Claude 和 Stop hook 协作维护，分为 7 个段落：

| 段落 | 谁写 | 时机 |
|------|------|------|
| 元数据（时间/用户/分支） | Stop hook 自动 | 每次会话结束 |
| 本次改动 | Stop hook 自动 | 每次会话结束 |
| 最近提交 | Stop hook 自动 | 每次会话结束 |
| 当前状态 | Claude | 里程碑 + 会话结束 |
| 关键决策 | Claude | 做决策时追加 |
| 注意事项 | Claude | 发现问题时追加 |
| 下一步 | Claude | 里程碑 + 会话结束 |

三级触发机制：

| 级别 | 触发条件 | 写入要求 |
|------|---------|---------|
| 里程碑 | 功能完成、重要决策、踩坑解决 | 必须写入 |
| 会话结束 | 用户说"先到这"等结束信号 | 必须写入（兜底） |
| 增量 | 每 3 次 commit / 上下文压缩时 | 建议写入 |

### 接续操作方式

| 场景 | 操作 |
|------|------|
| 继续上次的完整流水线 | `/openteam pipeline 继续` |
| 只做开发 | `/ot-develop` |
| 从指定任务恢复 | `/ot-develop 从 T07 开始` |
| 自然语言接续 | `继续开发，上次做到哪了？` |
| 查看当前进度 | 读 `TODO.md` 或问 Claude |
| 查看交接信息 | 读 `.claude/memory/handoff.md` |

### 项目清理与重新开始

当需要清理旧项目状态、启动新项目时：

```
/ot-clear
```

清理范围：`handoff.md` + `DESIGN.md` + `TODO.md`。框架配置（commands/agents/rules/hooks）不受影响。

支持参数：

| 参数 | 效果 |
|------|------|
| `--keep-design` | 保留 DESIGN.md（同项目重新规划） |
| `--no-commit` | 只删文件，不自动提交 |
| `--all` | 跳过确认直接清理 |

---

## Hooks 自动化护栏

### 阻断型

| 护栏 | 说明 |
|------|------|
| `block-npm-yarn.sh` | 禁止使用 npm/yarn |
| `block-force-push.sh` | 禁止 force push |
| `block-push-main-branch.sh` | 禁止直接 push 到 master/release |
| `block-dangerous-command.sh` | 拦截高危命令 |
| `block-options-api.sh` | 拦截 Vue Options API |
| `check-hardcoded-secret.sh` | 扫描硬编码密钥 |

### 提醒型

| 护栏 | 说明 |
|------|------|
| `check-tmux-reminder.sh` | 长耗时服务提醒使用 tmux |
| `check-skip-tests-reminder.sh` | 跳过测试时提醒 |
| `check-system-out.sh` | 检查 System.out |
| `check-console-log.sh` | 扫描 console.log |
| `post-commit-handoff-reminder.sh` | 提交后提醒更新 handoff |

### 会话管理

| 护栏 | 说明 |
|------|------|
| `memory-save.sh` | 会话结束时自动刷新 handoff git 段落 |
| `strategic-compact.sh` | 上下文接近限制时触发压缩 |

---

## 核心文档说明

| 文档 | 用途 |
|------|------|
| `DESIGN.md` | 需求规格 + 技术方案，随 product/plan 阶段生成和更新 |
| `TODO.md` | 任务列表 + 进度追踪，plan 生成，develop 更新 |
| `.claude/memory/handoff.md` | 跨会话工作交接，Claude + Stop hook 协作维护 |
| `CLAUDE.md` | AI 协作指南，项目入口文件 |
| `.claude/docs/continuation-guide.md` | 接续开发详细指南（含实际案例） |
| `.claude/hooks/memory-persistence.md` | 记忆持久化机制完整说明 |

---

## 项目类型自动识别

通过 `.claude/rules/context-*.md` 的 `globs` 配置自动识别：

| 检测到的文件 | 加载的规范 |
|-------------|-----------|
| `*.java` | `context-backend.md` — Spring Boot + Java + MyBatis-Plus |
| `*.vue` / `*.ts` / `*.tsx` | `context-frontend.md` — Vue 3 + TypeScript + Element Plus |

扩展：新增 `.claude/rules/context-{type}.md` 并配置 `globs` 即可。

---

## 快速开始

1. 将 OpenTeam 配置复制到项目中
2. 在 Claude Code 中打开项目
3. 输入 `/openteam` 选择模式开始工作

**推荐**: 首次使用选择 `pipeline` 模式体验完整流程，熟悉后切换到 `team` 模式提高效率。

---

## 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 0.2 | 2026-03-17 | 新增跨会话接续开发说明、handoff 三层架构、`/ot-clear` 命令、`post-commit-handoff-reminder` hook |
| 0.1 | 2026-03-17 | 初始版本，5 Agent + 3 模式 + 命令体系 + Hooks 护栏 |

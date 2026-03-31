---
description: 项目清理 — 清理 memory、DESIGN.md、TODO.md，为新项目准备干净环境
---

# /ot-clear 项目清理

你是一名项目管理助手，负责清理当前项目的 AI 协作状态，为启动新项目准备干净环境。

## 清理范围

以下文件/目录属于清理目标：

| 目标 | 说明 |
|------|------|
| `.claude/memory/handoff.md` | 工作交接记录 |
| `.claude/memory/*.md`（除框架文档外） | 项目相关的记忆文件 |
| `DESIGN.md` | 需求规格与技术方案 |
| `TODO.md` | 开发任务与进度 |

**不清理**的内容（这些是框架本身，不随项目变化）：
- `.claude/commands/` — 命令定义
- `.claude/agents/` — Agent 定义
- `.claude/rules/` — 项目规范
- `.claude/hooks/` — 自动化护栏（含 `memory-persistence.md`、`strategic-compact.md`）
- `.claude/docs/` — 使用文档
- `.claude/settings.json` — 框架配置
- `CLAUDE.md` — AI 协作指南

## 执行步骤

### 第一步：展示当前状态

1. 读取 `.claude/memory/handoff.md`，展示当前项目的状态摘要
2. 读取 `TODO.md`（如存在），展示任务进度
3. 列出 `.claude/memory/` 下所有文件

向用户确认："即将清理以上项目状态，是否继续？"

### 第二步：确认后执行清理

用户确认后：

1. **检查未提交变更**：执行 `git status`，如有未提交的项目代码变更，提醒用户先提交或决定是否丢弃
2. **清理 memory 目录**：删除 `.claude/memory/` 下所有 `.md` 文件
3. **删除项目文档**：删除 `DESIGN.md` 和 `TODO.md`（如存在）
4. **提交清理记录**：
   - `git add -A .claude/memory/ DESIGN.md TODO.md`
   - `git commit -m "chore: 清理项目状态，准备启动新项目"`

### 第三步：确认结果

1. 执行 `git status` 确认工作区干净
2. 输出清理完成信息

## 可选参数

- `--keep-design`：保留 DESIGN.md（适用于同项目重新规划任务的场景）
- `--no-commit`：只清理文件，不自动提交
- `--all`：跳过确认，直接清理（慎用）

解析方式：从 $ARGUMENTS 中匹配上述参数。

## 约束

- **必须先展示再确认**，禁止不经确认直接清理
- 如果用户传了 `--all` 参数，可以跳过确认直接执行
- 清理后输出提示：可以使用 `/openteam` 或 `/ot-product` 开始新项目

$ARGUMENTS

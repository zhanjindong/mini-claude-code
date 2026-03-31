# 接续开发使用说明

> 本文档说明如何在 Claude Code 多会话场景下进行接续开发。以「订单管理系统」为实际案例，展示从中断到恢复的完整流程。

## 核心概念

Claude Code 每次会话独立，上下文在会话结束后丢失。OpenTeam 通过以下机制实现跨会话接续：

| 持久化载体 | 作用 | 谁写 |
|-----------|------|------|
| `DESIGN.md` | 需求规格 + 技术方案 | product / plan Agent |
| `TODO.md` | 任务列表 + 进度（checkbox） | plan 生成，develop 更新 |
| `.claude/memory/handoff.md` | 工作交接（状态、决策、注意事项、下一步） | Claude + Stop hook |

三份文件构成"项目记忆三件套"，新会话启动时自动读取，恢复完整上下文。

---

## 实际案例：订单管理系统

### 背景

我们用 `/openteam pipeline` 启动了一个订单管理系统的开发。Pipeline 流水线共 5 个阶段：

```
product（需求分析）→ plan（技术设计）→ develop（开发实现）→ testing（测试）→ review（审查）
```

假设在第一次会话中完成了 product 和 plan 阶段，生成了：
- `DESIGN.md` v1.1 — 需求 + 技术方案
- `TODO.md` — 16 个开发任务，进度 0/16

此时关闭会话，或在claude会话中git commit提交记录，会自动保存上下文信息到.claude/memory下，下次要从 develop 阶段继续。

### 会话结束时自动发生的事

```
┌─ 会话结束 ─────────────────────────────────────────┐
│                                                      │
│  1. Claude 写入 handoff.md 语义段落                    │
│     - 当前状态、关键决策、注意事项、下一步               │
│                                                      │
│  2. Stop hook (memory-save.sh) 自动执行               │
│     - 刷新元数据（时间/用户/分支）                      │
│     - 刷新「本次改动」（git diff --name-only）          │
│     - 刷新「最近提交」（git log --oneline -5）          │
│     - 保留 Claude 写入的语义段落不动                    │
│                                                      │
│  3. git add .claude/memory/ （自动暂存）               │
└──────────────────────────────────────────────────────┘
```

此时 `handoff.md` 的内容类似：

```markdown
# 工作交接

> 最后更新: 2026-03-17 14:19
> 更新者: jdzhan
> 分支: master

## 当前状态
- DESIGN.md v1.1 已确认，TODO.md 16 个任务 0/16
- order/ 目录尚未创建，等待 develop Agent 开始编码

## 本次改动
- `DESIGN.md`
- `TODO.md`
- `.claude/memory/handoff.md`

## 最近提交
(git log --oneline -5 自动生成)

## 关键决策
- 选择 Spring Boot 3.x + H2 内存数据库
- 单 Maven 模块，不拆分子模块
- mybatis-plus-spring-boot3-starter（Boot3 专用版本）

## 注意事项
- H2 连接 URL 需加 MODE=MySQL 保证兼容
- MetaObjectHandler 必须注册为 @Component
- Spring Boot 3.x 用 spring.sql.init.mode 而非旧版配置

## 下一步
- develop Agent 接手：按 TODO.md 从 T01 开始
- 每完成一个阶段提交一次 commit
```

---

## 接续开发操作

### 方式一：继续 Pipeline 流程

直接告诉 Claude 继续：

```
/openteam pipeline 继续订单管理系统的开发
```

Claude 会自动：
1. 读取 `handoff.md` → 得知当前在 develop 阶段
2. 读取 `TODO.md` → 得知任务 0/16，从 T01 开始
3. 读取 `DESIGN.md` → 获取技术方案细节
4. 跳过已完成的 product/plan 阶段，直接进入 develop

### 方式二：单独调用 develop Agent

如果你只想做开发，不需要完整流水线：

```
/ot-develop
```

develop Agent 会自动读取 TODO.md 和 DESIGN.md，从第一个未完成的任务开始。

### 方式三：从任意任务恢复

指定从某个任务开始：

```
/ot-develop 从 T07 开始
```

### 方式四：自然语言接续

无需记住命令，直接描述意图：

```
继续开发订单系统，上次做到哪了？
```

Claude 会读取 handoff.md，告诉你当前进度并询问如何继续。

---

## 开发过程中的自动持久化

开发不是一次会话能完成的。假设 develop 阶段做到 T06（完成数据层），需要中断：

### 中断前的 TODO.md 状态

```markdown
## 阶段一：项目骨架
- [x] T01 - 初始化 Maven 项目结构

## 阶段二：数据层
- [x] T02 - 数据库初始化脚本
- [x] T03 - 订单状态枚举
- [x] T04 - Order 实体类
- [x] T05 - MyBatis-Plus 自动填充配置
- [x] T06 - OrderMapper

## 阶段三：公共基础设施
- [ ] T07 - 统一响应体 ApiResponse    ← 下次从这里继续
- [ ] T08 - BizException + 全局异常处理器
...
```

### 自动触发的持久化

| 触发时机 | 发生了什么 |
|---------|-----------|
| 每次 git commit | PostToolUse hook 提醒 Claude 是否需要更新 handoff |
| 里程碑提交（feat/fix） | Claude 必须更新 handoff 的语义段落 |
| 累计 3 次 commit | Claude 建议增量更新 handoff |
| 上下文接近限制 | 自动压缩协议触发，核心信息写入 memory |
| 会话结束 | Stop hook 兜底刷新 git 段落 |

### 下一次会话恢复

```
/ot-develop
```

Claude 读取 TODO.md，看到 T01-T06 已勾选，自动从 T07 继续。同时 handoff.md 中的注意事项（如 H2 MODE=MySQL 配置）会被带入新会话上下文。

---

## 多人协作接续

handoff.md 通过 git 共享。团队成员 A 完成数据层后提交，成员 B 拉取代码后启动新会话：

```bash
git pull origin master
claude   # 启动 Claude Code
```

Claude 自动读取 handoff.md，看到 A 的交接信息：
- 当前状态：数据层完成
- 关键决策：选型理由、架构决策
- 注意事项：已踩过的坑
- 下一步：从 T07 开始

成员 B 无需任何背景知识即可接续开发。

---

## 故障恢复

### 场景：Claude 未写入 handoff 就中断了

Stop hook 会兜底写入 git 元数据段落。语义段落（当前状态、下一步等）显示占位符：

```
## 当前状态
[Claude 未写入 - 请在会话结束前更新此段]
```

恢复方式：TODO.md 的 checkbox 仍然准确反映进度，Claude 从 TODO.md 恢复即可。

### 场景：TODO.md 和代码不一致

运行构建验证：

```
/ot-build-fix
```

或让 Claude 自行核查：

```
检查 TODO.md 的进度是否和实际代码一致，修正偏差
```

### 场景：DESIGN.md 需要变更

在开发过程中发现设计有问题：

```
/ot-plan 更新：listOrders 需要加分页支持
```

plan Agent 会更新 DESIGN.md 和 TODO.md，develop Agent 下次会读到最新方案。

---

## 最佳实践

1. **不要手动编辑 handoff.md 的 git 段落**（元数据、本次改动、最近提交），这些由 Stop hook 自动维护
2. **重要决策一定要 commit**，commit 触发 PostToolUse hook，Claude 会更新 handoff
3. **会话结束前说一句"先到这"**，Claude 会主动写入 handoff 语义段落作为兜底
4. **TODO.md 是进度的唯一真相**，handoff.md 是上下文的补充说明
5. **长任务分阶段提交**，每个阶段一次 commit + handoff 更新，避免单次会话积累过多未持久化的上下文
6. **信任自动化**，不需要手动执行 `git add .claude/memory/`，Stop hook 会处理

---

## 快速参考

| 我想... | 操作 |
|---------|------|
| 继续上次的完整流水线 | `/openteam pipeline 继续` |
| 只做开发 | `/ot-develop` |
| 从指定任务开始 | `/ot-develop 从 T07 开始` |
| 查看当前进度 | 读 `TODO.md` 或问 Claude "现在做到哪了" |
| 查看交接信息 | 读 `.claude/memory/handoff.md` |
| 修改设计方案 | `/ot-plan 更新：...` |
| 排查构建问题 | `/ot-build-fix` |
| 补测试 | `/ot-testing` |
| 全流程审查 | `/ot-review` |

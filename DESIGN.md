# DESIGN.md — mini-claude-code 技术方案

> 版本: v0.1.0
> 状态: Phase 0 ~ Phase 2 已实现
> 日期: 2026-04-01

---

## 项目概述

mini-claude-code 是一个轻量级 Claude Code 风格 CLI 工具，用 ~3500 行 TypeScript 实现了完整的对话式编程助手体验：流式对话、工具调用、Skills 系统、MCP 协议、Hooks 生命周期、权限管理、会话持久化等。

---

## Phase 0 — 核心骨架

> 提交: 997472c ~ f7bcdf3
> 状态: ✅ 已完成

### 需求

从零搭建一个最小可用的 Claude Code 风格 CLI：
1. 基础 REPL 交互循环
2. 流式调用 OpenAI 兼容 API
3. 工具调用与结果回传循环
4. Skills 可复用指令模板系统
5. 终端 Markdown 渲染

### 技术方案

#### 架构设计

```
index.ts (REPL 入口)
  └─ QueryEngine (engine.ts)
       ├─ OpenAI SDK (流式 chat.completions)
       ├─ 工具注册表 (tools/index.ts)
       │    ├─ Bash / Read / Write / Edit / Glob / Grep
       │    └─ Skill tool (动态注册)
       └─ buildSystemPrompt()
```

**核心循环**: 用户输入 → API 流式调用 → 文本输出 / 工具调用 → 工具执行 → 结果回传 API → 循环直到无工具调用

#### 关键模块

| 模块 | 职责 |
|------|------|
| `src/index.ts` | REPL 交互、命令解析、Skill 调用 |
| `src/engine.ts` | QueryEngine 类，流式调用 + 工具执行循环 |
| `src/types.ts` | ToolDefinition / ToolInput 类型定义 |
| `src/skills.ts` | Skill 加载（YAML frontmatter + Markdown）、参数替换、执行 |
| `src/markdown.ts` | 终端 Markdown 渲染（标题、代码块、列表、链接、行内样式） |
| `src/tools/bash.ts` | Shell 命令执行，execSync + 超时控制 |
| `src/tools/read.ts` | 文件读取，支持 offset/limit 行范围 |
| `src/tools/write.ts` | 文件创建/覆写 |
| `src/tools/edit.ts` | 精确字符串替换编辑 |
| `src/tools/glob.ts` | glob 模式匹配文件搜索 |
| `src/tools/grep.ts` | 正则表达式内容搜索（基于 child_process 调用 grep/rg） |

#### 多提供商支持

```typescript
const PROVIDERS = {
  minimax:    { baseURL: "https://api.minimax.chat/v1", defaultModel: "MiniMax-M2.5" },
  deepseek:   { baseURL: "https://api.deepseek.com",    defaultModel: "deepseek-chat" },
  openai:     { baseURL: "https://api.openai.com/v1",   defaultModel: "gpt-4o" },
  openrouter: { baseURL: "https://openrouter.ai/api/v1", defaultModel: "anthropic/claude-sonnet-4" },
};
```

通过 `--provider` / `--base-url` / `--model` CLI 参数或环境变量切换。

#### Skills 系统

- **目录结构**: `.mini-claude-code/skills/{name}/SKILL.md`（项目级）+ `~/.mini-claude-code/skills/`（用户级）
- **文件格式**: YAML frontmatter（name/description/when_to_use/allowed_tools/arguments）+ Markdown 正文
- **双向调用**: 用户 `/skill-name args` 手动调用 + 模型通过 Skill tool 自动调用
- **参数替换**: `{{ argument }}` 模板变量，最后一个参数消费所有剩余文本

#### 交互增强

- **命令自动补全**: `/` 开头输入弹出下拉菜单（拦截 `_ttyWrite`），Tab 补全，上下键选择
- **Markdown 渲染**: 自定义轻量渲染器（替代 marked-terminal），支持代码块、标题、列表、引用、行内样式
- **Thinking Spinner**: 等待模型响应时显示动画加载指示器
- **中断支持**: Ctrl+C / Escape 通过 AbortController 中断正在进行的 API 请求
- **`<think>` 过滤**: 自动过滤 DeepSeek 等模型的思维链标签

---

## Phase 1 — 配置、上下文、权限

> 提交: f9785c8（部分）
> 状态: ✅ 已完成

### 需求

为 mini-claude-code 实现三个基础设施功能：
1. **CLAUDE.md 加载系统** — 读取项目/用户级上下文文件并注入系统提示词
2. **权限系统** — 工具执行前询问用户确认，支持会话级记忆和持久化
3. **配置系统** — 多层级 JSON 配置，支持项目/用户/环境变量/CLI 参数

### 技术方案

#### 1. `src/config.ts` — 四层配置合并

```
defaults → ~/.claude/config.json → .claude/config.json → 环境变量 → CLI 参数
```

- **接口**: `MccConfig`（文件结构）/ `ResolvedConfig`（合并后完整配置）
- **单例**: `loadConfig()` 初始化 + `getConfig()` 返回缓存
- **持久化**: `saveUserConfig(patch)` 合并写入 `~/.claude/config.json`
- **环境变量**: `API_KEY`/`OPENAI_API_KEY` → apiKey, `MCC_PROVIDER`/`MCC_MODEL`/`MCC_BASE_URL`

#### 2. `src/context.ts` — CLAUDE.md 上下文加载

**搜索优先级（低→高）**:
```
~/.claude/CLAUDE.md          (user)
parent dirs CLAUDE.md        (farthest → nearest, max 10 levels)
{cwd}/CLAUDE.md              (project)
{cwd}/.claude/CLAUDE.md      (project .claude subdir)
{cwd}/CLAUDE.local.md        (project-local, highest priority)
```

- **注入格式**: `<claude-md source="{relative_path}">{content}</claude-md>`
- **缓存**: 进程内模块级变量，`clearContextCache()` 强制刷新

#### 3. `src/permissions.ts` — 分级权限系统

**工具权限级别** (ToolDefinition.permissionLevel):
- `safe`: Read / Glob / Grep — 自动通过
- `write`: Write / Edit — 需要确认
- `execute`: Bash — 需要确认

**决策树**:
```
config.permissions[tool] → 会话规则 sessionRules → permissionLevel 检查 → 交互式询问
```

**交互方式**: stdin raw mode 读取单字符（y/a/n/d/Enter/Escape），不依赖 readline.Interface
- `y` / Enter → allow-once
- `a` → allow-always（写入 sessionRules + 持久化到 config）
- `n` / Escape → deny
- `d` → deny-always（写入 sessionRules + 持久化到 config）

**关键决策**: 权限询问时临时移除 stdin 上的 data/keypress 监听器，读取完成后恢复，避免按键泄漏到 readline 缓冲区。

#### 4. 引擎集成

- `buildSystemPrompt(skillsSummary?, contextContent?)` — 增加 contextContent 参数
- 工具执行循环 `checkPermission()` → 拒绝时 yield 提示 + push error 消息 + continue
- `EngineOptions` 增加 `contextContent` 字段

#### 模块交互图

```
index.ts (main)
  ├─ loadConfig(cliOverrides)          → config.ts → ResolvedConfig
  ├─ initPermissions(config)           → permissions.ts
  ├─ loadContext(cwd)                  → context.ts
  └─ new QueryEngine({ contextContent })
         └─ tool execution loop
                └─ checkPermission() → permissions.ts → stdin raw mode
```

---

## Phase 2 — MCP、Hooks、会话、Agent、扩展工具

> 提交: f9785c8
> 状态: ✅ 已完成

### 需求

扩展完整功能集：
1. **MCP 协议客户端** — 连接外部 MCP 服务器并注册其工具
2. **Hooks 生命周期** — 工具执行前后触发 shell 命令钩子
3. **会话持久化** — 保存/恢复对话历史
4. **Agent 子代理** — 启动独立子 Agent 处理复杂任务
5. **WebFetch 工具** — URL 内容抓取
6. **Task 任务管理** — 会话级多步任务跟踪
7. **自动上下文压缩** — 接近窗口限制时自动摘要
8. **多行粘贴检测** — 折叠显示多行粘贴内容
9. **Diff 渲染** — 彩色 git diff 显示

### 技术方案

#### 1. `src/mcp.ts` — MCP 协议客户端

- **传输**: JSON-RPC 2.0 over stdin/stdout (spawn 子进程)
- **协议流程**: initialize → notifications/initialized → tools/list → tools/call
- **配置**: `.claude/mcp.json` / `~/.claude/mcp.json`，格式 `{ mcpServers: { name: { command, args?, env?, cwd? } } }`
- **工具注册**: 发现的 MCP 工具以 `mcp_{server}_{tool}` 命名注册到 ALL_TOOLS
- **连接管理**: 模块级 Map 管理多连接，进程退出时自动 kill

```typescript
class McpConnection {
  async send(method: string, params?): Promise<unknown>  // JSON-RPC request
  async initialize(): Promise<void>
  async listTools(): Promise<McpToolInfo[]>
  async callTool(name: string, args: Record): Promise<string>
}
```

#### 2. `src/hooks.ts` — Hooks 生命周期

- **事件类型**: `beforeToolUse`（可阻断，非零退出码阻止工具执行）/ `afterToolResult`
- **配置**: `.claude/hooks.json` / `~/.claude/hooks.json`，格式 `{ hooks: [{ event, toolName?, command, timeout? }] }`
- **环境变量注入**: `TOOL_NAME`、`TOOL_INPUT`（JSON）、`TOOL_RESULT`（afterToolResult only）
- **执行**: execSync with timeout，支持按工具名过滤或匹配所有工具

#### 3. `src/session.ts` — 会话持久化

- **存储**: `~/.claude/sessions/{id}.json`，包含完整 messages 数组
- **元数据**: id / cwd / provider / model / createdAt / updatedAt / messageCount / summary
- **ID 生成**: `Date.now().toString(36) + random`
- **恢复**: `--resume` CLI 参数或 `/resume` 命令，按 cwd 匹配最近会话
- **自动保存**: 每次查询完成后 + 退出时自动 persistSession()

#### 4. `src/tools/agent.ts` — 子 Agent

- 创建独立 QueryEngine 实例，继承主引擎的 config 和 context
- 收集子 Agent 的全部文本输出和工具使用记录
- 输出长度超 30000 字符时截断
- permissionLevel: "safe"（子 Agent 内部工具调用仍受权限系统约束）

#### 5. `src/tools/webfetch.ts` — URL 内容抓取

- 仅允许 http/https 协议
- 30 秒超时（AbortController）
- HTML 内容自动 stripHtml（移除 script/style/注释/标签，解码 HTML 实体）
- 文本结果超 50000 字符时截断

#### 6. `src/tasks.ts` + `src/tools/task.ts` — 任务管理

- **内存存储**: 会话级 Map，不持久化
- **状态**: pending → in_progress → completed / failed
- **工具**: TaskCreate / TaskUpdate / TaskList，全部 permissionLevel: "safe"
- **显示**: `/tasks` 命令 + 状态图标（○/◐/●/✗）

#### 7. 自动上下文压缩 (engine.ts)

- 每次 API 调用前估算 history tokens（字符数 / 3）
- 超过 contextWindow * 0.75 且消息数 > 6 时触发
- 旧消息通过 LLM 摘要压缩为 `[Conversation Summary]`，保留最近 4 条消息
- 也可手动 `/compact` 触发

#### 8. 多行粘贴检测 (index.ts)

- 拦截 `process.stdin.emit("data")`，检测含换行符的多字节数据块
- 多行内容折叠为 `[Pasted text #N +X lines]` 指示器
- Enter 提交时展开为真实内容，显示预览（前 4 行 + 省略）

#### 9. Diff 渲染 (markdown.ts)

- `/diff` 命令执行 `git diff HEAD`
- 按行着色：`diff --git` 黄色粗体、`+` 绿色、`-` 红色、`@@` 青色、上下文行灰色

---

## 风险评估

| 风险 | 可能性 | 影响 | 缓解措施 |
|------|--------|------|----------|
| stdin raw mode 与 readline 冲突 | 中 | 高 | 权限询问时保存/恢复 stdin 状态，临时移除 data/keypress 监听器 |
| MCP 服务器启动失败 | 中 | 低 | try/catch 包裹，失败时 stderr 警告但不阻断主流程 |
| 父目录遍历加载过多 CLAUDE.md | 低 | 低 | 限制最多 10 层，不超过 homedir |
| config.json 语法错误 | 低 | 中 | JSON 解析失败时静默跳过，使用默认值 |
| 自动压缩丢失关键上下文 | 中 | 中 | 保留最近 4 条消息，摘要聚焦关键决策和文件变更 |
| 大量 MCP 工具导致 token 浪费 | 低 | 中 | 工具描述前缀 `[MCP: server]` 标识来源，未来可按需加载 |

---

## 文件清单

| 操作 | 路径 | 说明 | Phase |
|------|------|------|-------|
| 新建 | `src/index.ts` | REPL 交互、命令菜单、粘贴检测、会话管理 | 0 |
| 新建 | `src/engine.ts` | QueryEngine，流式调用 + 工具循环 + 权限 + 自动压缩 | 0 |
| 新建 | `src/types.ts` | ToolDefinition / ToolInput 类型定义 | 0 |
| 新建 | `src/skills.ts` | Skills 加载、解析、参数替换、执行 | 0 |
| 新建 | `src/markdown.ts` | 终端 Markdown 渲染 + Diff 渲染 | 0 |
| 新建 | `src/tools/bash.ts` | Shell 命令执行 | 0 |
| 新建 | `src/tools/read.ts` | 文件读取 | 0 |
| 新建 | `src/tools/write.ts` | 文件写入 | 0 |
| 新建 | `src/tools/edit.ts` | 文件编辑（字符串替换） | 0 |
| 新建 | `src/tools/glob.ts` | 文件模式匹配 | 0 |
| 新建 | `src/tools/grep.ts` | 内容搜索 | 0 |
| 新建 | `src/tools/index.ts` | 工具注册表 + Skill tool + MCP 工具注册 | 0 |
| 新建 | `src/config.ts` | 四层配置加载/合并/单例/持久化 | 1 |
| 新建 | `src/context.ts` | CLAUDE.md 上下文搜索/加载/缓存 | 1 |
| 新建 | `src/permissions.ts` | 分级权限检查/交互式授权/会话记忆/持久化 | 1 |
| 新建 | `src/hooks.ts` | Hooks 生命周期管理 | 2 |
| 新建 | `src/session.ts` | 会话持久化与恢复 | 2 |
| 新建 | `src/mcp.ts` | MCP 协议客户端（stdio 传输） | 2 |
| 新建 | `src/tasks.ts` | 会话级任务跟踪 | 2 |
| 新建 | `src/tools/webfetch.ts` | URL 内容抓取 | 2 |
| 新建 | `src/tools/agent.ts` | 子 Agent 启动 | 2 |
| 新建 | `src/tools/task.ts` | 任务管理工具（Create/Update/List） | 2 |

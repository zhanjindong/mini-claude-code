# TODO.md — mini-claude-code 开发任务清单

> 关联设计: DESIGN.md
> 创建日期: 2026-03-31
> 最后更新: 2026-04-01
> 总进度: 45/45 ✅

---

## Phase 0：核心骨架

### P0-01 项目初始化与基础 REPL
- **文件**: `package.json`、`tsconfig.json`、`src/index.ts`
- **内容**: 初始化 TypeScript 项目，搭建 readline REPL 交互循环，解析 CLI 参数（--provider/--model/--base-url/--api-key/-p），实现 /help /clear /exit 基础命令
- **状态**: [x] ✅

### P0-02 类型定义
- **文件**: `src/types.ts`
- **内容**: 定义 ToolDefinition / ToolInput 接口，Message / ContentBlock 类型
- **状态**: [x] ✅

### P0-03 QueryEngine 流式调用
- **文件**: `src/engine.ts`
- **内容**: 实现 QueryEngine 类，使用 OpenAI SDK 流式调用 chat.completions API，支持多 provider 预设（MiniMax/DeepSeek/OpenAI/OpenRouter），yield text/tool chunks，追踪 token 用量
- **状态**: [x] ✅

### P0-04 工具执行循环
- **文件**: `src/engine.ts`
- **内容**: 在流式响应中累积 tool_calls，解析 JSON 参数，调用 tool.execute()，将结果回传为 tool message，循环直到无工具调用。`<think>` 标签过滤
- **状态**: [x] ✅

### P0-05 内置工具 — Bash
- **文件**: `src/tools/bash.ts`
- **内容**: execSync 执行 shell 命令，支持超时控制、stderr 合并输出、结果截断
- **状态**: [x] ✅

### P0-06 内置工具 — Read
- **文件**: `src/tools/read.ts`
- **内容**: 文件读取，支持 offset/limit 行范围参数，带行号输出
- **状态**: [x] ✅

### P0-07 内置工具 — Write
- **文件**: `src/tools/write.ts`
- **内容**: 文件创建/覆写，自动创建父目录
- **状态**: [x] ✅

### P0-08 内置工具 — Edit
- **文件**: `src/tools/edit.ts`
- **内容**: 精确字符串替换编辑，支持 replace_all，唯一性检查
- **状态**: [x] ✅

### P0-09 内置工具 — Glob
- **文件**: `src/tools/glob.ts`
- **内容**: glob 模式匹配文件搜索，支持指定目录
- **状态**: [x] ✅

### P0-10 内置工具 — Grep
- **文件**: `src/tools/grep.ts`
- **内容**: 正则表达式内容搜索，调用系统 grep/rg
- **状态**: [x] ✅

### P0-11 工具注册表
- **文件**: `src/tools/index.ts`
- **内容**: ALL_TOOLS 数组管理所有工具，toOpenAITools() 转换为 OpenAI function 格式，getToolByName() 查找
- **状态**: [x] ✅

### P0-12 Skills 系统
- **文件**: `src/skills.ts`
- **内容**: YAML frontmatter 解析，双级目录扫描（项目级覆盖用户级），参数替换（`{{ arg }}`），Skill tool 动态注册，getSkillsSummary() 注入系统提示词
- **状态**: [x] ✅

### P0-13 终端 Markdown 渲染
- **文件**: `src/markdown.ts`
- **内容**: 自定义轻量渲染器（替代 marked-terminal），支持标题、代码块（语言标注）、无序/有序列表、引用、行内样式（粗体/斜体/删除线/行内代码/链接）、水平线
- **状态**: [x] ✅

### P0-14 命令下拉菜单
- **文件**: `src/index.ts`
- **内容**: 拦截 `_ttyWrite` 实现 `/` 前缀下拉菜单，上下键导航、Tab 补全、Escape 关闭，最多显示 8 项 + "... +N more"
- **状态**: [x] ✅

### P0-15 Thinking Spinner
- **文件**: `src/index.ts`
- **内容**: 等待模型响应时显示 Braille 字符动画（80ms 帧率），收到首 chunk 后停止
- **状态**: [x] ✅

### P0-16 请求中断支持
- **文件**: `src/index.ts`、`src/engine.ts`
- **内容**: Ctrl+C / Escape 通过 AbortController 中断 API 请求，stream 中检查 signal.aborted 提前退出
- **状态**: [x] ✅

### P0-17 单次模式
- **文件**: `src/index.ts`
- **内容**: `-p` / `--prompt` 或直接传参执行单次查询后退出
- **状态**: [x] ✅

---

## Phase 1：配置、上下文、权限

### P1-01 config.ts — 类型定义与默认值
- **文件**: `src/config.ts`（新建）
- **内容**: MccConfig / ResolvedConfig 接口定义，defaults 常量
- **状态**: [x] ✅

### P1-02 config.ts — 文件读取与合并
- **文件**: `src/config.ts`
- **内容**: loadConfig(overrides?) 读取 `~/.mcc/config.json` + `.mcc/config.json`，合并环境变量（API_KEY/MCC_PROVIDER/MCC_MODEL/MCC_BASE_URL），四层合并链
- **状态**: [x] ✅

### P1-03 config.ts — 单例与 saveUserConfig
- **文件**: `src/config.ts`
- **内容**: getConfig() 单例，saveUserConfig(patch) 写入 `~/.mcc/config.json`
- **状态**: [x] ✅

### P1-04 context.ts — 路径收集与文件读取
- **文件**: `src/context.ts`（新建）
- **内容**: collectCandidates(cwd) 五级搜索路径，readFileSync 逐一尝试，ContextFile 数组
- **状态**: [x] ✅

### P1-05 context.ts — 内容拼接与缓存
- **文件**: `src/context.ts`
- **内容**: `<claude-md source="...">` 格式拼接，进程内缓存，clearContextCache()
- **状态**: [x] ✅

### P1-06 types.ts — 增加 permissionLevel 字段
- **文件**: `src/types.ts`
- **内容**: ToolDefinition 增加 `permissionLevel?: "safe" | "write" | "execute"`
- **状态**: [x] ✅

### P1-07 各工具声明 permissionLevel
- **文件**: `src/tools/*.ts`
- **内容**: bash→execute, write/edit→write, read/glob/grep→safe
- **状态**: [x] ✅

### P1-08 permissions.ts — 会话规则与决策树
- **文件**: `src/permissions.ts`（新建）
- **内容**: SessionRules Map，initPermissions() 从 config 加载，决策树逻辑
- **状态**: [x] ✅

### P1-09 permissions.ts — stdin raw mode 交互
- **文件**: `src/permissions.ts`
- **内容**: promptUser() stdin raw mode 单字符读取，y/a/n/d/Escape/Enter 处理，临时移除/恢复 data/keypress 监听器
- **状态**: [x] ✅

### P1-10 permissions.ts — checkPermission 与持久化
- **文件**: `src/permissions.ts`
- **内容**: checkPermission() 导出函数，allow-always/deny-always 写入 sessionRules + 持久化到 config
- **状态**: [x] ✅

### P1-11 engine.ts — contextContent 注入
- **文件**: `src/engine.ts`
- **内容**: buildSystemPrompt(skillsSummary?, contextContent?)，EngineOptions 增加 contextContent
- **状态**: [x] ✅

### P1-12 engine.ts — 权限检查 + Hooks 调用
- **文件**: `src/engine.ts`
- **内容**: 工具执行前 checkPermission() + beforeToolUse hooks，执行后 afterToolResult hooks
- **状态**: [x] ✅

### P1-13 index.ts — 初始化顺序整合
- **文件**: `src/index.ts`
- **内容**: main() 中依次 loadConfig → initPermissions → loadHooks → loadContext → initSkills → registerMcpTools → new QueryEngine
- **状态**: [x] ✅

### P1-14 index.ts — banner 显示 context/MCP 信息
- **文件**: `src/index.ts`
- **内容**: printBanner 显示 provider/model/cwd/skills/MCP/context 加载信息
- **状态**: [x] ✅

---

## Phase 2：MCP、Hooks、会话、Agent、扩展工具

### P2-01 mcp.ts — McpConnection 类
- **文件**: `src/mcp.ts`（新建）
- **内容**: JSON-RPC 2.0 over stdin/stdout，spawn 子进程，请求/响应 pending Map，30s 超时，buffer 行分割
- **状态**: [x] ✅

### P2-02 mcp.ts — 初始化与工具发现
- **文件**: `src/mcp.ts`
- **内容**: initMcp() 读取配置，逐个连接服务器，initialize + tools/list，注册为 `mcp_{server}_{tool}` 命名的 ToolDefinition
- **状态**: [x] ✅

### P2-03 mcp.ts — 配置加载与连接管理
- **文件**: `src/mcp.ts`
- **内容**: loadMcpConfig() 读取 `.mcc/mcp.json` / `~/.mcc/mcp.json`，getMcpServers() 连接信息，closeMcp() 清理
- **状态**: [x] ✅

### P2-04 hooks.ts — 加载与匹配
- **文件**: `src/hooks.ts`（新建）
- **内容**: loadHooks() 从 `.mcc/hooks.json` / `~/.mcc/hooks.json` 加载，findMatchingHooks() 按 event + toolName 过滤
- **状态**: [x] ✅

### P2-05 hooks.ts — 执行与阻断
- **文件**: `src/hooks.ts`
- **内容**: executeHook() execSync + env 注入 + timeout，runHooks() 串行执行，beforeToolUse 非零退出阻断工具
- **状态**: [x] ✅

### P2-06 session.ts — 保存/加载/列表
- **文件**: `src/session.ts`（新建）
- **内容**: saveSession() / loadSession() / listSessions() / getLastSession()，存储到 `~/.mcc/sessions/`，SessionData 含完整 messages
- **状态**: [x] ✅

### P2-07 session.ts — 恢复与集成
- **文件**: `src/session.ts`、`src/index.ts`
- **内容**: generateSessionId()、extractSummary()，`--resume` CLI + `/resume` 命令，每次查询后 persistSession()
- **状态**: [x] ✅

### P2-08 WebFetch 工具
- **文件**: `src/tools/webfetch.ts`（新建）
- **内容**: URL 验证（仅 http/https），fetch + 30s 超时，HTML stripHtml 文本提取，50000 字符截断
- **状态**: [x] ✅

### P2-09 Agent 工具
- **文件**: `src/tools/agent.ts`（新建）
- **内容**: 创建独立 QueryEngine 实例，收集文本+工具输出，30000 字符截断
- **状态**: [x] ✅

### P2-10 Task 任务管理
- **文件**: `src/tasks.ts`（新建）、`src/tools/task.ts`（新建）
- **内容**: 内存 Map 存储，TaskCreate/TaskUpdate/TaskList 三个工具，状态图标显示，`/tasks` 命令
- **状态**: [x] ✅

### P2-11 自动上下文压缩
- **文件**: `src/engine.ts`
- **内容**: estimateHistoryTokens()（chars/3），超过 contextWindow*0.75 触发 compactHistory()，LLM 摘要旧消息，保留最近 4 条
- **状态**: [x] ✅

### P2-12 多行粘贴检测
- **文件**: `src/index.ts`
- **内容**: 拦截 stdin.emit("data")，多字节含换行 → handlePaste()，折叠为 `[Pasted text #N]` 指示器，提交时展开+预览
- **状态**: [x] ✅

### P2-13 Diff 渲染 + /diff /status 命令
- **文件**: `src/markdown.ts`、`src/index.ts`
- **内容**: renderDiff() 按行着色，/diff 执行 git diff HEAD，/status 执行 git status --short
- **状态**: [x] ✅

### P2-14 /permissions 命令
- **文件**: `src/index.ts`
- **内容**: /permissions 查看规则，/permissions reset 重置全部，/permissions reset {tool} 重置单个
- **状态**: [x] ✅

---

## 任务依赖关系

```
Phase 0:
P0-01 → P0-02 → P0-03 → P0-04 → P0-05~10 → P0-11 → P0-12
                                                        ↓
                                              P0-13 ~ P0-17 (并行)

Phase 1:
P1-01 → P1-02 → P1-03
P1-04 → P1-05
P1-06 → P1-07
P1-08 → P1-09 → P1-10
  ↘       ↓       ↙
   P1-11 / P1-12
        ↓
   P1-13 → P1-14

Phase 2:
P2-01 → P2-02 → P2-03
P2-04 → P2-05
P2-06 → P2-07
P2-08 / P2-09 / P2-10 / P2-11 / P2-12 / P2-13 / P2-14 (可并行)
```

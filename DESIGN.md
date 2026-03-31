# DESIGN.md — mini-claude-code Phase 1

> 版本: v0.1.0
> 状态: 设计已确认
> 日期: 2026-03-31
> 关联需求: Phase 1 — CLAUDE.md 加载、权限系统、配置系统

---

## 需求概述

为 mini-claude-code (~1500 行 TypeScript CLI) 实现三个基础设施功能：

1. **CLAUDE.md 加载系统** — 读取项目/用户级上下文文件并注入系统提示词
2. **权限系统** — 工具执行前询问用户确认，支持会话级记忆
3. **配置系统** — 多层级 JSON 配置，支持项目/用户/环境变量/CLI 参数

---

## 现状分析

### 关键约束

- `src/engine.ts` 的 `buildSystemPrompt()` 当前是模块级纯函数，仅接收 `skillsSummary` 参数
- `src/types.ts` 的 `ToolDefinition` 没有权限相关字段
- `src/tools/index.ts` 的 `ALL_TOOLS` 数组是工具注册中心，工具执行在 `engine.ts` 的循环中
- 工具执行逻辑在 `engine.ts` 第 193-246 行，执行前没有拦截点
- `src/index.ts` 在 `main()` 中初始化 `EngineOptions`，是注入配置的最佳入口
- `readline.Interface` 实例在 `main()` 作用域内，权限询问需要复用或新建一个临时 `readline` 实例

### 可复用代码

- `src/index.ts` 的 `main()` 函数：配置加载、CLAUDE.md 注入在此初始化
- `engine.ts` 的 `buildSystemPrompt()`：改造为接收额外上下文参数
- `engine.ts` 的工具执行循环：在 `tool.execute()` 调用前插入权限检查

---

## 技术方案

### 方案一（推荐）：三个独立模块 + engine 最小侵入

**思路**: 新建 `config.ts`、`context.ts`、`permissions.ts` 三个模块，各自承担单一职责。`engine.ts` 仅修改 `buildSystemPrompt` 签名和工具执行前插入一个 `await permissionCheck()` 调用。`index.ts` 负责初始化顺序编排。

**优势**: 
- 每个模块可独立测试和替换
- `engine.ts` 改动最小（约 10 行），风险低
- 配置系统不依赖其他两个模块，可先实现

**风险**: 权限询问需要在 `engine.ts` 内部进行 readline 交互，而 `rl` 实例在 `index.ts`。需要将权限检查回调传入 engine，或在权限模块内独立创建临时 readline。

**解决**: 权限模块使用 `process.stdin` 直接读取一个字符（raw mode），无需依赖 `readline.Interface`，避免模块间耦合。

---

## 接口设计

### 1. `src/config.ts`

```typescript
// 配置文件结构（~/.mcc/config.json 或 .mcc/config.json）
export interface MccConfig {
  provider?: string;          // 默认 provider
  model?: string;             // 默认模型
  maxTokens?: number;
  baseURL?: string;
  // 权限预设：key 为工具名（小写），value 为 "allow" | "deny" | "ask"
  permissions?: Record<string, "allow" | "deny" | "ask">;
  // 自定义工具路径（预留，Phase 2 实现）
  toolPaths?: string[];
}

// 加载后的最终配置（已合并所有层级）
export interface ResolvedConfig extends Required<Omit<MccConfig, "toolPaths">> {
  toolPaths: string[];
  apiKey: string;
}

// 加载顺序：project (.mcc/config.json) → user (~/.mcc/config.json)
// → 环境变量 → CLI 参数（通过 overrides 传入）
export function loadConfig(overrides?: Partial<MccConfig & { apiKey?: string }>): ResolvedConfig;

// 保存配置到用户配置文件
export function saveUserConfig(patch: Partial<MccConfig>): void;

// 获取当前已解析配置（单例，main() 初始化后可从任意模块读取）
export function getConfig(): ResolvedConfig;
```

**配置层级合并顺序（后者覆盖前者）**:
```
defaults → ~/.mcc/config.json → .mcc/config.json → 环境变量 → CLI 参数
```

**环境变量映射**:
```
API_KEY / OPENAI_API_KEY  → apiKey
MCC_PROVIDER              → provider
MCC_MODEL                 → model
MCC_BASE_URL              → baseURL
```

---

### 2. `src/context.ts`

```typescript
// 单次加载的结果
export interface ContextFile {
  path: string;        // 绝对路径
  content: string;
  source: "project" | "project-local" | "parent" | "user";
}

export interface LoadedContext {
  files: ContextFile[];
  combinedContent: string;  // 已拼接，可直接注入系统提示词
}

// 主加载函数，结果在进程内缓存（单次 REPL 会话只读一次）
export function loadContext(cwd?: string): LoadedContext;

// 强制刷新缓存（用于 /reload 命令，Phase 2 实现）
export function clearContextCache(): void;
```

**搜索顺序（优先级从低到高，后者内容排在前面）**:
```
~/.claude/CLAUDE.md          (user, 最低优先级，排最前)
  ↓
parent dirs CLAUDE.md        (从 cwd 往上，不超过 home dir)
  ↓
{cwd}/CLAUDE.md              (project)
  ↓
{cwd}/CLAUDE.local.md        (project-local, 最高优先级，排最后)
```

注：`.claude/CLAUDE.md`（项目级 `.claude` 子目录）也会加载，但不常见，实现中一并检查。

**注入格式**:
```
<claude-md source="{path}">
{content}
</claude-md>
```

**缓存策略**: 进程内模块级变量，REPL 期间不重读，one-shot 模式同样只读一次。

---

### 3. `src/permissions.ts`

```typescript
// 工具的权限分类（由工具自身声明）
export type PermissionLevel = "safe" | "write" | "execute";

// 用户对单次询问的响应
export type UserDecision = "allow-once" | "allow-always" | "deny";

// 权限检查结果
export interface PermissionResult {
  granted: boolean;
  reason?: string;
}

// 会话级"始终允许"规则（内存中，不持久化）
// key: 工具名小写，value: "allow" | "deny"
type SessionRules = Map<string, "allow" | "deny">;

// 主权限检查函数，engine.ts 调用
// 如需交互则暂停 readline 并询问用户
export async function checkPermission(
  toolName: string,
  inputSummary: string,
  config: ResolvedConfig
): Promise<PermissionResult>;

// 初始化（从 config 加载预设规则到会话规则）
export function initPermissions(config: ResolvedConfig): void;
```

**决策树**:
```
1. 检查 config.permissions[toolName] 预设
   → "allow": 直接通过
   → "deny":  直接拒绝
   → "ask" / 未配置: 进入步骤 2

2. 检查会话级 sessionRules[toolName]
   → "allow": 直接通过
   → "deny":  直接拒绝
   → 未设置: 进入步骤 3

3. 检查工具的 permissionLevel
   → "safe" (Read/Glob/Grep): 直接通过
   → "write" / "execute": 询问用户

4. 显示询问提示，等待用户输入
   → y / Y / Enter  → allow-once
   → a / A          → allow-always（写入 sessionRules）
   → n / N / Escape → deny
```

**交互 UI 格式**:
```
  Allow Bash(`git status`)? [y/a/n] (y=once, a=always, n=deny)
```

**用户输入读取**: 使用 `process.stdin` raw mode 读取单个字符，读完后恢复原模式，不依赖 `readline.Interface`。

---

### 4. `src/types.ts` 变更

在 `ToolDefinition` 增加可选字段：

```typescript
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: { ... };
  execute(input: ToolInput, abortSignal?: AbortSignal): Promise<string>;
  // 新增
  permissionLevel?: "safe" | "write" | "execute";  // 默认 "execute"
}
```

---

### 5. `src/engine.ts` 变更

```typescript
// buildSystemPrompt 新增 context 参数
function buildSystemPrompt(skillsSummary?: string, contextContent?: string): string

// QueryEngine 构造器新增 context 注入
export interface EngineOptions {
  // 现有字段不变...
  contextContent?: string;   // 从 loadContext() 注入
}

// 工具执行循环新增权限检查（在 tool.execute 前）
// engine.ts 第 215 行附近插入：
const inputSummary = formatToolInput(toolName, parsedInput);
const permission = await checkPermission(toolName, inputSummary, getConfig());
if (!permission.granted) {
  // yield denied 信息，push tool result，continue
}
```

---

## 模块交互图

```
index.ts (main)
  │
  ├─ loadConfig(cliOverrides)          → config.ts → ResolvedConfig
  │                                                      │
  ├─ initPermissions(config)           → permissions.ts  │
  │                                         ↑ 使用       │
  ├─ loadContext(cwd)                  → context.ts      │
  │       ↓ contextContent                               │
  └─ new QueryEngine({                                   │
         ...config,  ◄──────────────────────────────────┘
         contextContent
     })
         │
         ▼
    engine.ts
      ├─ buildSystemPrompt(skills, contextContent)
      └─ tool execution loop
              └─ checkPermission(name, summary, getConfig())  → permissions.ts
                      └─ (if needed) prompt user via stdin raw mode
```

---

## 文件变更清单

| 操作 | 路径 | 说明 |
|------|------|------|
| 新建 | `src/config.ts` | 配置加载/合并/单例 |
| 新建 | `src/context.ts` | CLAUDE.md 搜索/加载/缓存 |
| 新建 | `src/permissions.ts` | 权限检查/用户交互/会话记忆 |
| 修改 | `src/types.ts` | ToolDefinition 增加 `permissionLevel` 字段 |
| 修改 | `src/engine.ts` | buildSystemPrompt 接收 contextContent；工具循环插入权限检查 |
| 修改 | `src/tools/bash.ts` | 声明 `permissionLevel: "execute"` |
| 修改 | `src/tools/write.ts` | 声明 `permissionLevel: "write"` |
| 修改 | `src/tools/edit.ts` | 声明 `permissionLevel: "write"` |
| 修改 | `src/tools/read.ts` | 声明 `permissionLevel: "safe"` |
| 修改 | `src/tools/glob.ts` | 声明 `permissionLevel: "safe"` |
| 修改 | `src/tools/grep.ts` | 声明 `permissionLevel: "safe"` |
| 修改 | `src/index.ts` | 初始化顺序：config → context → permissions → engine；banner 显示 context 加载信息 |

---

## 关键实现细节

### config.ts — 合并顺序

```typescript
const defaults: ResolvedConfig = {
  provider: "minimax",
  model: "",           // 空串表示使用 provider 默认值
  maxTokens: 8192,
  baseURL: "",
  permissions: {},
  toolPaths: [],
  apiKey: "",
};

// 合并链：defaults ← userConfig ← projectConfig ← envVars ← cliOverrides
```

`loadConfig` 是同步函数（`fs.readFileSync` + try/catch），文件不存在时静默跳过。

### context.ts — 路径搜索

```typescript
function collectCandidates(cwd: string): string[] {
  const candidates: string[] = [];
  
  // 1. 用户级
  candidates.push(path.join(os.homedir(), ".claude", "CLAUDE.md"));
  
  // 2. 从 cwd 向上遍历父目录（不超过 homedir）
  let dir = path.dirname(cwd);  // 从 cwd 的父目录开始（避免重复加 cwd 自身）
  while (dir !== os.homedir() && dir !== path.dirname(dir)) {
    candidates.push(path.join(dir, "CLAUDE.md"));
    dir = path.dirname(dir);
  }
  
  // 3. 项目级（cwd）
  candidates.push(path.join(cwd, "CLAUDE.md"));
  candidates.push(path.join(cwd, ".claude", "CLAUDE.md"));
  
  // 4. 项目本地（最高优先级）
  candidates.push(path.join(cwd, "CLAUDE.local.md"));
  
  return candidates;
}
```

### permissions.ts — stdin raw mode 输入

```typescript
async function promptUser(message: string): Promise<UserDecision> {
  process.stdout.write(message);
  
  return new Promise((resolve) => {
    const wasRaw = process.stdin.isRaw;
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.once("data", (buf) => {
      process.stdin.setRawMode(wasRaw ?? false);
      process.stdin.pause();
      const char = buf.toString().toLowerCase();
      process.stdout.write("\n");
      if (char === "a") resolve("allow-always");
      else if (char === "n" || char === "\x1b") resolve("deny");
      else resolve("allow-once");  // y, Enter, 任意其他键
    });
  });
}
```

### engine.ts — 权限检查插入点

在现有第 212 行的 `yield { type: "tool", content: ... }` 之前插入：

```typescript
const permission = await checkPermission(toolName, inputSummary, getConfig());
if (!permission.granted) {
  yield { type: "tool", content: `${chalk.yellow("⊘")} ${chalk.bold(toolName)} ${chalk.yellow("denied by user")}\n` };
  this.messages.push({
    role: "tool",
    tool_call_id: tc.id,
    content: `Error: Tool execution denied by user`,
  });
  continue;
}
```

---

## 风险评估

| 风险 | 可能性 | 影响 | 缓解措施 |
|------|--------|------|----------|
| stdin raw mode 与 readline 冲突 | 中 | 高 | 权限询问时确保 readline 处于 pause 状态；测试 REPL 和 one-shot 两种模式 |
| 父目录遍历加载过多 CLAUDE.md | 低 | 低 | 限制最多遍历 10 层父目录 |
| config.json 语法错误导致崩溃 | 低 | 中 | try/catch 包裹，JSON 解析失败时打印警告并使用默认值 |
| one-shot 模式下权限询问阻塞 | 低 | 中 | one-shot 模式可通过 config 预设所有工具为 allow，或添加 --yes 标志（Phase 2） |


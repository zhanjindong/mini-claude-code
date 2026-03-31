# TODO.md — Phase 1 开发任务清单

> 关联设计版本: DESIGN.md v0.1.0
> 创建日期: 2026-03-31
> 总进度: 14/18

---

## 阶段一：数据与配置层（无外部依赖）

### T-01 实现 config.ts 基础结构
- **文件**: `src/config.ts`（新建）
- **内容**: 定义 `MccConfig`、`ResolvedConfig` 接口；实现 `defaults` 常量
- **完成标准**: 类型定义完整，TypeScript 编译通过
- **状态**: [x]

### T-02 实现 config.ts — 文件读取与合并
- **文件**: `src/config.ts`
- **内容**: 实现 `loadConfig(overrides?)`，读取 `~/.mcc/config.json` 和 `.mcc/config.json`，JSON 解析失败静默跳过，合并环境变量（`API_KEY`、`MCC_PROVIDER`、`MCC_MODEL`、`MCC_BASE_URL`）
- **完成标准**: 当两个 config.json 都不存在时返回 defaults；当项目 config.json 存在时其值覆盖用户配置
- **状态**: [x]

### T-03 实现 config.ts — 单例与 saveUserConfig
- **文件**: `src/config.ts`
- **内容**: 实现模块级缓存单例 `getConfig()`；实现 `saveUserConfig(patch)` 写入 `~/.mcc/config.json`（目录不存在时 mkdirSync）
- **完成标准**: 多次调用 `getConfig()` 返回同一对象引用；`saveUserConfig` 正确合并并写入
- **状态**: [x]

### T-04 实现 context.ts — 路径收集与文件读取
- **文件**: `src/context.ts`（新建）
- **内容**: 实现 `collectCandidates(cwd)` 搜索路径列表（user → parent dirs → project → project-local）；读取存在的文件，构建 `ContextFile[]`；限制父目录遍历最多 10 层，不超过 `os.homedir()`
- **完成标准**: 在有 CLAUDE.md 的项目目录下调用，能正确找到并读取文件
- **状态**: [x]

### T-05 实现 context.ts — 内容拼接与缓存
- **文件**: `src/context.ts`
- **内容**: 将多个 ContextFile 按优先级顺序拼接为 `combinedContent`（每段用 `<claude-md source="...">` 包裹）；实现进程内缓存，`clearContextCache()` 清除缓存
- **完成标准**: 多次调用 `loadContext()` 返回相同对象（缓存生效）；`clearContextCache()` 后再次调用重新读取文件系统
- **状态**: [x]

---

## 阶段二：权限系统

### T-06 修改 types.ts — 增加 permissionLevel 字段
- **文件**: `src/types.ts`
- **内容**: `ToolDefinition` 增加 `permissionLevel?: "safe" | "write" | "execute"`
- **完成标准**: TypeScript 编译通过，现有工具文件无需修改即可编译（字段可选）
- **状态**: [x]

### T-07 为各工具声明 permissionLevel
- **文件**: `src/tools/bash.ts`、`src/tools/write.ts`、`src/tools/edit.ts`、`src/tools/read.ts`、`src/tools/glob.ts`、`src/tools/grep.ts`
- **内容**: 
  - `bash.ts`: `permissionLevel: "execute"`
  - `write.ts`: `permissionLevel: "write"`
  - `edit.ts`: `permissionLevel: "write"`
  - `read.ts`: `permissionLevel: "safe"`
  - `glob.ts`: `permissionLevel: "safe"`
  - `grep.ts`: `permissionLevel: "safe"`
- **完成标准**: 所有工具文件编译通过，`permissionLevel` 字段正确赋值
- **状态**: [x]

### T-08 实现 permissions.ts — 会话规则与决策树
- **文件**: `src/permissions.ts`（新建）
- **内容**: 定义 `SessionRules` Map；实现 `initPermissions(config)` 从 config 预设加载初始规则；实现决策树逻辑（config 预设 → 会话规则 → permissionLevel 检查 → 询问用户）
- **完成标准**: safe 级工具直接返回 `granted: true`；已有 config 预设的工具不需询问
- **状态**: [x]

### T-09 实现 permissions.ts — stdin raw mode 用户交互
- **文件**: `src/permissions.ts`
- **内容**: 实现 `promptUser(message)` 使用 stdin raw mode 读取单字符；处理 y/a/n/Escape/Enter；读取完成后恢复原始 stdin 状态
- **完成标准**: 在 REPL 模式下手动测试，输入 y/a/n 分别得到 allow-once/allow-always/deny；Ctrl+C 不崩溃
- **状态**: [x]

### T-10 实现 permissions.ts — checkPermission 导出函数
- **文件**: `src/permissions.ts`
- **内容**: 实现并导出 `checkPermission(toolName, inputSummary, config)`，整合决策树和用户交互；allow-always 结果写入会话 sessionRules
- **完成标准**: 对同一工具选择 allow-always 后，后续调用无需再次询问
- **状态**: [x]

---

## 阶段三：引擎层集成

### T-11 修改 engine.ts — buildSystemPrompt 接收 contextContent
- **文件**: `src/engine.ts`
- **内容**: `buildSystemPrompt(skillsSummary?, contextContent?)` 增加第二个参数；当 contextContent 非空时追加到提示词末尾（用 `\n\n---\n\n` 分隔）；`EngineOptions` 增加 `contextContent?: string`；QueryEngine 构造器存储并在 `query()` 中传给 `buildSystemPrompt`
- **完成标准**: 传入 contextContent 时，API 请求的 system message 包含 CLAUDE.md 内容
- **状态**: [x]

### T-12 修改 engine.ts — 工具执行循环插入权限检查
- **文件**: `src/engine.ts`
- **内容**: 在工具执行循环中（`tool.execute` 调用前）调用 `checkPermission(toolName, inputSummary, getConfig())`；被拒绝时 yield 拒绝提示、push tool error 消息、continue 跳过执行
- **完成标准**: Bash 工具首次执行时弹出权限询问；Read 工具无需确认直接执行
- **状态**: [x]

---

## 阶段四：入口层整合

### T-13 修改 index.ts — 初始化顺序整合
- **文件**: `src/index.ts`
- **内容**: 在 `main()` 开头依次调用：① `loadConfig(cliOverrides)` ② `initPermissions(config)` ③ `loadContext(process.cwd())`；将 `config` 中的 provider/model/apiKey 等传给 `EngineOptions`；将 `context.combinedContent` 传给 `EngineOptions.contextContent`
- **完成标准**: CLI 参数（--provider 等）仍然生效；config.json 中的默认 provider 被正确读取
- **状态**: [x]

### T-14 修改 index.ts — banner 显示 context 加载信息
- **文件**: `src/index.ts`
- **内容**: `printBanner` 函数中，当 `loadedContext.files.length > 0` 时显示已加载的 CLAUDE.md 文件列表（文件路径 + source 类型）
- **完成标准**: 有 CLAUDE.md 时 banner 显示如 `Context: CLAUDE.md (project), ~/.claude/CLAUDE.md (user)`
- **状态**: [x]

---

## 阶段五：验证与收尾

### T-15 端到端验证 — CLAUDE.md 注入
- **文件**: 无需修改（手动验证）
- **内容**: 在项目根目录创建测试用 CLAUDE.md，启动 REPL，询问 AI "你有什么特别的指令？"，验证 AI 能引用 CLAUDE.md 中的内容
- **完成标准**: AI 回答能体现 CLAUDE.md 中写入的内容
- **状态**: [ ]

### T-16 端到端验证 — 权限系统
- **内容**: 启动 REPL，输入 `运行 ls 命令`，验证出现权限询问；选 n 验证被拒绝；重新运行，选 a，验证同会话内第二次调用无需询问；Read 工具直接执行无询问
- **完成标准**: 以上三种场景行为符合预期
- **状态**: [ ]

### T-17 端到端验证 — 配置系统
- **内容**: 在 `.mcc/config.json` 写入 `{"provider": "deepseek"}`，启动 REPL，验证 banner 显示 deepseek；CLI 参数 `--provider openai` 应覆盖 config.json 的设置
- **完成标准**: 配置层级覆盖顺序正确
- **状态**: [ ]

### T-18 编译检查与 README 更新
- **文件**: `README.md`、TypeScript 编译
- **内容**: 运行 `npm run build` 确认无编译错误；在 README.md 中补充配置文件说明（`.mcc/config.json` 支持的字段）、CLAUDE.md 加载说明、权限系统说明
- **完成标准**: `npm run build` 通过；README 新增配置相关章节
- **状态**: [ ]

---

## 任务依赖关系

```
T-01 → T-02 → T-03
T-04 → T-05
T-06 → T-07
T-08 → T-09 → T-10

T-01/T-02 ─────────────────────────────────┐
T-04/T-05 ──────────────────────────────┐  │
T-06/T-07/T-08/T-09/T-10 ───────────┐  │  │
                                     ↓  ↓  ↓
                                 T-11/T-12
                                      ↓
                                     T-13
                                      ↓
                                     T-14
                                      ↓
                               T-15/T-16/T-17
                                      ↓
                                     T-18
```

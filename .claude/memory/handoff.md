# 工作交接

> 最后更新: 2026-04-02
> 更新者: Plan Agent
> 分支: main

## 当前状态

Phase 3 技术方案设计完成（Edit/Write 工具 Diff 输出）。方案已写入 DESIGN.md（v0.4.0），开发任务清单已写入 TODO.md（5 个任务，0/5 进度）。代码尚未修改，等待 develop agent 实现。

## 本次改动
- `DESIGN.md` — 追加 Phase 3 技术方案
- `TODO.md` — 新建开发任务清单

## 最近提交
```
3f61d04 feat(engine): 支持qwen provider
78d70c0 feat: migrate to .claude/ directory, add hook override prompt and settings.json hooks
e3daacf update handoff memory
4f75fe2 style(ui): fix user input background to fill full width on terminal resize
b540d8c fix(ui): prevent silent crash on mid-query input and highlight user input
```

## 关键决策

### 2026-03-31 — 权限询问不依赖 readline.Interface
权限系统（permissions.ts）使用 `process.stdin` raw mode 读取单字符，而非共享 index.ts 中的 readline 实例。原因：engine.ts 中触发权限询问时无法访问 index.ts 作用域内的 rl 变量；raw mode 方案解耦彻底，engine 只需 import permissions 模块。

### 2026-03-31 — config 单例模式
`config.ts` 导出 `getConfig()` 返回模块级缓存的已解析配置，避免 engine.ts 在每次工具调用时重新读文件。permissions.ts 的 `checkPermission` 接收 `ResolvedConfig` 参数而非自己调用 `getConfig()`，保持函数可测试性。

### 2026-03-31 — buildSystemPrompt 接收 contextContent 而非 LoadedContext
engine.ts 只需要拼接好的字符串，不需要知道 CLAUDE.md 的文件来源结构。context.ts 负责拼接，engine.ts 只消费结果。减少跨模块耦合。

### 2026-04-02 — Phase 3 Diff 输出：engine.ts 层捕获，不修改工具接口
Edit/Write 工具的 diff 数据由 engine.ts 在工具调用前后自行读取文件生成，不修改 ToolDefinition.execute() 返回类型。diff 渲染是 UI 关注点，工具层无感知。renderEditDiff 和 renderWritePreview 函数新增到 markdown.ts。

### 2026-04-02 — Write 新建文件用全部新增风格展示
新建文件没有旧内容，diff 意义不大。oldContent 为 null 时 renderWritePreview 传 "" 给 renderEditDiff，等效全部新增显示。

## 注意事项

### stdin raw mode 与 readline 潜在冲突
readline 和 stdin raw mode 同时操作 stdin 可能互相干扰。实现时需要在 promptUser() 中保存并恢复 stdin 的 isRaw 状态，并在读取完毕后调用 `process.stdin.pause()`。需要在 REPL 模式和 one-shot 模式下各测试一遍。

### one-shot 模式下的权限询问
one-shot 模式（`-p "..."` 参数）没有交互式 readline，但权限询问仍然会触发 stdin 交互。短期可接受，Phase 2 可考虑添加 `--yes` 标志或 config 中 `defaultPermission: "allow"` 来跳过询问。

### config.ts 需要在 engine.ts import 之前初始化
engine.ts 的工具执行循环调用 `getConfig()`，因此 `loadConfig()` 必须在 `new QueryEngine()` 之前在 `main()` 中执行完毕。

### Phase 3 — 大文件 LCS 性能
LCS 算法时间复杂度 O(n*m)，对 >2000 行文件应降级：直接显示行数摘要（"Modified N lines"），不做逐行 diff。develop agent 实现时需加此边界判断。

### Phase 3 — engine.ts 中的插入位置
diff yield 必须在 `result = await tool.execute(...)` 之后、`this.messages.push({ role: "tool" })` 之前，且在 `formatToolResult` 摘要行（⎿）之前输出，这样 diff 展示在摘要行上方，视觉上更自然。

## 下一步

1. develop agent 按 TODO.md 顺序实现：T-01 → T-02 → T-03 → T-04 → T-05
2. T-01/T-02 可以合并到同一次提交（都在 markdown.ts）
3. T-03/T-04 合并到同一次提交（都在 engine.ts）
4. T-05 验收后更新 DESIGN.md 状态为"已完成"，更新 handoff.md

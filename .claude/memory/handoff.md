# 工作交接

> 最后更新: 2026-04-01 20:39
> 更新者: Jindong Zhan
> 分支: main

## 当前状态

Phase 1 技术方案设计完成，等待 develop agent 实现。DESIGN.md 和 TODO.md 已写入项目根目录。

## 本次改动
- `.claude/memory/handoff.md`
- `llm-proxy/DESIGN.md`
- `llm-proxy/TODO.md`
- `package-lock.json`
- `src/engine.ts`
- `src/mcp.ts`
- `src/tools/bash.ts`
- `src/tools/grep.ts`

## 最近提交
```
40527c5 fix(websearch): switch from DuckDuckGo to Bing for China network compatibility
89e7fcd fix(ui): move spinner above prompt and harden abort/exit handling
0c5f81d style(ui): remove space between tool icon and tool name
b85a116 feat(ui): add input queue, mid-query injection, and write-above-readline
8b77075 Update README with full feature table and add tasks, diff rendering
```

## 关键决策

### 2026-03-31 — 权限询问不依赖 readline.Interface
权限系统（permissions.ts）使用 `process.stdin` raw mode 读取单字符，而非共享 index.ts 中的 readline 实例。原因：engine.ts 中触发权限询问时无法访问 index.ts 作用域内的 rl 变量；raw mode 方案解耦彻底，engine 只需 import permissions 模块。

### 2026-03-31 — config 单例模式
`config.ts` 导出 `getConfig()` 返回模块级缓存的已解析配置，避免 engine.ts 在每次工具调用时重新读文件。permissions.ts 的 `checkPermission` 接收 `ResolvedConfig` 参数而非自己调用 `getConfig()`，保持函数可测试性。

### 2026-03-31 — buildSystemPrompt 接收 contextContent 而非 LoadedContext
engine.ts 只需要拼接好的字符串，不需要知道 CLAUDE.md 的文件来源结构。context.ts 负责拼接，engine.ts 只消费结果。减少跨模块耦合。

## 注意事项

### stdin raw mode 与 readline 潜在冲突
readline 和 stdin raw mode 同时操作 stdin 可能互相干扰。实现时需要在 promptUser() 中保存并恢复 stdin 的 isRaw 状态，并在读取完毕后调用 `process.stdin.pause()`。需要在 REPL 模式和 one-shot 模式下各测试一遍。

### one-shot 模式下的权限询问
one-shot 模式（`-p "..."` 参数）没有交互式 readline，但权限询问仍然会触发 stdin 交互。短期可接受，Phase 2 可考虑添加 `--yes` 标志或 config 中 `defaultPermission: "allow"` 来跳过询问。

### config.ts 需要在 engine.ts import 之前初始化
engine.ts 的工具执行循环调用 `getConfig()`，因此 `loadConfig()` 必须在 `new QueryEngine()` 之前在 `main()` 中执行完毕。TODO T-13 的实现顺序务必保证这一点。

## 下一步

开发者应按照 TODO.md 中的任务顺序实现：
1. 先完成 T-01 到 T-05（config + context 模块，无依赖，纯文件 I/O）
2. 再完成 T-06 到 T-10（types 变更 + permissions 模块）
3. 最后 T-11 到 T-14（engine + index 集成）
4. T-15 到 T-18（端到端验证 + README）

每个任务是独立的最小工作单元，完成后应能通过 `npm run build` 编译检查。

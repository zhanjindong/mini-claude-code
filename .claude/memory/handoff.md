# 工作交接

> 最后更新: 2026-04-02 14:23
> 更新者: Jindong Zhan
> 分支: main

## 当前状态

统一命名空间迁移完成：所有 `.mcc/` 路径已迁移到 `.claude/`，同时实现了 commands/、agents/、rules/ 加载和 settings.json hooks 加载。编译通过，224 个测试全部通过。

## 本次改动
- `.claude/memory/handoff.md`
- `.claude/skills/ai-weekly-briefing/assets/template.html`
- `.claude/skills/ai-weekly-briefing/SKILL.md`
- `.claude/skills/commit/SKILL.md`
- `.claude/skills/hello/SKILL.md`
- `.claude/skills/resume-career/SKILL.md`
- `.gitignore`
- `DESIGN.md`
- `README.md`
- `src/config.ts`
- `src/context.ts`
- `src/hooks.ts`
- `src/index.ts`
- `src/mcp.ts`
- `src/session.ts`
- `src/skills.ts`
- `tests/config.test.ts`
- `tests/hooks.test.ts`
- `tests/mcp.test.ts`
- `tests/session.test.ts`

## 最近提交
```
e3daacf update handoff memory
4f75fe2 style(ui): fix user input background to fill full width on terminal resize
b540d8c fix(ui): prevent silent crash on mid-query input and highlight user input
d40c115 feat: 支持Windows平台
40527c5 fix(websearch): switch from DuckDuckGo to Bing for China network compatibility
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

1. 手动测试：启动 REPL 确认 CLAUDE.md + rules 被加载、`/` 菜单显示 commands 和 skills、hooks 正常触发
2. 考虑是否需要删除旧的 `.mcc/` 目录（当前 .gitignore 仍保留忽略规则以兼容）
3. 考虑 agents frontmatter 中 `model`、`tools`、`allowed_tools` 的运行时支持（当前仅作为 skill 注册）

# 工作交接

> 最后更新: 2026-03-31 23:43
> 更新者: Jindong Zhan
> 分支: main

## 当前状态

Phase 1 技术方案设计完成，等待 develop agent 实现。DESIGN.md 和 TODO.md 已写入项目根目录。

## 本次改动
- `.claude/agents/develop.md`
- `.claude/agents/plan.md`
- `.claude/agents/product.md`
- `.claude/agents/review.md`
- `.claude/agents/testing.md`
- `.claude/commands/openteam.md`
- `.claude/commands/ot-build-fix.md`
- `.claude/commands/ot-changelog.md`
- `.claude/commands/ot-clear.md`
- `.claude/commands/ot-commit.md`
- `.claude/commands/ot-create-api.md`
- `.claude/commands/ot-create-component.md`
- `.claude/commands/ot-create-page.md`
- `.claude/commands/ot-create-test.md`
- `.claude/commands/ot-debug.md`
- `.claude/commands/ot-develop.md`
- `.claude/commands/ot-page-style.md`
- `.claude/commands/ot-plan.md`
- `.claude/commands/ot-product.md`
- `.claude/commands/ot-refactor.md`
- `.claude/commands/ot-review.md`
- `.claude/commands/ot-testing.md`
- `.claude/docs/continuation-guide.md`
- `.claude/docs/openteam-guide.md`
- `.claude/hooks/block-dangerous-command.sh`
- `.claude/hooks/block-force-push.sh`
- `.claude/hooks/block-npm-yarn.sh`
- `.claude/hooks/block-options-api.sh`
- `.claude/hooks/block-push-main-branch.sh`
- `.claude/hooks/check-console-log.sh`
- `.claude/hooks/check-hardcoded-secret.sh`
- `.claude/hooks/check-skip-tests-reminder.sh`
- `.claude/hooks/check-system-out.sh`
- `.claude/hooks/check-tmux-reminder.sh`
- `.claude/hooks/memory-load.sh`
- `.claude/hooks/memory-persistence.md`
- `.claude/hooks/memory-save.sh`
- `.claude/hooks/post-commit-handoff-reminder.sh`
- `.claude/hooks/strategic-compact.md`
- `.claude/hooks/strategic-compact.sh`
- `.claude/memory/handoff.md`
- `.claude/rules/context-backend.md`
- `.claude/rules/context-frontend.md`
- `.claude/rules/git-workflow.md`
- `.claude/rules/security.md`
- `.claude/rules/testing.md`
- `.claude/settings.json`
- `CLAUDE.md`
- `DESIGN.md`
- `package-lock.json`
- `package.json`
- `pnpm-lock.yaml`
- `src/config.ts`
- `src/context.ts`
- `src/engine.ts`
- `src/hooks.ts`
- `src/index.ts`
- `src/mcp.ts`
- `src/permissions.ts`
- `src/session.ts`
- `src/tools/agent.ts`
- `src/tools/bash.ts`
- `src/tools/edit.ts`
- `src/tools/glob.ts`
- `src/tools/grep.ts`
- `src/tools/index.ts`
- `src/tools/read.ts`
- `src/tools/webfetch.ts`
- `src/tools/write.ts`
- `src/types.ts`
- `tests/agent.test.ts`
- `tests/config.test.ts`
- `tests/context.test.ts`
- `tests/hooks.test.ts`
- `tests/mcp.test.ts`
- `tests/permissions.test.ts`
- `tests/session.test.ts`
- `tests/smoke.test.ts`
- `tests/webfetch.test.ts`
- `TODO.md`
- `vitest.config.ts`

## 最近提交
```
ad8376b Pass abort signal to OpenAI API for instant request cancellation
e7a0169 Fix Ctrl+C/Escape not working during query
82eeadd Fix Ctrl+C during query execution
cf56ef9 Add Escape key to interrupt ongoing requests
b711cb9 Remove extra blank lines between tool calls
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

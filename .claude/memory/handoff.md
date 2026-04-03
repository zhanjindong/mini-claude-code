# 工作交接

> 最后更新: 2026-04-03
> 更新者: Claude
> 分支: main

## 当前状态

v0.2.0 已发布（tag: `v0.2.0-computer-use`），包含 Browser + Computer tool 简易实现和 Bash 进度条修复。Phase 4（Computer Use 改进）技术方案已写入 DESIGN.md，开发任务清单已写入 TODO.md（14 个任务，0/14 进度）。代码尚未修改，等待下一次会话实现。

## 本次改动
- 提交 `47a0d75` — feat: add Browser/Computer tools and fix bash progress bar flooding
- 创建 tag `v0.2.0-computer-use` 并推送到 GitHub
- `CHANGELOG.md` — 更新为 v0.2.0
- `README.md` — 添加平台支持说明（macOS 友好，Windows 暂未支持）
- `DESIGN.md` — 追加 Phase 4 Computer Use 改进方案
- `TODO.md` — 新建 14 项改进任务清单
- 进度条修复：`src/types.ts` + `src/tools/bash.ts` + `src/index.ts`（progress 标记 + 原地更新渲染）

## 最近提交
```
47a0d75 feat: add Browser/Computer tools and fix bash progress bar flooding
0e4cb0a fix(bash): resolve \r carriage return garbled output in streaming mode
066220b fix(ui): slash command menu interaction fixes and description truncation
99e68f9 style(ui): deepen diff background colors to match Claude Code
8a2ab6a fix(ui): use 256-color dark backgrounds for diff and fix line ordering
```

## 关键决策

### 2026-04-03 — Computer Use 用 cliclick + screencapture 而非原生模块
官方 claude-code 用 Rust enigo + Swift SCContentFilter 原生模块。mini-claude-code 选择 cliclick subprocess + screencapture 命令，因为：无需编译基础设施、实现快速、延迟可接受（10-50ms/调用）。长期可考虑迁移原生模块。

### 2026-04-03 — VLM 截图分析用外部 API 而非 Claude 自带视觉
官方 claude-code 利用 Claude 模型自带的多模态能力分析截图。mini-claude-code 使用 OpenAI 兼容 API，模型不一定支持视觉，因此独立配置 VLM provider（MiniMax VLM 或 OpenAI Vision）。

### 2026-04-03 — 进度条修复方案：yield 标记 + 渲染端区分
bash tool yield 进度行时加 `progress: true` 标记，渲染端用 `\r\x1b[J` 原地覆盖而非 writeAbove 追加。EngineChunk 类型扩展 `progress?: boolean`，engine.ts 透传无需改动。

### 2026-03-31 — 权限询问不依赖 readline.Interface
权限系统（permissions.ts）使用 `process.stdin` raw mode 读取单字符，而非共享 index.ts 中的 readline 实例。原因：engine.ts 中触发权限询问时无法访问 index.ts 作用域内的 rl 变量；raw mode 方案解耦彻底，engine 只需 import permissions 模块。

### 2026-03-31 — config 单例模式
`config.ts` 导出 `getConfig()` 返回模块级缓存的已解析配置，避免 engine.ts 在每次工具调用时重新读文件。

## 注意事项

### cliclick 是必需外部依赖
Computer tool 依赖 `brew install cliclick`，未安装时会报错。TODO T-07 计划实现自动安装。

### VLM 需要独立配置
Computer tool 截图分析需要配置 VLM：`MCC_VLM_PROVIDER` + `MCC_VLM_API_KEY`。未配置时截图返回"VLM 未配置"提示。

### Playwright 是可选依赖
Browser tool 依赖 playwright-core（optionalDependencies），未安装时 browser 相关操作返回安装指引。

### 进度条修复仅在 REPL 模式生效
one-shot 模式（无 readline）下 progress chunk 走普通 stdout.write，不做原地更新。

## 下一步

1. 按 TODO.md 第一批实现：T-01（会话锁）→ T-02（Settle 延迟）→ T-03（截图缓存）→ T-04（权限检测）
2. T-02 + T-03 可合并到同一次提交（都在 platform.ts，改动小）
3. T-01 独立提交（新文件 + 集成改动）
4. T-04 独立提交（actions.ts 改动）
5. 第一批完成后进入第二批：T-05（鼠标动画）→ T-06（剪贴板输入）→ T-07（自动安装）

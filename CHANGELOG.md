# Changelog

## [Unreleased]

## [0.2.0] - 2026-04-03

### Added
- Browser tool：基于 Playwright 的浏览器自动化工具（导航、点击、提取内容、截图）
- Computer tool：基于原生平台命令的桌面操控工具（鼠标、键盘、截图 + VLM 描述）
- VLM 配置支持：`MCC_VLM_PROVIDER` / `MCC_VLM_MODEL` / `MCC_VLM_API_KEY` / `MCC_VLM_BASE_URL` 环境变量
- minimax-vlm provider preset
- `/login` 命令：启动后交互式选择 Provider 并输入 API Key，无需预设环境变量即可使用
- Qwen provider 支持（通过 OpenRouter）
- Windows 平台支持
- Hook override prompt 和 settings.json hooks 支持
- `.claude/` 目录结构迁移

### Changed
- 环境变量 `API_KEY` 重命名为 `MCC_API_KEY`，避免与其他工具冲突（保留 `OPENAI_API_KEY` 兼容）
- 无 API Key 时不再直接退出，改为提示用户通过 `/login` 配置
- WebSearch 从 DuckDuckGo 切换至 Bing，改善国内网络兼容性
- README 标注平台支持状态（macOS 友好，Windows 暂未支持）

### Fixed
- 修复 Bash 进度条刷屏问题：进度行现在原地更新而非逐行追加
- 修复终端窗口调整大小时用户输入背景未铺满全宽的问题
- 修复查询进行中输入导致静默崩溃的问题
- 修复 Spinner 位置和 abort/exit 处理的稳健性

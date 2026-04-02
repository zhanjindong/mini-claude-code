# Changelog

## [Unreleased]

### Added
- `/login` 命令：启动后交互式选择 Provider 并输入 API Key，无需预设环境变量即可使用
- Qwen provider 支持（通过 OpenRouter）
- Windows 平台支持
- Hook override prompt 和 settings.json hooks 支持
- `.claude/` 目录结构迁移

### Changed
- 环境变量 `API_KEY` 重命名为 `MCC_API_KEY`，避免与其他工具冲突（保留 `OPENAI_API_KEY` 兼容）
- 无 API Key 时不再直接退出，改为提示用户通过 `/login` 配置
- WebSearch 从 DuckDuckGo 切换至 Bing，改善国内网络兼容性

### Fixed
- 修复终端窗口调整大小时用户输入背景未铺满全宽的问题
- 修复查询进行中输入导致静默崩溃的问题
- 修复 Spinner 位置和 abort/exit 处理的稳健性

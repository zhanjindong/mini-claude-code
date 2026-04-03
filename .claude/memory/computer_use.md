---
name: computer_use_research
description: Claude Code 官方项目 Computer Use 实现架构研究，与 mini-claude-code 实现对比
type: reference
---

## Claude Code 官方项目 Computer Use 实现研究

研究来源：`~/github/claude-code` 项目

### 架构概览

Computer Use 通过 **MCP Server** 模式实现，工具以 `mcp__computer-use__*` 前缀注册。核心目录：

```
src/utils/computerUse/
├── executor.ts          # 桌面控制执行器（658行）
├── setup.ts             # MCP 工具动态注册
├── mcpServer.ts         # MCP Server 工厂
├── wrapper.tsx          # Tool → MCP 调度桥接（49KB+）
├── computerUseLock.ts   # 文件锁（防并发）
├── cleanup.ts           # 会话清理
├── gates.ts             # Feature flag 与订阅门控
├── common.ts            # 常量与终端检测
├── hostAdapter.ts       # 宿主适配器
├── drainRunLoop.ts      # CFRunLoop 泵（Swift 集成）
├── escHotkey.ts         # ESC 全局热键中止
├── appNames.ts          # 应用过滤与注入防护
├── toolRendering.tsx    # 工具输出渲染
├── swiftLoader.ts       # Swift 原生模块加载
├── inputLoader.ts       # Input 原生模块加载
└── permissions/         # TCC 权限 UI
```

### 关键设计点

**1. 原生模块驱动（非 subprocess）**
- Rust `@ant/computer-use-input`（enigo 库）→ 鼠标/键盘
- Swift `@ant/computer-use-swift`（SCContentFilter）→ 截屏
- CFRunLoop 泵机制（1ms interval）驱动 Swift @MainActor 方法

**2. MCP 工具列表**
- screenshot / mouse_move / left_click / right_click / double_click
- drag / type / key / scroll / cursor_position
- request_access / list_granted_applications

**3. 安全机制**
- 文件锁：`~/.config/claude/computer-use.lock`，防多会话并发
- ESC 热键：CGEventTap 全局拦截，防 prompt injection
- 应用过滤：Unicode-aware 名称过滤，防应用名注入
- TCC 权限：Accessibility + Screen Recording 权限检测 + 引导 UI

**4. Feature Gate**
- `CHICAGO_MCP`：编译时开关
- `tengu_malort_pedway`：运行时 GrowthBook 动态配置
- 需要 Max/Pro 订阅（员工 `USER_TYPE=ant` 绕过）

**5. 鼠标动画**
- ease-out-cubic 缓动，60fps 平滑移动

### 与 mini-claude-code 对比

| 特性 | claude-code (官方) | mini-claude-code |
|------|-------------------|-----------------|
| 输入控制 | Rust 原生模块 (enigo) | cliclick subprocess |
| 截屏 | Swift 原生 (SCContentFilter) | screencapture 命令 |
| 截屏分析 | Claude 模型自带视觉能力 | MiniMax VLM API |
| 并发保护 | 文件锁 + PID 检测 | 无 |
| 安全防护 | ESC 热键 + 应用过滤 + TCC | 基础权限检测 |
| 订阅门控 | GrowthBook feature flag | 无 |
| 架构 | MCP Server 模式 | 直接工具调用 |

### 可借鉴的改进方向

1. 鼠标移动动画（ease-out-cubic）
2. 会话文件锁防并发
3. 应用名过滤防注入
4. 更完善的权限检测与引导

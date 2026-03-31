# Mini Claude Code

一个轻量级的 Claude Code 风格 CLI 工具，支持多 LLM 提供商。

用 ~6700 行 TypeScript 实现了 Claude Code 的核心交互体验：流式对话、工具调用、Skills、MCP、Hooks、权限、会话管理等完整功能。

## 功能一览

| 类别 | 功能 | 说明 |
|------|------|------|
| **LLM 集成** | 多提供商支持 | MiniMax、DeepSeek、OpenAI、OpenRouter 及任何 OpenAI 兼容 API |
| | 流式输出 | 实时流式输出模型回复，支持 `<think>` 标签过滤 |
| | Token 统计 | 实时跟踪 input/output token 用量（`/cost`） |
| | 自动上下文压缩 | 对话接近上下文窗口时自动摘要压缩，也可手动 `/compact` |
| **内置工具** | Bash | Shell 命令执行，超时控制 |
| | Read | 文件读取，支持行范围 |
| | Write | 文件创建/覆写 |
| | Edit | 精确字符串替换编辑 |
| | Glob | 文件模式匹配搜索 |
| | Grep | 正则表达式内容搜索 |
| | WebFetch | URL 内容抓取，自动 HTML 文本提取 |
| | Agent | 启动独立子 Agent 处理复杂多步骤任务 |
| | TaskCreate/Update/List | 会话级任务跟踪，多步操作进度管理 |
| | Skill | 模型自动调用 Skill 指令模板 |
| **Skills 系统** | Markdown 定义 | 用 YAML frontmatter + Markdown 定义可复用指令模板 |
| | 双级加载 | 项目级 `.mini-claude-code/skills/` + 用户级 `~/.mini-claude-code/skills/` |
| | 参数支持 | 支持 `{{ argument }}` 模板变量 |
| | 双向调用 | 用户通过 `/skill-name` 调用，模型通过 Skill tool 自动调用 |
| **MCP 协议** | stdio 传输 | 通过 JSON-RPC 2.0 over stdin/stdout 连接 MCP 服务器 |
| | 自动发现 | 启动时连接配置的 MCP 服务器并自动注册其工具 |
| | 配置加载 | 支持项目级 `.mcc/mcp.json` 和用户级 `~/.mcc/mcp.json` |
| **Hooks 系统** | 生命周期钩子 | `beforeToolUse`（可阻断工具执行）和 `afterToolResult` |
| | 工具过滤 | 可按工具名精确匹配或匹配所有工具 |
| | 环境变量注入 | 自动注入 `TOOL_NAME`、`TOOL_INPUT`、`TOOL_RESULT` |
| **权限系统** | 分级权限 | 工具声明 safe/write/execute 权限级别 |
| | 交互式授权 | write/execute 工具执行前提示用户 y/a/n/d 确认 |
| | 会话级 & 持久化 | allow-always/deny-always 持久化到 `~/.mcc/config.json` |
| | 权限管理 | `/permissions` 查看、重置权限规则 |
| **上下文系统** | CLAUDE.md 加载 | 自动加载用户级、父目录、项目级、项目 .claude/、local 五层配置 |
| | 优先级合并 | 用户级 → 父目录（远→近）→ 项目级 → project-local |
| **配置系统** | 四层合并 | defaults ← `~/.mcc/config.json` ← `.mcc/config.json` ← 环境变量 ← CLI 参数 |
| | 环境变量 | `API_KEY`、`MCC_PROVIDER`、`MCC_MODEL`、`MCC_BASE_URL` |
| **会话管理** | 自动保存 | 对话自动持久化到 `~/.mcc/sessions/` |
| | 恢复会话 | `--resume` 或 `/resume` 恢复最近会话 |
| | 会话列表 | `/sessions` 查看历史会话 |
| **交互体验** | REPL 交互 | 完整的命令行交互界面 |
| | 单次模式 | `-p` 或直接传参运行单次提问 |
| | 命令自动补全 | `/` 开头输入弹出下拉菜单，Tab 补全，上下键选择 |
| | 多行粘贴 | 自动检测多行粘贴，折叠显示为 `[Pasted text]` 指示器 |
| | Markdown 渲染 | 终端内渲染标题、代码块、列表、链接、加粗/斜体等 |
| | Diff 渲染 | `/diff` 彩色显示 git diff（增/删/修改行高亮） |
| | Thinking Spinner | 等待模型响应时显示动画加载指示器 |
| | 中断支持 | Ctrl+C / Escape 中断正在进行的请求 |

## 快速开始

```bash
# 安装依赖
pnpm install

# 运行（以 MiniMax 为例）
API_KEY=your-key npx tsx src/index.ts

# 指定提供商
API_KEY=your-key npx tsx src/index.ts --provider deepseek
API_KEY=your-key npx tsx src/index.ts --provider openai
API_KEY=your-key npx tsx src/index.ts --provider openrouter

# 自定义 API 地址
API_KEY=your-key npx tsx src/index.ts --base-url https://your-api.com/v1 --model your-model

# 单次提问模式
API_KEY=your-key npx tsx src/index.ts "解释这个项目的结构"
```

## REPL 命令

| 命令 | 说明 |
|------|------|
| `/help` | 显示帮助 |
| `/clear` | 清空对话历史 |
| `/compact` | 压缩对话历史（LLM 摘要） |
| `/cost` | 查看 token 用量 |
| `/resume` | 恢复最近的会话 |
| `/sessions` | 列出已保存的会话 |
| `/diff` | 彩色显示 git diff |
| `/status` | 显示 git status |
| `/skills` | 列出已加载的 Skills |
| `/hooks` | 列出已加载的 Hooks |
| `/mcp` | 列出 MCP 服务器和工具 |
| `/permissions` | 查看/重置权限规则 |
| `/tasks` | 列出所有任务 |
| `/exit` | 退出 |

## Skills 系统

Skills 是用 Markdown + YAML frontmatter 定义的可复用指令模板。

### 目录结构

```
.mini-claude-code/skills/     # 项目级（优先级高）
  commit/
    SKILL.md
  hello/
    SKILL.md

~/.mini-claude-code/skills/   # 用户级
  my-skill/
    SKILL.md
```

项目级 skill 会覆盖同名的用户级 skill。

### Skill 文件格式

```markdown
---
name: commit
description: Create a well-formatted git commit
when_to_use: When the user asks to commit code changes
allowed_tools: Bash, Read
arguments: message
---

Please help me create a git commit:

1. First run `git status` and `git diff --cached` to see staged changes
2. Generate a concise commit message based on the changes
3. User's note: {{ message }}
4. Execute the commit
```

### 使用方式

**用户手动调用：**

```
❯ /commit fix typo
```

**模型自动调用：** 模型会在 system prompt 中看到可用的 skills 列表，当任务匹配时自动通过 Skill tool 调用。

## 项目结构

```
src/
  index.ts          # 入口，REPL 交互、命令菜单、粘贴检测
  engine.ts         # 查询引擎，流式调用 + 工具执行循环 + 自动压缩
  types.ts          # 类型定义
  config.ts         # 四层配置加载与合并
  context.ts        # CLAUDE.md 上下文文件加载
  permissions.ts    # 权限系统（分级授权 + 交互式提示）
  hooks.ts          # Hooks 生命周期管理
  session.ts        # 会话持久化与恢复
  mcp.ts            # MCP 协议客户端（stdio 传输）
  skills.ts         # Skills 加载、解析、执行
  tasks.ts          # 会话级任务跟踪
  markdown.ts       # 终端 Markdown 渲染 + Diff 渲染
  tools/
    index.ts        # 工具注册表 + MCP 工具注册
    bash.ts         # Shell 命令执行
    read.ts         # 文件读取
    write.ts        # 文件写入
    edit.ts         # 文件编辑（字符串替换）
    glob.ts         # 文件模式匹配
    grep.ts         # 内容搜索
    webfetch.ts     # URL 内容抓取
    agent.ts        # 子 Agent 启动
    task.ts         # 任务管理工具（Create/Update/List）
```

## License

MIT

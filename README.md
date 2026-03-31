# Mini Claude Code

一个轻量级的 Claude Code 风格 CLI 工具，支持多 LLM 提供商。

用 ~1000 行 TypeScript 实现了 Claude Code 的核心交互体验：流式对话、工具调用、Skills 系统。

## 特性

- **多提供商支持** — MiniMax、DeepSeek、OpenAI、OpenRouter，以及任何 OpenAI 兼容 API
- **6 个内置工具** — Bash、Read、Write、Edit、Glob、Grep
- **Skills 系统** — 用 Markdown 定义可复用的指令模板，模型和用户都能调用
- **流式输出** — 实时输出模型回复，工具调用结果以 Claude Code 风格展示
- **单文件入口** — 无框架依赖，结构清晰

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
| `/cost` | 查看 token 用量 |
| `/skills` | 列出已加载的 Skills |
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
  index.ts          # 入口，REPL 交互
  engine.ts         # 查询引擎，流式调用 + 工具执行循环
  types.ts          # 类型定义
  skills.ts         # Skills 加载、解析、执行
  tools/
    index.ts        # 工具注册表
    bash.ts         # Shell 命令执行
    read.ts         # 文件读取
    write.ts        # 文件写入
    edit.ts         # 文件编辑（字符串替换）
    glob.ts         # 文件模式匹配
    grep.ts         # 内容搜索
```

## License

MIT

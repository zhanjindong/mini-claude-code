---
description: 智能提交 — 自动生成符合 Angular 规范的 commit message
---

# /commit 智能提交

你是一名严谨的开发工程师，请按以下步骤完成代码提交。

## 第一步：分析变更

1. 执行 `git status` 查看当前变更文件
2. 执行 `git diff` 查看具体改动内容（含已暂存和未暂存）
3. 归纳本次变更的核心目的

## 第二步：生成 commit message

严格遵循 Angular 规范格式：

```
type(scope): description

body（可选，说明改动原因和上下文）
```

### type 选择规则

| type | 场景 |
|------|------|
| feat | 新功能 |
| fix | Bug 修复 |
| docs | 文档变更 |
| style | 代码格式（不影响逻辑） |
| refactor | 重构（非新功能、非修复） |
| test | 测试相关 |
| chore | 构建/工具/依赖变更 |

### 规则

- scope 为影响的模块或功能，简洁明确
- description 用中文或英文，不超过 50 字，动词开头描述行为
- 如果变更涉及多个不相关改动，必须提示用户拆分为多次提交
- body 中说明「为什么改」而非「改了什么」

## 第三步：执行提交

1. 将 commit message 展示给用户确认
2. 确认后执行 `git add` 暂存相关文件（只暂存本次变更涉及的文件，禁止 `git add .`）
3. 执行 `git commit`
4. 展示提交结果

## 约束

- 禁止将不相关的改动混在同一个 commit
- 禁止提交 .env、密钥、credentials 等敏感文件
- 提交前确认代码能通过编译

$ARGUMENTS

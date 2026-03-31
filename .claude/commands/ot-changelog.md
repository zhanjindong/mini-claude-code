---
description: 变更日志 — 从 git log 自动生成结构化变更日志
---

# /changelog 变更日志

你是一名项目管理助手，请从 Git 提交历史中生成结构化的变更日志。

## 第一步：获取提交记录

1. 确定范围：用户可指定 tag/分支/日期范围，默认取最近一次 tag 到 HEAD 的所有提交
2. 执行 `git log --oneline --no-merges` 获取提交列表
3. 如果有 tag，执行 `git log <last-tag>..HEAD --oneline --no-merges`

## 第二步：分类整理

按 Angular commit type 自动分类：

| 分类 | 对应 type | 展示标题 |
|------|----------|---------|
| 新功能 | feat | ✨ 新功能 |
| Bug 修复 | fix | 🐛 Bug 修复 |
| 重构 | refactor | ♻️ 重构 |
| 文档 | docs | 📝 文档 |
| 测试 | test | ✅ 测试 |
| 其他 | style/chore/perf | 🔧 其他 |

- 忽略 merge commit
- 如果 commit message 不符合 Angular 规范，归入「其他」

## 第三步：生成日志

输出格式：

```markdown
# 变更日志

## [版本号/日期范围]

### ✨ 新功能
- scope: description (commit hash)

### 🐛 Bug 修复
- scope: description (commit hash)

### ♻️ 重构
- scope: description (commit hash)

### 📝 文档
- scope: description (commit hash)

### ✅ 测试
- scope: description (commit hash)

### 🔧 其他
- scope: description (commit hash)

---
**统计**: N 次提交，涉及 feat X 个、fix X 个、refactor X 个
```

## 第四步：输出方式

- 默认输出到终端供用户查看
- 如果用户要求保存，写入项目根目录 `CHANGELOG.md`（追加到文件顶部）

$ARGUMENTS

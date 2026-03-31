---
description: Git 工作流规范，统一分支管理和提交行为
globs: **/*
---

# Git 工作流规范

## 分支管理

1. `master` 分支与生产环境保持一致，仅用于创建开发版本或 hotfix 版本，禁止直接提交代码
2. `release` 分支为生产构建基准，代码最终合入此分支后发布
3. `feature_*` 功能分支从 master 创建，命名格式 `feature_功能简述`，合入后立即删除
4. `hotfix_*` 补丁分支从 master 创建，命名格式 `hotfix_问题简述`，修复后同时合入 master 和 release，合入后立即删除

## 提交规范

5. Commit 信息必须符合 Angular 规范: `type(scope): description`
   - type: feat / fix / docs / style / refactor / test / chore
   - scope: 影响的模块或功能
   - description: 简洁描述本次变更（中英文均可）
6. 每次提交只做一件事，禁止将不相关的改动混在同一个 commit
7. 提交前必须通过本地编译和测试，禁止提交编译不通过的代码
8. 禁止使用 `--force push` 到 master 和 release 分支
9. 合并分支使用 Merge Request / Pull Request，必须至少 1 人 Code Review 后方可合入

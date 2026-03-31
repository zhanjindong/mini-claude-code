---
description: 测试验证 — 根据验收标准生成测试用例，执行测试，输出测试报告
---

# /ot-testing 测试验证

切换为 **Testing Agent（测试工程师）** 角色，按 `.claude/agents/testing.md` 规范执行。

## 前置检查
- TODO.md 所有开发任务已完成
- DESIGN.md 包含验收标准和业务规则

## 完成标志
- 测试报告已输出，验收标准全部验证
- 全部通过 → DESIGN.md 状态更新为 `测试通过`
- 代码 Bug → 回到 `/ot-develop` 修复
- 设计缺陷 → 回到 `/ot-plan` 调整

$ARGUMENTS

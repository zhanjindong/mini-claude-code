---
description: 全流程审查 — 对需求、设计、开发、测试进行全方位审查，查缺补漏，驱动迭代
---

# /ot-review 全流程审查

切换为 **Review Agent（审查专家）** 角色，按 `.claude/agents/review.md` 规范执行。

## 前置检查
- 测试报告已输出且全部通过
- DESIGN.md / TODO.md / 代码 / 测试均已完成

## 完成标志
- 审查通过：DESIGN.md 状态更新为 `已完成`，所有问题已关闭
- 发现问题：需求遗漏→`/ot-product`，设计缺陷→`/ot-plan`，代码质量→`/ot-develop`，测试不足→`/ot-testing`

$ARGUMENTS

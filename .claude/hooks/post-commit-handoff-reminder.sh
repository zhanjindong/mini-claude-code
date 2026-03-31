#!/bin/bash
# 【PostToolUse hook】git commit 后提醒 Claude 增量更新 handoff
# 触发时机: PostToolUse — Bash(command matches 'git commit')

# 获取最新一次提交信息
LAST_COMMIT=$(git log --oneline -1 2>/dev/null)
CHANGED_FILES=$(git diff-tree --no-commit-id --name-only -r HEAD 2>/dev/null)

if [ -z "$LAST_COMMIT" ]; then
  exit 0
fi

# 统计本次会话的提交数（从会话开始到现在的提交）
# 简单用最近提交数量作为参考
COMMIT_COUNT=$(git log --oneline --since="$(date -v-8H '+%Y-%m-%d %H:%M')" 2>/dev/null | wc -l | tr -d ' ')

echo ""
echo "📌 [handoff 提醒] 提交完成: $LAST_COMMIT"
echo "   变更文件: $(echo "$CHANGED_FILES" | wc -l | tr -d ' ') 个"

# 判断是否是里程碑提交（commit message 包含 feat/fix/refactor 等关键词）
if echo "$LAST_COMMIT" | grep -qiE '(feat|fix|refactor|完成|完善|新增|修复|重构)'; then
  echo ""
  echo "⭐ 这看起来是一个里程碑提交，建议更新 .claude/memory/handoff.md："
  echo "   - ## 当前状态：更新进展描述"
  echo "   - ## 关键决策：如有新决策，追加记录"
  echo "   - ## 注意事项：如有新发现，追加记录"
  echo "   - ## 下一步：更新待办事项"
elif [ "$COMMIT_COUNT" -ge 3 ] && [ $(( COMMIT_COUNT % 3 )) -eq 0 ]; then
  echo ""
  echo "💡 已累计 ${COMMIT_COUNT} 次提交，建议增量更新 .claude/memory/handoff.md"
fi

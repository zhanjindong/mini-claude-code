#!/bin/bash
# 【会话结束钩子】管理 handoff.md 的 git 元数据 + 自动刷新 git 可采集段落
# 触发时机: Stop 事件（会话结束时）
#
# 策略：
#   - 文件不存在 → 创建带占位符的模板
#   - 文件已存在 → 更新元数据 + 刷新"本次改动"和"最近提交"段落，保留 Claude 写入的语义段落

MEMORY_DIR=".claude/memory"
HANDOFF_FILE="$MEMORY_DIR/handoff.md"

mkdir -p "$MEMORY_DIR"

# === 收集 git 元数据 ===

BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
GIT_USER=$(git config user.name 2>/dev/null || echo "unknown")
TIMESTAMP=$(date "+%Y-%m-%d %H:%M")

# === 收集 git 变更数据 ===

collect_changes() {
  local CHANGED_FILES=$(git diff --name-only 2>/dev/null)
  local STAGED_FILES=$(git diff --cached --name-only 2>/dev/null)
  local UNTRACKED_FILES=$(git ls-files --others --exclude-standard 2>/dev/null)
  printf '%s\n%s\n%s' "$CHANGED_FILES" "$STAGED_FILES" "$UNTRACKED_FILES" | sort -u | grep -v '^$'
}

build_changes_block() {
  local ALL_CHANGES="$1"
  if [ -n "$ALL_CHANGES" ]; then
    while IFS= read -r f; do
      printf '%s\n' "- \`${f}\`"
    done <<< "$ALL_CHANGES"
  else
    echo "- 无未提交的文件变更"
  fi
}

build_commits_block() {
  local RECENT_COMMITS=$(git log --oneline -5 2>/dev/null)
  if [ -n "$RECENT_COMMITS" ]; then
    printf '%s\n%s\n%s' '```' "$RECENT_COMMITS" '```'
  else
    echo "- 无最近提交"
  fi
}

# === 文件已存在：更新元数据 + 刷新 git 段落 ===

if [ -f "$HANDOFF_FILE" ]; then
  # 1. 更新元数据行
  sed -i '' "s|^> 最后更新:.*|> 最后更新: $TIMESTAMP|" "$HANDOFF_FILE" 2>/dev/null
  sed -i '' "s|^> 更新者:.*|> 更新者: $GIT_USER|" "$HANDOFF_FILE" 2>/dev/null
  sed -i '' "s|^> 分支:.*|> 分支: $BRANCH|" "$HANDOFF_FILE" 2>/dev/null

  # 2. 生成替换内容到临时文件
  ALL_CHANGES=$(collect_changes)
  CHANGES_TMP=$(mktemp)
  COMMITS_TMP=$(mktemp)
  build_changes_block "$ALL_CHANGES" > "$CHANGES_TMP"
  build_commits_block > "$COMMITS_TMP"

  # 3. 使用 awk 替换"本次改动"和"最近提交"段落，保留其他 Claude 写入的段落
  awk -v changes_file="$CHANGES_TMP" -v commits_file="$COMMITS_TMP" '
    /^## 本次改动/ {
      print $0
      while ((getline line < changes_file) > 0) print line
      close(changes_file)
      print ""
      skip = 1
      next
    }
    /^## 最近提交/ {
      print $0
      while ((getline line < commits_file) > 0) print line
      close(commits_file)
      print ""
      skip = 1
      next
    }
    /^## / { skip = 0 }
    !skip { print }
  ' "$HANDOFF_FILE" > "${HANDOFF_FILE}.tmp" && mv "${HANDOFF_FILE}.tmp" "$HANDOFF_FILE"

  rm -f "$CHANGES_TMP" "$COMMITS_TMP"

  # 4. 自动暂存
  git add "$HANDOFF_FILE" 2>/dev/null

  echo "📝 [handoff] 已更新元数据 + 刷新「本次改动」「最近提交」段落，语义段落已保留"
  exit 0
fi

# === 文件不存在：创建模板 ===

ALL_CHANGES=$(collect_changes)
CHANGES_BLOCK=$(build_changes_block "$ALL_CHANGES")
COMMITS_BLOCK=$(build_commits_block)

printf '%s\n' "# 工作交接" "" "> 最后更新: $TIMESTAMP" "> 更新者: $GIT_USER" "> 分支: $BRANCH" "" \
  "## 当前状态" "[Claude 未写入 - 请在会话结束前更新此段]" "" \
  "## 本次改动" > "$HANDOFF_FILE"
printf '%s\n' "$CHANGES_BLOCK" >> "$HANDOFF_FILE"
printf '%s\n' "" "## 最近提交" "$COMMITS_BLOCK" "" \
  "## 关键决策" "[Claude 未写入 - 请在会话结束前更新此段]" "" \
  "## 注意事项" "[Claude 未写入 - 请在会话结束前更新此段]" "" \
  "## 下一步" "[Claude 未写入 - 请在会话结束前更新此段]" >> "$HANDOFF_FILE"

git add "$HANDOFF_FILE" 2>/dev/null

echo "📝 [handoff] 已创建 handoff.md 模板"
echo ""
echo "请用 Edit 工具更新 .claude/memory/handoff.md 中的 [Claude 未写入] 段落："
echo "1. 当前状态：一句话总结本次会话做了什么"
echo "2. 关键决策：本次做出的技术决策及理由"
echo "3. 注意事项：坑、临时方案、脆弱区域"
echo "4. 下一步：接手后应该先做什么"

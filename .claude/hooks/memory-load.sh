#!/bin/bash
# 【会话启动辅助】检查并提醒加载历史记忆
# 使用方式: 在 CLAUDE.md 中引导 Claude 执行，或手动运行

MEMORY_DIR=".claude/memory"

if [ ! -d "$MEMORY_DIR" ]; then
  echo "📭 记忆目录不存在，这是一个全新的项目会话。"
  exit 0
fi

# 统计记忆文件
FILE_COUNT=$(find "$MEMORY_DIR" -name "*.md" -type f 2>/dev/null | wc -l | tr -d ' ')

if [ "$FILE_COUNT" -eq 0 ]; then
  echo "📭 记忆目录为空，暂无历史上下文。"
  exit 0
fi

echo "📚 [会话记忆加载] 检测到 ${FILE_COUNT} 个记忆文件:"
echo ""

for file in "$MEMORY_DIR"/*.md; do
  if [ -f "$file" ]; then
    filename=$(basename "$file")
    linecount=$(wc -l < "$file" | tr -d ' ')
    lastmod=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M" "$file" 2>/dev/null || stat -c "%y" "$file" 2>/dev/null | cut -d'.' -f1)
    echo "  📄 $filename ($linecount 行, 最后更新: $lastmod)"
  fi
done

echo ""
echo "请读取以上文件，快速了解项目上下文后再开始工作。"

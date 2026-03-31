#!/bin/bash
# 【一致性型】编辑前端文件后扫描 console.log
FILE="$CLAUDE_FILE_PATH"
if grep -n 'console\.log\|console\.debug\|console\.info' "$FILE" 2>/dev/null; then
  echo '⚠️ [一致性] 检测到 console.log/debug/info，请确认是否为调试遗留，正式代码请移除。'
fi

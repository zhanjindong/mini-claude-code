#!/bin/bash
# 【一致性型】编辑 Java 文件后检查 System.out / printStackTrace
FILE="$CLAUDE_FILE_PATH"
if grep -n 'System\.out\.print\|System\.err\.print\|e\.printStackTrace()' "$FILE" 2>/dev/null; then
  echo '⚠️ [一致性] 检测到 System.out/printStackTrace，请使用 @Slf4j 日志框架替代。'
fi

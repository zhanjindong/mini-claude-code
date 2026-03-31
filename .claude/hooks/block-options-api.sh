#!/bin/bash
# 【阻断型】检测并拦截 Options API 写法
FILE="$CLAUDE_FILE_PATH"
if grep -n 'export default {' "$FILE" 2>/dev/null; then
  echo '❌ [阻断] 检测到 Options API 写法（export default {}），本项目只允许 Composition API + <script setup>。'
  exit 1
fi

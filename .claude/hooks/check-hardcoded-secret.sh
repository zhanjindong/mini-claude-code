#!/bin/bash
# 【阻断型】扫描硬编码敏感信息（密钥、密码、Token 等）
FILE="$CLAUDE_FILE_PATH"
if grep -inE '(password|secret|token|api_key|apikey|access_key)\s*[:=]\s*[^$\{]' "$FILE" 2>/dev/null \
  | grep -ivE '(\$\{|\@Value|placeholder|example|TODO|xxx|\*\*\*)' ; then
  echo '❌ [阻断] 检测到疑似硬编码敏感信息，请使用环境变量或配置中心注入。'
  exit 1
fi

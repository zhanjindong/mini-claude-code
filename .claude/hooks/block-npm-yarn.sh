#!/bin/bash
# 【阻断型】禁止使用 npm/yarn，强制 pnpm
echo '❌ [阻断] 本项目使用 pnpm 管理依赖，禁止使用 npm/yarn。'
echo '请使用: pnpm install / pnpm add <package>'
exit 1

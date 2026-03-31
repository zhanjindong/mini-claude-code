#!/bin/bash
# 【阻断型】禁止直接 push 到 master/release 分支
echo '❌ [阻断] 禁止直接 push 到 master/release 分支，请通过 MR/PR 合入。'
exit 1

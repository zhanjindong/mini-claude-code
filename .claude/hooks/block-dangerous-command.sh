#!/bin/bash
# 【阻断型】拦截高危破坏性命令
echo '❌ [阻断] 检测到高危破坏性操作（rm -rf / drop table / truncate），已拦截。'
echo '如确需执行请手动操作。'
exit 1

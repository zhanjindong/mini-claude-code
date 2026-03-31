#!/bin/bash
# 【提醒型】长耗时服务提醒使用 tmux
echo '⚠️ [提醒] 长耗时服务建议在 tmux 会话中运行，避免中断丢失日志。'
echo '示例: tmux new -s dev && mvn spring-boot:run'

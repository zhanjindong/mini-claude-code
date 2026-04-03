# TODO — Computer Use 改进

> 对应 DESIGN.md Phase 4
> 创建日期: 2026-04-03

## 第一批：快速胜利（P0 + 低投入 P1）

- [ ] **T-01** 会话文件锁 — `src/tools/computer/lock.ts`
  - O_EXCL 原子锁文件 `~/.config/mcc/computer-use.lock`
  - PID 存活探测 + 过期锁回收
  - Computer tool dispatch 入口集成
  - process.on('exit') 自动释放
  - 预估: ~100 行

- [ ] **T-02** 移动后 Settle 延迟 — `src/tools/computer/platform.ts`
  - mouseMove 后 50ms sleep
  - 预估: 3 行

- [ ] **T-03** 截图尺寸缓存 — `src/tools/computer/platform.ts`
  - MacOSDriver 缓存 lastWidth/lastHeight
  - screenshot() 成功后更新缓存
  - 预估: 5 行

- [ ] **T-04** 权限主动检测 — `src/tools/computer/actions.ts`
  - dispatch 入口一次性检测 screencapture + cliclick
  - 失败输出 System Settings 路径指引
  - 预估: ~40 行

## 第二批：体验提升（P1）

- [ ] **T-05** 鼠标移动动画 — `src/tools/computer/platform.ts`
  - animatedMove(): ease-out-cubic, 2000px/sec, 60fps
  - 短距离(<30px)退化为瞬移
  - drag 操作使用动画移动
  - 预估: ~60 行

- [ ] **T-06** 剪贴板安全文本输入 — `src/tools/computer/platform.ts`
  - typeViaClipboard(): pbcopy → pbpaste 验证 → Cmd+V → 恢复
  - 特殊字符/中文/长文本自动走剪贴板路径
  - 预估: ~50 行

- [ ] **T-07** cliclick 自动安装 — `src/tools/computer/platform.ts`
  - 检测不存在时询问用户 brew install
  - 预估: ~20 行

## 第三批：稳健性（P2）

- [ ] **T-08** Modifier 键安全释放 — `src/tools/computer/platform.ts`
  - keyPress 拆分 kd/kp/ku，LIFO try/finally 释放
  - 预估: ~40 行

- [ ] **T-09** 排除终端窗口截图 — `src/tools/computer/platform.ts`
  - VLM prompt 添加"忽略终端"说明（快速方案）
  - 调研 screencapture 窗口排除方案（长期方案）
  - 预估: 中等

- [ ] **T-10** 滚轮滚动替代方向键 — `src/tools/computer/platform.ts`
  - 调研 AppleScript / cliclick 滚轮方案
  - 预估: 需调研

## 长期（P3/P4）

- [ ] **T-11** 多显示器支持
- [ ] **T-12** ESC 全局热键中止
- [ ] **T-13** 应用名过滤防注入
- [ ] **T-14** MCP Server 架构迁移

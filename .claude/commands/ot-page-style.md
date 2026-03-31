---
description: 页面样式修改 — 只修改前端页面样式，不触碰任何业务逻辑和接口
---

# /page-style 页面样式修改

你是一名前端 UI 工程师，专注于样式调整。你的职责是精准修改页面样式，严格不触碰任何业务逻辑代码。

## 输入信息

请用户提供：
- 页面路径或名称（如 `src/views/chat/ChatView.vue`）
- 样式修改需求描述（如「卡片间距调大」「按钮改为圆角」「适配移动端」）
- 设计稿参考（可选，截图或标注）

## 执行步骤

### 第一步：定位目标文件

1. 根据用户提供的页面路径/名称，找到对应的 `.vue` 文件
2. 确认关联的 `.scss` 文件（同名同目录）
3. 列出将要修改的文件清单，**不得包含非样式文件**

### 第二步：分析现有样式

1. 阅读 `<template>` 中的 class 和 style 绑定
2. 阅读关联的 `.scss` 文件
3. 识别当前使用的样式方案（Tailwind 原子类 / SCSS / 行内样式）
4. 记录现有布局结构和关键样式属性

### 第三步：制定修改方案

针对用户需求，列出具体修改点：

| 修改点 | 文件 | 修改方式 | 说明 |
|--------|------|---------|------|
| ... | .vue / .scss | 修改 class / 修改 scss 规则 | ... |

- 优先使用 Tailwind CSS 原子类
- 复杂样式使用 `.scss` 文件
- 向用户确认方案后再执行

### 第四步：执行样式修改

按方案逐项修改，每次改动范围尽量小：
1. 修改 `<template>` 中的 class 属性
2. 修改 `.scss` 文件中的样式规则
3. 如需新增 CSS 变量，添加到对应 `.scss` 文件中

### 第五步：修改验证

1. 检查修改的文件列表，确认未触及禁止修改的文件
2. 对比修改前后的 `<script setup>` 部分，确认零改动
3. 输出修改总结：改了哪些文件的哪些样式

## 严格约束

以下为硬性红线，违反任何一条即为不合格：

### 禁止修改的内容
- `<script setup>` 中的任何代码（变量、函数、import、逻辑）
- API 接口文件（`src/api/`）
- Store 文件（`src/stores/`）
- 路由配置（`src/routers/`）
- Hooks（`src/hooks/`）
- Helper（`src/helper/`）
- Utils（`src/utils/`）
- Constants（`src/constants/`）

### 禁止的操作
- 新增或删除 DOM 元素（纯布局容器调整除外，需说明理由）
- 修改 `v-if`、`v-for`、`v-model`、`v-show`、`@click` 等指令和事件绑定
- 修改组件的 props 传值和 emit 调用
- 引入新的 JS/TS 依赖

### 只允许修改
- `.scss` 文件中的样式规则
- `<template>` 中的 `class`、`:class`、`style`、`:style` 属性
- `<style>` 标签内的样式代码
- Tailwind CSS 类名

## 验收标准

- [ ] 只修改了样式相关文件和属性
- [ ] `<script setup>` 部分零改动
- [ ] 未修改任何 API/Store/Router/Hooks/Helper/Utils/Constants 文件
- [ ] 未改变 DOM 结构和指令逻辑
- [ ] 样式修改符合项目规范（Tailwind 优先，SCSS 补充）
- [ ] 修改总结清晰列出所有变更点

$ARGUMENTS

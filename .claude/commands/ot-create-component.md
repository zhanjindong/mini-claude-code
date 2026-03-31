---
description: 生成 Vue 组件 — 按项目组件规范一键生成标准组件代码
---

# /create-component 生成 Vue 组件

你是一名前端开发工程师，请按照项目组件规范生成标准的 Vue 组件代码。

## 输入信息

请用户提供：
- 组件名称（PascalCase）
- 组件类型（业务组件 / 弹窗组件 / 页面组件）
- 功能描述

## 生成步骤

### 1. 确定目录位置

| 组件类型 | 目录 | 说明 |
|---------|------|------|
| 业务组件 | `src/components/` | 可复用的业务 UI 组件 |
| 弹窗组件 | `src/components/` | 命名以 Dialog 结尾 |
| 页面组件 | `src/views/` | 数据调度和布局，不含逻辑/样式/原生HTML |

### 2. 生成 Vue 文件

- 使用 `<script setup lang="ts">` 语法
- 禁止使用 Options API
- 利用自动导入（ref/computed/onMounted 等无需 import）
- Props 使用 defineProps + TypeScript 类型定义
- Emits 使用 defineEmits + TypeScript 类型定义

### 3. 生成独立 SCSS 文件

- 与 Vue 文件同名同目录（如 `ChatPanel.vue` → `ChatPanel.scss`）
- `src/components/` 下组件不加 scoped
- 样式以 Tailwind CSS 原子化类为主，scss 文件处理复杂样式

### 4. 生成类型定义

- 在组件目录下创建 `types.ts` 或在 `src/types/` 下添加类型定义
- 接口命名 I 前缀 + PascalCase

### 5. 页面组件额外步骤（如为 views 组件）

- 在 `src/routers/` 对应模块下添加路由配置
- 路由组件使用懒加载

## 验收标准

- [ ] 文件命名符合 PascalCase 规范
- [ ] 使用 Composition API + `<script setup>`
- [ ] style 独立成 scss 文件
- [ ] components 下组件未加 scoped
- [ ] views 组件不含业务逻辑、原生 HTML、CSS 样式
- [ ] TypeScript 类型完整定义
- [ ] 单文件不超过 500 行

$ARGUMENTS

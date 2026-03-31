---
description: 前端项目上下文 — 当项目包含 Vue/TypeScript 文件时自动加载
globs: "**/*.{vue,ts,tsx}"
---

# 前端项目规范

## 技术栈

- **核心框架**: Vue 3.5 + TypeScript 5.8 + Element Plus + Pinia + Tailwind CSS 4 + Vite 6
- **包管理器**: pnpm（禁止使用 npm/yarn）
- **Node.js**: 18+
- **项目结构**: pnpm workspace + Turbo Monorepo

## 构建与运行

```bash
pnpm install      # 安装依赖
pnpm dev           # 本地开发
pnpm build         # 构建
pnpm test          # 单元测试
pnpm test:e2e      # E2E 测试
pnpm lint          # 代码检查
```

## 自动导入（无需手动 import）

以下 API 通过 unplugin-auto-import 自动注入，禁止手动 import：
- Vue: `ref`, `computed`, `onMounted`, `watch`, `reactive` 等
- Vue Router: `useRouter`, `useRoute`
- Pinia: `defineStore`
- VueUse: `useTitle`, `useDark`, `useToggle`, `useResizeObserver` 等
- Element Plus: `ElMessage`, `ElMessageBox`, `ElNotification`

## 命名规范

- Vue 组件文件 PascalCase（`ChatPanel.vue`），弹窗组件以 Dialog 结尾（`CreateAgentDialog.vue`）
- 组合式函数 camelCase + use 前缀（`useRequest.ts`）
- TypeScript 类型/接口 PascalCase + I 前缀（`IUser`、`IApiResponse`）
- CSS 类名 kebab-case（`app-layout`、`menu-root`）
- 常量 UPPER_SNAKE_CASE

## 核心约定

- 只使用 Composition API + `<script setup>`，**禁止 Options API**
- 样式方案以 Tailwind CSS 原子化类为主，动态样式使用 `v-bind:class`
- `src/views/` 只负责数据源、组件布局、组件间数据传递，不含基础业务逻辑、不含原生 HTML 元素、不含 CSS 样式代码
- `src/components/` 负责业务 UI 组件，vue 文件引入 scss **不加 scoped**：`<style lang="scss">`
- Vue 文件内的 style 独立成同名 scss 文件
- 单个 Vue 文件不超过 500 行
- template 不使用表达式，只根据单一字段数据渲染
- 一个功能点一个函数，一个字段一个组件（文件上传、下载、预览等独立成组件）
- `if-else if-else` 不能省略最后的 `else` 部分

## 目录职责速览

| 目录 | 职责 |
|------|------|
| `src/api/` | API 接口定义 |
| `src/components/` | 业务 UI 组件（不加 scoped） |
| `src/views/` | 页面布局与数据调度（不含逻辑/样式/原生HTML） |
| `src/helper/` | 业务辅助函数，保持独立性 |
| `src/constants/` | 常量集合，按页面-模块划分 |
| `src/hooks/` | 组合式函数 |
| `src/stores/` | Pinia 状态管理 |
| `src/styles/` | 通用样式（不含 components/views 样式） |
| `src/utils/` | 基础工具函数 |

## 禁止修改的核心文件

- `src/api/request.ts` 统一拦截器封装
- `src/layouts/` 布局组件结构
- `src/routers/` 路由配置结构

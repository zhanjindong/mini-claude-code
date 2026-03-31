---
description: 生成页面 — 一键生成 view + router + store + api 全套文件
---

# /create-page 生成页面

你是一名前端开发工程师，请按照项目规范一键生成新页面所需的全套文件。

## 输入信息

请用户提供：
- 页面名称（如：用户管理、数据看板）
- 所属模块（用于路由和目录组织）
- 页面功能描述

## 生成步骤

### 1. View 页面组件（`src/views/`）

- 目录格式: `src/views/{模块}-{功能}/`
- 页面组件只负责数据调度和组件布局
- 不含业务逻辑、原生 HTML 元素、CSS 样式代码
- 只使用 Element Plus 组件和 `src/components/` 下的业务组件进行布局组装
- 使用 `<script setup lang="ts">`

### 2. 路由配置（`src/routers/`）

- 在对应模块目录下新增路由配置
- 路由组件使用懒加载: `() => import('@/views/...')`
- 配置 meta 信息（title、权限等）

### 3. Store 状态模块（`src/stores/modules/`）

- 使用 Composition API 风格的 `defineStore`
- 文件命名 camelCase
- 只在页面确实需要跨组件共享状态时才创建

### 4. API 接口（`src/api/`）

- 在 `src/api/{模块}/` 下创建接口文件
- `index.ts`: 接口方法列表
- `type.ts`: 请求/响应类型定义（I 前缀 + PascalCase）
- 使用项目统一的请求封装

### 5. 独立 SCSS 文件

- 与 view 组件同名同目录
- 样式以 Tailwind CSS 为主，SCSS 处理复杂样式

## 生成文件清单

```
src/
├── views/{模块}-{功能}/
│   ├── index.vue              # 页面组件
│   └── index.scss             # 页面样式
├── routers/{模块}/
│   └── index.ts               # 路由配置（新增或追加）
├── stores/modules/{模块}/
│   └── index.ts               # 状态管理（按需）
└── api/{模块}/
    ├── index.ts               # 接口方法
    └── type.ts                # 类型定义
```

## 验收标准

- [ ] View 组件不含业务逻辑、原生 HTML、CSS 样式
- [ ] 使用 Composition API + `<script setup>`
- [ ] 路由使用懒加载
- [ ] API 类型定义完整（I 前缀）
- [ ] style 独立成 scss 文件
- [ ] 单文件不超过 500 行

$ARGUMENTS

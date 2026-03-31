---
description: 生成 API 接口 — 按项目分层规范一键生成完整接口代码
---

# /create-api 生成 API 接口

你是一名后端开发工程师，请按照项目分层架构规范，完整生成一个 API 接口的全部代码。

## 输入信息

请用户提供：
- 功能描述（做什么）
- 资源名称（如 agent、user、workflow）
- 操作类型（CRUD 中的哪些）

## 生成步骤

按分层顺序逐层生成：

### 1. Entity（dao 模块）
- 继承 BaseEntity
- 使用 Lombok 注解（@Data、@TableName 等）
- 字段添加注释

### 2. Mapper（dao 模块）
- 继承 BaseMapper<Entity>

### 3. DTO/VO（api 模块）
- 请求 DTO: `*CreateDTO` / `*UpdateDTO` / `*QueryDTO`
- 响应 VO: `*VO` / `*DetailVO`
- 使用 @Valid 校验注解

### 4. Service 接口 + 实现（service 模块）
- 接口: `I*Service`
- 实现: `*ServiceImpl`，使用 @Slf4j
- 包含事务管理（@Transactional）

### 5. Controller（service 模块）
- RESTful 风格: `/api/v1/{resource}`
- 添加 OpenAPI 注解（@Tag、@Operation、@Parameter）
- 使用 @Valid 校验请求参数
- 统一响应格式

### 6. 单元测试
- Service 层核心逻辑的单元测试
- 测试方法命名: `should_预期行为_when_前置条件`

## 验收标准

- [ ] 代码符合项目命名规范
- [ ] 分层结构正确，无跨层调用
- [ ] Controller 不含业务逻辑
- [ ] DTO 有参数校验注解
- [ ] 有 OpenAPI 文档注解
- [ ] 有对应单元测试

$ARGUMENTS

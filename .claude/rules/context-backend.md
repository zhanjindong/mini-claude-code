---
description: 后端项目上下文 — 当项目包含 Java 文件时自动加载
globs: "**/*.java"
---

# 后端项目规范

## 技术栈

- **核心框架**: Spring Boot 3.x + Java 21 + Spring Cloud + Nacos
- **数据层**: MyBatis-Plus + MySQL + Redis
- **构建工具**: Maven 多模块

## 构建与运行

```bash
mvn clean package -DskipTests    # 编译
java -jar service/target/*.jar --spring.profiles.active=dev  # 运行
mvn test                         # 单元测试
mvn test -pl service             # 指定模块测试
```

## 模块职责（禁止跨层调用）

| 模块 | 职责 | 依赖方向 |
|------|------|---------|
| api | 请求/响应 DTO/VO 定义，不含业务逻辑 | 无 |
| common | 异常、枚举、工具类、Web 配置 | 无 |
| dao | Entity + MyBatis-Plus Mapper | common |
| service | Controller + Service + Config + Client + Auth | api, common, dao |

## 分层架构原则

```
Controller → Service(Interface) → ServiceImpl → Mapper/Client → Database/External API
```

- **Controller**: 只负责参数接收、校验、调用 Service、返回结果，不含业务逻辑
- **Service**: 业务逻辑编排，事务管理
- **Mapper**: 数据访问，MyBatis-Plus CRUD
- **Client**: 远程服务调用封装

## 请求处理链路

```
请求 → AuthFilter(鉴权) → TraceIdInterceptor(链路追踪) → Controller → Service → Mapper/Client → 响应
```

## 命名规范

- 类名 PascalCase，后缀遵循约定: Controller / IService / ServiceImpl / Mapper / Entity / DTO / VO / Client / Utils / Config / Enum / Constants
- 方法名 camelCase，查询 `get/query/find/list`、创建 `create/add/save`、更新 `update/modify`、删除 `delete/remove`、布尔 `is/has/can`
- 常量 UPPER_SNAKE_CASE
- Service 层必须定义接口（I*Service），实现类为 *ServiceImpl

## 核心约定

- 所有实体继承 `BaseEntity`（自动填充 created_at/updated_at/created_by/updated_by/logic_delete）
- API 路径格式: `/api/v1/{resource}`
- 统一响应体: `{ code, message, data, timestamp, traceId }`
- 认证: JWT + SSO，用户上下文通过 `UserContext`（ThreadLocal）管理，请求结束自动清理
- 日志: `@Slf4j` + TraceId，业务异常 warn、系统异常 error
- 使用 Lombok 简化样板代码，禁止手写 getter/setter/toString
- 公共类和方法必须添加 JavaDoc 注释
- Controller 方法必须添加 OpenAPI 注解（`@Operation`、`@Parameter`）
- 使用 `@Valid` 进行请求参数校验，禁止在 Controller 中手动校验参数
- 禁止跨层调用: Controller 不能直接调用 Mapper，Service 不能直接操作 HttpServletRequest

## 禁止修改的核心目录

- `common/` 下的异常体系（BizException + GlobalExceptionHandler）
- 认证鉴权模块
- `dao/` 下已有的 BaseEntity 定义

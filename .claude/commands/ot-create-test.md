---
description: 生成测试 — 自动识别项目类型，为已有代码生成单元测试
---

# /ot-create-test 生成测试

你是一名测试工程师，请为指定的代码生成高质量的单元测试。

## 第一步：分析目标代码

1. 读取用户指定的文件或模块
2. 识别所有公共方法/导出函数/组件核心逻辑
3. 分析依赖关系，确定需要 Mock 的外部依赖
4. **自动识别项目类型**: 根据文件扩展名选择对应测试框架

## 第二步：设计测试用例

为每个目标设计测试用例，覆盖：
- **正常路径**: 标准输入下的预期行为
- **边界条件**: 空值、极值、边界值
- **异常路径**: 非法输入、依赖失败、异常抛出

## 第三步：生成测试代码

### 后端 Java 项目（检测到 .java 文件时）

- 测试类放在对应模块 `src/test/java/` 下，包路径与源码一致
- 测试类命名: `{ClassName}Test`
- 测试方法命名: `should_预期行为_when_前置条件`
- 使用 Mockito Mock 外部依赖
- 使用 `@DisplayName` 添加中文描述

```java
@ExtendWith(MockitoExtension.class)
@DisplayName("XxxService 单元测试")
class XxxServiceImplTest {
    @Mock
    private XxxMapper xxxMapper;
    @InjectMocks
    private XxxServiceImpl xxxService;

    @Test
    @DisplayName("应返回详情 - 当ID存在时")
    void should_return_detail_when_id_exists() {
        // given → when → then
    }
}
```

### 前端 Vue/TypeScript 项目（检测到 .vue/.ts/.tsx 文件时）

- 测试文件放在 `src/test/` 或 `__tests__/` 目录
- 测试文件命名: `{fileName}.test.ts`
- 使用 Vitest + @vue/test-utils

```typescript
describe('[模块名]', () => {
  it('should [预期行为] when [前置条件]', () => {
    // arrange → act → assert
  })
})
```

- 组件测试优先测行为（用户交互、事件触发），而非实现细节
- 使用 `vi.useFakeTimers()` 或 `flushPromises()` 处理异步

## 第四步：验证

1. 后端运行 `mvn test`，前端运行 `pnpm test`
2. 确认生成的测试全部通过
3. 检查是否有遗漏的核心逻辑未覆盖

## 约束

- 每个测试只验证一个行为
- 测试必须可独立运行，禁止依赖外部服务、数据库、网络
- 禁止使用硬等待（Thread.sleep / setTimeout）
- 测试数据使用工厂方法或 Builder 构造

$ARGUMENTS

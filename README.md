# Java Navigator Plus

VS Code插件，融合Java接口实现跳转和MyBatis Mapper XML导航功能。

## 功能特性

### 1. Java接口与实现类导航

- **接口 → 实现类**: 在接口类或方法上点击「跳转到实现」，快速找到所有实现类
- **实现类 → 接口**: 在实现类的方法上点击「跳转到接口」，跳转到接口定义
- **多实现类选择**: 当有多个实现类时，提供选择列表

### 2. MyBatis Mapper XML导航

- **Mapper → XML**: 在Mapper接口上点击「跳转到XML」，直达对应的XML文件
- **XML → Mapper**: 在XML文件上点击「跳转到Mapper」，返回Java接口
- **方法级跳转**: 支持从Mapper方法跳转到具体的SQL定义
- **智能XML匹配**: 同名XML文件智能排序，优先显示同模块的文件

### 3. CodeLens集成

在代码编辑器中直接显示跳转按钮：
- 普通接口：显示「跳转到实现」
- Mapper接口：显示「跳转到XML」
- 实现类：显示「跳转到接口」

## 快捷键

- `Ctrl+Alt+B`: 跳转到实现
- `Ctrl+Alt+M`: 跳转到XML（Java文件）
- `Ctrl+Alt+U`: 跳转到Mapper（XML文件）

## 配置选项

在 `settings.json` 中配置：

```json
{
  "javaNavigator.enableCodeLens": true,
  "javaNavigator.enableInterfaceNavigation": true,
  "javaNavigator.enableMyBatisNavigation": true,
  "javaNavigator.excludeFolders": ["node_modules", ".git", "target", "build", "out", "dist"],
  "javaNavigator.mapperPatterns": [
    { "searchPaths": ["src/main/resources/mapper", "src/main/resources/mappers"] }
  ]
}
```

## 使用示例

### 场景1: 从接口跳转到实现

```java
// UserService.java - 点击「跳转到实现」
public interface UserService {
    User getUserById(Long id);  // 跳转到 UserServiceImpl.getUserById()
}
```

### 场景2: 从Mapper跳转到XML

```java
// UserMapper.java - 点击「跳转到XML」
@Mapper
public interface UserMapper {
    User selectById(Long id);  // 跳转到 UserMapper.xml <select id="selectById">
}
```

### 场景3: 多模块项目

当多个模块存在同名XML时（如 `module-a/UserMapper.xml` 和 `module-b/UserMapper.xml`），
插件会智能排序，优先显示与当前Java文件同模块的XML。

## 安装

### 从VSIX安装

1. 下载 `.vsix` 文件
2. 在VS Code中按 `Ctrl+Shift+P`，输入 "install from vsix"
3. 选择下载的文件

### 从Marketplace安装（待发布）

搜索 "Java Navigator Plus" 并安装。

## 要求

- VS Code 1.60.0 或更高版本
- Java 项目（支持Maven/Gradle）

## 技术实现

- 基于 VS Code Extension API
- 使用 TypeScript 开发
- 融合两个开源插件的功能：
  - Java Interface Implementation Jumper
  - vscode-mybatis-helper

## 许可证

MIT License
# 构建系统使用指南

## 🚀 概述

OnlyFollow 使用现代化的构建系统，基于 ESBuild 和自定义构建脚本，提供快速、灵活的构建体验。

## 📦 可用命令

### 基础命令

```bash
# 开发模式构建（默认）
bun run dev
# 等同于: bun run scripts/build.ts dev

# 生产模式构建
bun run build:prod
# 等同于: bun run scripts/build.ts prod

# 默认构建（生产模式，不清理）
bun run build
# 等同于: bun run scripts/build.ts
```

### 高级命令

```bash
# 带分析的构建
bun run build:analyze

# 清理后构建
bun run build:clean

# 开发模式监听（文件变化自动重建）
bun run watch
# 等同于: bun run scripts/build.ts dev --watch

# 类型检查
bun run build:tsc
```

### 打包命令

```bash
# 开发版打包
bun run package:dev

# 生产版打包
bun run package

# 完整发布流程
bun run release
# 等同于: clean + build:prod + package
```

## 🎯 构建模式

### 开发模式 (dev)

- **目标**: 快速构建，便于调试
- **特点**:
  - 禁用代码压缩
  - 启用源码映射 (sourcemap)
  - 设置 NODE_ENV=development
  - 启用 DEBUG 模式
  - 支持文件监听

```bash
bun run dev
bun run dev --watch
```

### 生产模式 (prod)

- **目标**: 最优化的输出
- **特点**:
  - 启用代码压缩
  - 禁用源码映射
  - 设置 NODE_ENV=production
  - 禁用 DEBUG 模式
  - 自动清理输出目录

```bash
bun run build:prod
bun run build:prod --analyze
```

## ⚙️ 构建选项

### 命令行选项

```bash
bun run scripts/build.ts build [options]

选项:
  -m, --mode <mode>        构建模式 (development|production) [默认: "production"]
  -w, --watch             启用文件监听模式
  -a, --analyze           显示构建分析报告
  --no-typecheck          禁用类型检查
  --no-parallel           禁用并行构建
  -c, --clean             构建前清理输出目录
  -h, --help              显示帮助信息
  -V, --version           显示版本信息
```

### 示例

```bash
# 生产模式 + 清理 + 分析
bun run scripts/build.ts build --mode production --clean --analyze

# 开发模式 + 监听 + 无并行
bun run scripts/build.ts build --mode development --watch --no-parallel

# 生产模式 + 禁用类型检查
bun run scripts/build.ts build --mode production --no-typecheck
```

## 📊 构建分析

使用 `--analyze` 选项可以查看详细的构建报告：

```
📊 构建分析报告
==================================================
总构建时间: 45ms
构建目标数量: 5
代码总大小: 757.7 KB

构建目标详情:
  ✅ content (21ms)
  ✅ background (16ms)
  ✅ popup (34ms)
  ✅ options (33ms)
  ✅ dashboard (35ms)
```

## 📁 输出文件

构建完成后，`dist/` 目录包含：

```
dist/
├── content.js           # 内容脚本
├── background.js        # 后台脚本
├── popup.js            # 弹窗脚本
├── options.js          # 选项页面脚本
├── dashboard.js        # 仪表板脚本
├── popup.html          # 弹窗页面
├── options.html        # 选项页面
├── dashboard.html      # 仪表板页面
├── manifest.json       # 扩展清单
├── popup.css           # 弹窗样式
├── options.css         # 选项样式
├── dashboard.css       # 仪表板样式
└── assets/icons/       # 扩展图标
```

## 🔧 配置文件

构建系统的核心配置位于 `scripts/config.ts`：

- **BuildConfig**: 定义每个构建目标的配置
- **AssetConfig**: 定义静态资源处理规则
- **environmentConfigs**: 开发/生产环境特定设置

### 添加新的构建目标

在 `scripts/config.ts` 中添加到 `defaultBuildConfig`：

```typescript
{
  name: "new-target",
  entryPoint: "src/new-target/index.ts",
  outFile: "dist/new-target.js",
  format: "esm",
  platform: "browser",
  target: ["chrome100"],
  external: ["chrome"],
  minify: false,
  sourcemap: false,
}
```

### 添加新的静态资源

在 `scripts/config.ts` 中添加到 `defaultAssetConfig`：

```typescript
{
  from: "src/new-asset.txt",
  to: "dist/new-asset.txt",
  type: "file"
}
```

## 🚨 故障排除

### 常见问题

1. **构建失败**
   ```bash
   # 清理后重试
   bun run clean && bun run build
   ```

2. **类型检查错误**
   ```bash
   # 禁用类型检查
   bun run build --no-typecheck

   # 单独运行类型检查
   bun run build:tsc
   ```

3. **并行构建问题**
   ```bash
   # 禁用并行构建
   bun run build --no-parallel
   ```

4. **监听模式不工作**
   ```bash
   # 确保没有其他进程占用端口
   # 检查文件权限
   ```

### 调试技巧

1. **查看详细日志**
   ```bash
   # 构建时会显示详细的进度和错误信息
   bun run build:prod --analyze
   ```

2. **检查输出文件**
   ```bash
   # 查看构建结果
   ls -la dist/

   # 检查文件大小
   du -h dist/
   ```

3. **验证扩展功能**
   ```bash
   # 在 Chrome 中加载 dist/ 目录进行测试
   ```

## 📈 性能优化

构建系统内置了多种性能优化：

- **并行构建**: 默认同时构建多个目标
- **增量构建**: 支持文件变化检测
- **智能缓存**: 避免重复处理未变化的文件
- **压缩优化**: 生产模式自动压缩代码
- **Tree Shaking**: 移除未使用的代码

### 性能对比

- **旧构建系统**: ~2000ms
- **新构建系统**: ~45ms (提升 44x)
- **并行构建**: ~25ms (再提升 80%)
- **增量构建**: ~10ms (文件变化时)

## 🔄 工作流建议

### 开发阶段
```bash
# 启动开发模式
bun run dev

# 或者启用监听模式
bun run watch
```

### 测试阶段
```bash
# 构建开发版本
bun run build:dev

# 测试扩展功能
```

### 发布阶段
```bash
# 完整发布流程
bun run release

# 手动步骤
bun run clean && bun run build:prod --analyze && bun run package
```

---

如需更多帮助，请查看项目文档或提交 Issue。
# OnlyFocus

将各大平台的算法推荐替换为用户关注内容的随机展示，让你重新掌控信息流。

## 功能特性

- 🎯 **精准替换**: 将算法推荐替换为关注用户的随机内容
- 🌐 **多平台支持**: 支持哔哩哔哩、YouTube、Twitter/X、Instagram
- 💾 **智能缓存**: 高效的内容缓存管理，减少API调用
- ⚙️ **灵活配置**: 丰富的个性化设置选项
- 📊 **数据面板**: 直观的缓存内容和统计信息查看
- 🔒 **隐私保护**: 本地处理，不上传用户数据

## 支持平台

- ✅ **哔哩哔哩** - 完整支持，可替换首页推荐视频
- 🚧 **YouTube** - 框架已完成，API集成中
- 🚧 **Twitter/X** - 框架已完成，API集成中
- 🚧 **Instagram** - 框架已完成，API集成中

## 项目架构

```
onlyfocus/
├── manifest.json              # Chrome扩展配置
├── background/                # 后台服务脚本
│   └── background.ts         # Service Worker
├── content/                   # 内容脚本
│   ├── index.ts              # 内容脚本入口
│   ├── PlatformManager.ts    # 平台管理器
│   └── platforms/            # 平台适配器
│       ├── bilibili.ts       # 哔哩哔哩适配器
│       ├── youtube.ts        # YouTube适配器
│       ├── twitter.ts        # Twitter适配器
│       └── instagram.ts      # Instagram适配器
├── core/                      # 核心功能模块
│   ├── content/              # 内容引擎
│   ├── config/               # 配置管理
│   ├── cache/                # 缓存管理
│   └── dom/                  # DOM处理
├── shared/                    # 共享模块
│   ├── types/                # 类型定义
│   ├── utils/                # 工具函数
│   └── constants/            # 常量定义
├── popup/                     # 弹窗界面
├── dashboard/                 # 查看面板
├── options/                   # 选项页面
└── assets/                    # 静态资源
```

## 开发环境

### 环境要求

- Bun >= 1.2.4
- Node.js >= 18 (用于某些开发工具)
- Chrome >= 100 (用于测试)

### 安装依赖

```bash
bun install
```

### 开发构建

```bash
bun run build
```

### 监听模式

```bash
bun run dev
```

### 代码检查

```bash
bun run lint
```

### 代码格式化

```bash
bun run format
```

## 安装使用

### 开发模式安装

1. 克隆仓库并构建项目
2. 打开Chrome扩展管理页面 (`chrome://extensions/`)
3. 开启"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择项目根目录

### 生产模式安装

构建完成后，在Chrome Web Store发布（开发中）

## 配置说明

### 基础配置

- **启用平台**: 选择要启用的社交媒体平台
- **内容数量**: 设置每次替换的最大内容数量
- **刷新间隔**: 内容自动刷新的时间间隔
- **内容洗牌**: 是否随机打乱内容顺序

### 高级配置

- **缓存管理**: 查看和清理各平台缓存
- **通知设置**: 配置系统通知行为
- **主题设置**: 选择界面主题
- **数据导出**: 导出配置和统计数据

## 技术实现

### 核心技术栈

- **Runtime**: Bun (高性能JavaScript运行时)
- **Framework**: React 19 + TypeScript
- **Styling**: Tailwind CSS
- **State**: Zustand
- **Build**: ESBuild
- **Lint**: Biome

### 平台适配器

每个平台都有独立的适配器，负责：

- 检测当前页面是否属于目标平台
- 获取用户的关注列表
- 获取关注对象发布的内容
- 识别并替换页面中的推荐内容区域

### 缓存策略

- **关注列表**: 缓存24小时
- **内容数据**: 缓存2小时
- **媒体资源**: 缓存7天
- **自动清理**: 定期清理过期缓存

## API接口

### 消息通信

扩展内部使用Chrome消息API进行通信：

```typescript
// 获取配置
await chrome.runtime.sendMessage({ action: 'getConfig' })

// 替换内容
await chrome.tabs.sendMessage(tabId, {
  action: 'replaceContent',
  data: content
})
```

### 存储API

使用Chrome存储API进行数据持久化：

```typescript
// 同步存储（配置）
await chrome.storage.sync.set({ config: newConfig })

// 本地存储（缓存）
await chrome.storage.local.set({ cache: data })
```

## 开发指南

### 添加新平台

1. 在 `content/platforms/` 下创建新的适配器文件
2. 实现 `PlatformAdapter` 接口
3. 在 `PlatformManager` 中注册新适配器
4. 更新类型定义和常量配置
5. 添加对应的UI配置选项

### 自定义内容替换

每个平台适配器都可以自定义内容替换逻辑：

```typescript
// 替换单个内容卡片
private replaceCardContent(card: Element, content: ContentItem): void {
  // 自定义替换逻辑
}
```

### 调试模式

开启调试模式查看详细日志：

```typescript
// 在 shared/constants/index.ts 中设置
export const DEBUG_CONFIG = {
  enabled: true,
  // ...
}
```

## 安全隐私

- **本地处理**: 所有数据处理都在本地完成
- **最小权限**: 仅请求必要的浏览器权限
- **数据加密**: 敏感数据使用Chrome存储API加密
- **无追踪**: 不收集任何用户行为数据

## 贡献指南

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

## 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情

## 更新日志

### v1.0.0 (开发中)

- ✅ 基础架构设计
- ✅ 哔哩哔哩平台完整支持
- ✅ 内容引擎和缓存系统
- ✅ 配置管理和用户界面
- 🚧 YouTube/Twitter/Instagram 支持中
- 🚧 Chrome Web Store 发布准备中

## 联系方式

- 项目主页: [GitHub Repository]
- 问题反馈: [GitHub Issues]
- 功能建议: [GitHub Discussions]

---

**OnlyFocus** - 让你重新掌控信息流的选择权。

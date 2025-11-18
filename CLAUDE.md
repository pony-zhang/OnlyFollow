# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## OnlyFollow - Chrome Extension

OnlyFollow 是一个Chrome扩展，将各大平台的算法推荐替换为用户关注内容的随机展示，支持哔哩哔哩、YouTube、Twitter/X、Instagram等平台。

## 核心架构

### 技术栈
- **Runtime**: Bun >= 1.2.4
- **Framework**: React 19 + TypeScript
- **Styling**: Tailwind CSS 4.0
- **State**: Zustand
- **Build**: ESBuild
- **Lint**: Biome
- **UI Components**: Radix UI

### 目录结构
```
src/
├── background/           # 后台服务脚本（Service Worker）
├── content/            # 内容脚本
│   ├── platforms/      # 平台适配器（bilibili.ts, youtube.ts等）
│   └── PlatformManager.ts  # 平台管理器
├── core/               # 核心功能模块
│   ├── content/        # 内容引擎
│   ├── config/         # 配置管理
│   ├── state/          # 状态管理
│   └── cache/          # 缓存管理
├── shared/             # 共享模块
│   ├── types/          # TypeScript类型定义
│   ├── utils/          # 工具函数
│   └── constants/      # 常量定义
├── popup/              # 扩展弹窗界面
├── dashboard/          # 数据面板
├── options/            # 选项页面
└── assets/             # 静态资源
```

## 核心开发命令

### 开发环境
```bash
# 安装依赖
bun install

# 开发模式构建（监听文件变化）
bun run dev

## 核心概念

### 平台适配器 (PlatformAdapter)
每个平台都有独立的适配器实现 `PlatformAdapter` 接口：
- `detectCurrentPlatform()` - 检测当前平台
- `getFollowedUsers()` - 获取关注用户列表
- `getUserContent()` - 获取用户内容
- `replaceContent()` - 替换页面推荐内容

### 内容引擎 (ContentEngine)
单例模式，负责：
- 管理内容缓存和刷新
- 协调各平台适配器
- 处理内容洗牌和分发
- 状态管理和事件监听

### 平台管理器 (PlatformManager)
单例模式，负责：
- 检测当前访问的平台
- 管理各平台适配器实例
- 监听页面变化（SPA导航）

### 缓存策略
- **关注列表**: 缓存24小时
- **内容数据**: 缓存2小时
- **媒体资源**: 缓存7天
- 使用Chrome Storage API进行持久化

## 开发指南

### 添加新平台支持
1. 在 `src/content/platforms/` 创建新适配器
2. 实现 `PlatformAdapter` 接口
3. 在 `PlatformManager` 中注册适配器
4. 更新 `shared/types/index.ts` 中的 `Platform` 类型
5. 添加平台检测配置到 `shared/constants/index.ts`

### Chrome扩展集成
- 使用Chrome消息API在background和content scripts间通信
- 配置管理通过 `ConfigManager` 和Chrome Storage API
- 支持多标签页状态同步

### 状态管理
- 使用Zustand进行全局状态管理
- `StateManager` 处理插件和平台状态
- 支持状态变化监听和持久化

## 调试和测试
- 开发模式在Chrome中加载 `dist/` 目录
- 控制台日志通过 `DEBUG_CONFIG` 控制
- 支持增量构建和热重载

## 关键文件位置
- 主配置文件: `src/core/config/ConfigManager.ts`
- 平台管理: `src/content/PlatformManager.ts`
- 内容引擎: `src/core/content/ContentEngine.ts`
- 类型定义: `src/shared/types/index.ts`
- 构建脚本: `scripts/build.ts`

// 通用类型定义
export interface BaseModel {
  id: string;
  createdAt: number;
  updatedAt: number;
}

// 平台类型
export type Platform = 'bilibili' | 'youtube' | 'twitter' | 'instagram';

// 平台特定配置
export interface PlatformConfig {
  enabled: boolean;
  requestDelay: number; // 请求间隔（毫秒）
  concurrentRequests: boolean; // 是否启用并发请求
  concurrentLimit: number; // 并发请求数量限制
  maxItems: number; // 最大内容数量
  customSettings?: Record<string, any>; // 平台自定义设置
}

// 用户配置
export interface UserConfig {
  enabledPlatforms: Platform[];
  globalSettings: {
    refreshInterval: number; // 全局刷新间隔
    shuffleEnabled: boolean; // 内容洗牌
    maxItemsPerPlatform: number; // 每个平台最大内容数
  };
  platformSettings: Record<Platform, PlatformConfig>; // 每个平台的独立配置
  uiSettings: {
    showNotifications: boolean;
    theme: 'light' | 'dark' | 'auto';
  };
}

// 缓存项
export interface CacheItem<T = any> extends BaseModel {
  data: T;
  expiresAt: number;
  platform: Platform;
}

// 关注对象
export interface FollowedUser extends BaseModel {
  platform: Platform;
  platformId: string;
  username: string;
  displayName: string;
  avatar?: string;
  verified?: boolean;
}

// 内容项
export interface ContentItem extends BaseModel {
  platform: Platform;
  platformId: string;
  author: FollowedUser;
  title: string;
  description?: string;
  thumbnail?: string;
  url: string;
  publishedAt: number;
  metrics?: {
    views?: number;
    likes?: number;
    comments?: number;
    shares?: number;
  };
  duration?: number; // 视频时长（秒）
  type: 'video' | 'post' | 'image' | 'article';
}

// API响应
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// 平台适配器接口
export interface PlatformAdapter {
  platform: Platform;
  isActive(): boolean;
  getFollowedUsers(): Promise<FollowedUser[]>;
  getUserContent(userId: string, limit?: number): Promise<ContentItem[]>;
  replaceContent(content: ContentItem[]): Promise<void>;
  detectContentArea(): Element | null;
}

// DOM替换配置
export interface DOMReplacement {
  selector: string;
  replacement: (element: Element, content: ContentItem) => void;
  preserveAttributes?: string[];
}

// 消息类型
export type MessageType =
  | 'GET_CONFIG'
  | 'SET_CONFIG'
  | 'GET_FOLLOWED_USERS'
  | 'GET_CONTENT'
  | 'REFRESH_CONTENT'
  | 'CLEAR_CACHE'
  | 'PLATFORM_DETECTED'
  | 'CONTENT_REPLACED'
  | 'ERROR_OCCURRED';

// 消息数据
export interface MessageData {
  type: MessageType;
  platform?: Platform;
  data?: any;
  error?: string;
}

// Chrome扩展消息
export interface ChromeMessage<T = any> {
  action: string;
  data?: T;
  tabId?: number;
}
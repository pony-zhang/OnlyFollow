import type { Platform } from '../types';

// 平台默认配置
export const DEFAULT_PLATFORM_CONFIGS: Record<Platform, PlatformConfig> = {
  bilibili: {
    enabled: true,
    requestDelay: 15000, // 15秒，B站API限制极其严格，需要更长间隔
    concurrentRequests: false, // 强制关闭并发
    concurrentLimit: 1, // 单线程请求
    maxItems: 20,
    customSettings: {
      followPageSize: 50, // 关注列表每页数量
      videoPageSize: 50, // 视频列表每页数量
      safeMode: true, // 安全模式，强制串行
      minRequestInterval: 15000, // 最小请求间隔增加到15秒
      errorRetryDelay: 30000, // 错误后重试延迟增加到30秒
    },
  },
  youtube: {
    enabled: true,
    requestDelay: 1000, // 1秒，YouTube API相对宽松
    concurrentRequests: true, // 可以并发
    concurrentLimit: 3, // 3个并发请求
    maxItems: 30,
    customSettings: {
      apiKey: '', // YouTube API key
      maxResults: 50,
    },
  },
  twitter: {
    enabled: true,
    requestDelay: 2000, // 2秒，Twitter API限制中等
    concurrentRequests: false, // 建议关闭并发
    concurrentLimit: 2, // 最多2个并发
    maxItems: 25,
    customSettings: {
      bearerToken: '', // Twitter Bearer Token
      tweetFields: 'created_at,author_id,public_metrics',
    },
  },
  instagram: {
    enabled: true,
    requestDelay: 3000, // 3秒，Instagram API限制较严
    concurrentRequests: false, // 强制关闭并发
    concurrentLimit: 1, // 单线程请求
    maxItems: 15,
    customSettings: {
      accessToken: '', // Instagram Access Token
      mediaFields: 'id,media_type,media_url,caption,timestamp',
    },
  },
};

// 默认配置
export const DEFAULT_CONFIG = {
  enabledPlatforms: ['bilibili', 'youtube', 'twitter', 'instagram'] as Platform[],
  globalSettings: {
    refreshInterval: 30 * 60 * 1000, // 30分钟
    shuffleEnabled: true,
    maxItemsPerPlatform: 20, // 每个平台最大内容数
  },
  platformSettings: DEFAULT_PLATFORM_CONFIGS,
  uiSettings: {
    showNotifications: true,
    theme: 'auto' as const,
  },
};

// 缓存配置
export const CACHE_CONFIG = {
  FOLLOWED_USERS: 24 * 60 * 60 * 1000, // 24小时
  CONTENT: 2 * 60 * 60 * 1000, // 2小时
  METADATA: 7 * 24 * 60 * 60 * 1000, // 7天
  MAX_CACHE_SIZE: 1000, // 最大缓存条目数
};

// 平台配置
export const PLATFORM_CONFIG = {
  bilibili: {
    name: 'Bilibili',
    domain: 'bilibili.com',
    apiBase: 'https://api.bilibili.com',
    selectors: {
      contentArea: '.bili-video-card',
      videoCard: '.bili-video-card__info--tit a',
      authorLink: '.bili-video-card__info--owner',
      thumbnail: '.bili-video-card__cover img',
    },
    colors: {
      primary: '#00a1d6',
      secondary: '#fb7299',
    },
  },
  youtube: {
    name: 'YouTube',
    domain: 'youtube.com',
    apiBase: 'https://www.googleapis.com/youtube/v3',
    selectors: {
      contentArea: 'ytd-rich-item-renderer',
      videoCard: 'a#video-title',
      authorLink: 'ytd-channel-name a',
      thumbnail: 'img',
    },
    colors: {
      primary: '#ff0000',
      secondary: '#282828',
    },
  },
  twitter: {
    name: 'Twitter/X',
    domain: 'twitter.com|x.com',
    apiBase: 'https://api.twitter.com/2',
    selectors: {
      contentArea: 'div[data-testid="tweet"]',
      tweetCard: 'a[href*="/status/"]',
      authorLink: 'a[href*="/"]',
      thumbnail: 'img',
    },
    colors: {
      primary: '#1da1f2',
      secondary: '#14171a',
    },
  },
  instagram: {
    name: 'Instagram',
    domain: 'instagram.com',
    apiBase: 'https://graph.instagram.com',
    selectors: {
      contentArea: 'article',
      postCard: 'a[href*="/p/"]',
      authorLink: 'a[href*="/"]',
      thumbnail: 'img',
    },
    colors: {
      primary: '#e4405f',
      secondary: '#ffffff',
    },
  },
} as const;

// 存储键名
export const STORAGE_KEYS = {
  CONFIG: 'onlyfocus_config',
  FOLLOWED_USERS: 'onlyfocus_followed_users',
  CONTENT_CACHE: 'onlyfocus_content_cache',
  METADATA_CACHE: 'onlyfocus_metadata_cache',
  LAST_UPDATED: 'onlyfocus_last_updated',
} as const;

// 错误消息
export const ERROR_MESSAGES = {
  NOT_LOGGED_IN: '用户未登录，无法获取关注列表',
  API_RATE_LIMIT: 'API请求频率限制，请稍后重试',
  NETWORK_ERROR: '网络连接错误',
  PERMISSION_DENIED: '权限不足',
  PLATFORM_NOT_SUPPORTED: '不支持的平台',
  CONTENT_NOT_FOUND: '未找到相关内容',
  CACHE_EXPIRED: '缓存已过期',
  INVALID_CONFIG: '配置无效',
} as const;

// 通知消息
export const NOTIFICATION_MESSAGES = {
  CONTENT_REPLACED: '内容已替换为关注内容',
  PLATFORM_DETECTED: '检测到支持的平台',
  ERROR_OCCURRED: '发生错误，请查看控制台',
  CONFIG_UPDATED: '配置已更新',
  CACHE_CLEARED: '缓存已清理',
} as const;

// 调试信息
export const DEBUG_CONFIG = {
  enabled: process.env.NODE_ENV === 'development',
  prefix: '[OnlyFocus]',
  colors: {
    info: '#0066cc',
    success: '#009900',
    warning: '#ff9900',
    error: '#cc0000',
  },
} as const;

// 平台检测规则
export const PLATFORM_DETECTION = {
  bilibili: {
    match: /^https?:\/\/www\.bilibili\.com\//,
    test: () => {
      return !!document.querySelector('.nav-user-info, .user-con, .header-avatar-wrap');
    },
  },
  youtube: {
    match: /^https?:\/\/www\.youtube\.com\//,
    test: () => {
      return !!document.querySelector('#avatar-btn');
    },
  },
  twitter: {
    match: /^https?:\/\/(twitter\.com|x\.com)\//,
    test: () => {
      return !!document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
    },
  },
  instagram: {
    match: /^https?:\/\/www\.instagram\.com\//,
    test: () => {
      return !!document.querySelector('[data-testid="nav-profile"]');
    },
  },
} as const;
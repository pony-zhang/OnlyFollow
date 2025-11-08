import type { ContentItem, FollowedUser, Platform } from '../../shared/types';
import { configManager } from '../config/ConfigManager';
import { StorageManager } from '../../shared/utils/storage';
import { ChromeExtensionApi } from '../../shared/utils/api';
import { CACHE_CONFIG, DEBUG_CONFIG } from '../../shared/constants';

export interface ContentEngineOptions {
  platform?: Platform;
  maxItems?: number;
  refreshInterval?: number;
  shuffleEnabled?: boolean;
}

export class ContentEngine {
  private static instance: ContentEngine;
  private isRunning: boolean = false;
  private refreshTimer: NodeJS.Timeout | null = null;
  private lastRefresh: number = 0;
  private eventListeners: Map<string, Function[]> = new Map();

  private constructor() {
    this.initializeEventListeners();
  }

  static getInstance(): ContentEngine {
    if (!ContentEngine.instance) {
      ContentEngine.instance = new ContentEngine();
    }
    return ContentEngine.instance;
  }

  // 初始化事件监听器
  private initializeEventListeners(): void {
    // 监听配置变化
    configManager.addListener(async (config) => {
      if (this.isRunning) {
        await this.restart();
      }
    });
  }

  // 启动内容引擎
  async start(options?: ContentEngineOptions): Promise<void> {
    if (this.isRunning) {
      this.log('内容引擎已在运行');
      return;
    }

    try {
      this.log('启动内容引擎...', 'info');
      const config = await configManager.getConfig();

      // 合并选项
      const finalOptions: Required<ContentEngineOptions> = {
        platform: options?.platform || null as any,
        maxItems: options?.maxItems || config.contentSettings.maxItems,
        refreshInterval: options?.refreshInterval || config.contentSettings.refreshInterval,
        shuffleEnabled: options?.shuffleEnabled || config.contentSettings.shuffleEnabled,
      };

      // 检查是否启用了当前平台
      if (finalOptions.platform) {
        const isPlatformEnabled = await configManager.isPlatformEnabled(finalOptions.platform);
        if (!isPlatformEnabled) {
          throw new Error(`平台 ${finalOptions.platform} 未启用`);
        }
      }

      this.isRunning = true;
      this.emit('engineStarted', { options: finalOptions });

      // 立即获取一次内容
      await this.refreshContent(finalOptions);

      // 设置定时刷新
      this.setupRefreshTimer(finalOptions.refreshInterval);

      this.log('内容引擎启动成功', 'success');
    } catch (error) {
      this.log(`启动内容引擎失败: ${error}`, 'error');
      this.isRunning = false;
      throw error;
    }
  }

  // 停止内容引擎
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.log('停止内容引擎...', 'info');

    this.isRunning = false;

    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }

    this.emit('engineStopped');
    this.log('内容引擎已停止', 'success');
  }

  // 重启内容引擎
  async restart(): Promise<void> {
    this.stop();
    await this.start();
  }

  // 刷新内容
  async refreshContent(options?: ContentEngineOptions): Promise<ContentItem[]> {
    if (!this.isRunning) {
      throw new Error('内容引擎未运行');
    }

    try {
      this.log('开始刷新内容...', 'info');
      this.emit('refreshStarted');

      const config = await configManager.getConfig();
      const finalOptions: Required<ContentEngineOptions> = {
        platform: options?.platform || null as any,
        maxItems: options?.maxItems || config.contentSettings.maxItems,
        refreshInterval: options?.refreshInterval || config.contentSettings.refreshInterval,
        shuffleEnabled: options?.shuffleEnabled || config.contentSettings.shuffleEnabled,
      };

      // 获取内容
      let content: ContentItem[];

      // 发送消息到内容脚本获取内容
      if (typeof chrome !== 'undefined' && chrome.tabs) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          try {
            content = await ChromeExtensionApi.sendMessage('getRandomContent', {
              platform: finalOptions.platform,
              maxItems: finalOptions.maxItems,
            }, tab.id);
          } catch (error) {
            // 如果内容脚本不可用，尝试直接获取
            content = await this.getContentDirectly(finalOptions);
          }
        } else {
          content = await this.getContentDirectly(finalOptions);
        }
      } else {
        content = await this.getContentDirectly(finalOptions);
      }

      if (!content || content.length === 0) {
        throw new Error('未获取到任何内容');
      }

      // 如果启用洗牌，随机打乱内容
      if (finalOptions.shuffleEnabled) {
        content = this.shuffleContent(content);
      }

      // 限制内容数量
      content = content.slice(0, finalOptions.maxItems);

      // 缓存内容
      await this.cacheContent(content, finalOptions.platform);

      // 记录刷新时间
      this.lastRefresh = Date.now();

      this.emit('refreshCompleted', { content, options: finalOptions });
      this.log(`刷新内容完成，获取到 ${content.length} 条内容`, 'success');

      return content;
    } catch (error) {
      this.log(`刷新内容失败: ${error}`, 'error');
      this.emit('refreshFailed', { error });
      throw error;
    }
  }

  // 直接获取内容（不通过内容脚本）
  private async getContentDirectly(options: Required<ContentEngineOptions>): Promise<ContentItem[]> {
    // 这个方法主要用于后台脚本或测试
    // 实际的内容获取需要通过内容脚本，因为需要访问页面API
    throw new Error('直接获取内容功能需要在内容脚本中实现');
  }

  // 缓存内容
  private async cacheContent(content: ContentItem[], platform?: Platform): Promise<void> {
    const cacheKey = platform
      ? `onlyfocus_${platform}_content_latest`
      : 'onlyfocus_content_latest';

    await StorageManager.setCache(cacheKey, content, CACHE_CONFIG.CONTENT);
    this.log(`内容已缓存到: ${cacheKey}`, 'info');
  }

  // 获取缓存的内容
  async getCachedContent(platform?: Platform): Promise<ContentItem[] | null> {
    const cacheKey = platform
      ? `onlyfocus_${platform}_content_latest`
      : 'onlyfocus_content_latest';

    return await StorageManager.getCache<ContentItem[]>(cacheKey);
  }

  // 洗牌内容
  private shuffleContent(content: ContentItem[]): ContentItem[] {
    const shuffled = [...content];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  // 设置刷新定时器
  private setupRefreshTimer(interval: number): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }

    this.refreshTimer = setInterval(async () => {
      try {
        await this.refreshContent();
      } catch (error) {
        this.log(`定时刷新失败: ${error}`, 'error');
      }
    }, interval);

    this.log(`设置刷新定时器，间隔: ${interval}ms`, 'info');
  }

  // 获取关注用户列表
  async getFollowedUsers(platform?: Platform): Promise<FollowedUser[]> {
    try {
      this.log('获取关注用户列表...', 'info');

      let users: FollowedUser[];

      // 尝试从内容脚本获取
      if (typeof chrome !== 'undefined' && chrome.tabs) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          try {
            users = await ChromeExtensionApi.sendMessage('getFollowedUsers', {
              platform,
            }, tab.id);
          } catch (error) {
            // 如果内容脚本不可用，从缓存获取
            users = await this.getCachedFollowedUsers(platform);
          }
        } else {
          users = await this.getCachedFollowedUsers(platform);
        }
      } else {
        users = await this.getCachedFollowedUsers(platform);
      }

      this.emit('followedUsersLoaded', { users, platform });
      this.log(`获取到 ${users.length} 个关注用户`, 'success');

      return users;
    } catch (error) {
      this.log(`获取关注用户失败: ${error}`, 'error');
      this.emit('followedUsersLoadFailed', { error, platform });
      throw error;
    }
  }

  // 获取缓存的关注用户
  private async getCachedFollowedUsers(platform?: Platform): Promise<FollowedUser[]> {
    const cacheKey = platform
      ? `onlyfocus_${platform}_followed_users`
      : 'onlyfocus_followed_users';

    const users = await StorageManager.getCache<FollowedUser[]>(cacheKey);
    return users || [];
  }

  // 获取引擎状态
  getStatus(): {
    isRunning: boolean;
    lastRefresh: number;
    nextRefresh: number | null;
    uptime: number;
  } {
    const now = Date.now();
    const uptime = this.isRunning && this.lastRefresh > 0 ? now - this.lastRefresh : 0;

    return {
      isRunning: this.isRunning,
      lastRefresh: this.lastRefresh,
      nextRefresh: this.refreshTimer ? this.lastRefresh + 30000 : null, // 假设30秒刷新间隔
      uptime,
    };
  }

  // 手动触发刷新
  async manualRefresh(options?: ContentEngineOptions): Promise<ContentItem[]> {
    this.log('手动触发内容刷新', 'info');
    return await this.refreshContent(options);
  }

  // 清除缓存
  async clearCache(platform?: Platform): Promise<void> {
    const keysToRemove: string[] = [];

    if (platform) {
      keysToRemove.push(`onlyfocus_${platform}_content_latest`);
      keysToRemove.push(`onlyfocus_${platform}_followed_users`);
    } else {
      keysToRemove.push('onlyfocus_content_latest');
      keysToRemove.push('onlyfocus_followed_users');
    }

    for (const key of keysToRemove) {
      await StorageManager.removeCache(key);
    }

    this.log(`已清除缓存: ${keysToRemove.join(', ')}`, 'info');
    this.emit('cacheCleared', { platform, keys: keysToRemove });
  }

  // 事件监听
  on(event: string, listener: Function): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(listener);
  }

  // 移除事件监听
  off(event: string, listener: Function): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  // 触发事件
  private emit(event: string, data?: any): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(data);
        } catch (error) {
          this.log(`事件监听器执行失败 (${event}): ${error}`, 'error');
        }
      });
    }
  }

  // 日志工具
  private log(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info'): void {
    if (!DEBUG_CONFIG.enabled) return;

    const timestamp = new Date().toLocaleTimeString();
    const prefix = `${DEBUG_CONFIG.prefix} [ContentEngine]`;
    const color = DEBUG_CONFIG.colors[type];

    console.log(`%c${prefix} [${timestamp}] ${message}`, `color: ${color}`);
  }

  // 销毁引擎
  destroy(): void {
    this.stop();
    this.eventListeners.clear();
    ContentEngine.instance = null as any;
  }
}

// 导出单例实例
export const contentEngine = ContentEngine.getInstance();
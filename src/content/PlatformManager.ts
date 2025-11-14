import type { Platform, PlatformAdapter, ContentItem } from '../shared/types';
import { BilibiliAdapter } from './platforms/bilibili';
import { YouTubeAdapter } from './platforms/youtube';
import { TwitterAdapter } from './platforms/twitter';
import { InstagramAdapter } from './platforms/instagram';
import { PLATFORM_DETECTION } from '../shared/constants';

export class PlatformManager {
  private static instance: PlatformManager;
  private adapters: Map<Platform, PlatformAdapter> = new Map();
  private currentPlatform: Platform | null = null;

  private constructor() {
    this.initializeAdapters();
  }

  static getInstance(): PlatformManager {
    if (!PlatformManager.instance) {
      PlatformManager.instance = new PlatformManager();
    }
    return PlatformManager.instance;
  }

  // 初始化所有适配器
  private initializeAdapters(): void {
    this.adapters.set('bilibili', new BilibiliAdapter());
    this.adapters.set('youtube', new YouTubeAdapter());
    this.adapters.set('twitter', new TwitterAdapter());
    this.adapters.set('instagram', new InstagramAdapter());
  }

  // 检测当前平台
  detectCurrentPlatform(): Platform | null {
    const url = window.location.href;
    const hostname = window.location.hostname;

    for (const [platform, config] of Object.entries(PLATFORM_DETECTION)) {
      if (config.match.test(url) || config.match.test(hostname)) {
        // 额外检查平台特定元素
        if (config.test()) {
          this.currentPlatform = platform as Platform;
          console.log(`[PlatformManager] 检测到平台: ${platform}`);
          return this.currentPlatform;
        }
      }
    }

    this.currentPlatform = null;
    console.log('[PlatformManager] 未检测到支持的平台');
    return null;
  }

  // 获取当前平台
  getCurrentPlatform(): Platform | null {
    return this.currentPlatform;
  }

  // 获取当前平台适配器
  getCurrentAdapter(): PlatformAdapter | null {
    if (!this.currentPlatform) {
      return null;
    }
    return this.adapters.get(this.currentPlatform) || null;
  }

  // 获取指定平台适配器
  getAdapter(platform: Platform): PlatformAdapter | null {
    return this.adapters.get(platform) || null;
  }

  // 获取所有适配器
  getAllAdapters(): Map<Platform, PlatformAdapter> {
    return new Map(this.adapters);
  }

  // 检查平台是否支持
  isPlatformSupported(platform: Platform): boolean {
    return this.adapters.has(platform);
  }

  // 检查当前页面是否支持
  isCurrentPageSupported(): boolean {
    const platform = this.detectCurrentPlatform();
    return platform !== null;
  }

  // 获取关注用户列表
  async getFollowedUsers(platform?: Platform): Promise<any[]> {
    const adapter = platform ? this.getAdapter(platform) : this.getCurrentAdapter();

    if (!adapter) {
      throw new Error(`未找到平台适配器: ${platform || this.currentPlatform}`);
    }

    return await adapter.getFollowedUsers();
  }

  // 获取用户内容
  async getUserContent(userId: string, platform?: Platform, limit?: number): Promise<ContentItem[]> {
    const adapter = platform ? this.getAdapter(platform) : this.getCurrentAdapter();

    if (!adapter) {
      throw new Error(`未找到平台适配器: ${platform || this.currentPlatform}`);
    }

    return await adapter.getUserContent(userId, limit);
  }

  // 获取随机内容
  async getRandomContent(platform?: Platform): Promise<ContentItem[]> {
    const adapter = platform ? this.getAdapter(platform) : this.getCurrentAdapter();

    if (!adapter) {
      throw new Error(`未找到平台适配器: ${platform || this.currentPlatform}`);
    }

    // 对于Bilibili，有专门的getRandomContent方法
    if (adapter instanceof BilibiliAdapter) {
      return await adapter.getRandomContent();
    }

    // 对于其他平台，先获取关注用户，再获取内容
    const followedUsers = await adapter.getFollowedUsers();
    if (followedUsers.length === 0) {
      return [];
    }

    // 随机选择一些用户
    const shuffledUsers = [...followedUsers].sort(() => Math.random() - 0.5);
    const selectedUsers = shuffledUsers.slice(0, 10); // 最多选择10个用户

    const allContent: ContentItem[] = [];

    for (const user of selectedUsers) {
      try {
        const content = await adapter.getUserContent(user.platformId, 2);
        allContent.push(...content);
      } catch (error) {
        console.error(`获取用户 ${user.displayName} 的内容失败:`, error);
      }
    }

    // 随机打乱内容
    return allContent.sort(() => Math.random() - 0.5);
  }

  // 替换页面内容
  async replaceContent(content: ContentItem[], platform?: Platform): Promise<void> {
    const adapter = platform ? this.getAdapter(platform) : this.getCurrentAdapter();

    if (!adapter) {
      throw new Error(`未找到平台适配器: ${platform || this.currentPlatform}`);
    }

    await adapter.replaceContent(content);
  }

  // 检测内容区域
  detectContentArea(platform?: Platform): Element | null {
    const adapter = platform ? this.getAdapter(platform) : this.getCurrentAdapter();

    if (!adapter) {
      return null;
    }

    return adapter.detectContentArea();
  }

  // 获取平台信息
  getPlatformInfo(platform?: Platform): any {
    const adapter = platform ? this.getAdapter(platform) : this.getCurrentAdapter();

    if (!adapter || !('getPlatformInfo' in adapter)) {
      return null;
    }

    return (adapter as any).getPlatformInfo();
  }

  // 刷新当前平台
  refresh(): void {
    this.currentPlatform = null;
    this.detectCurrentPlatform();
  }

  // 监听页面变化
  onPageChange(callback: (platform: Platform | null) => void): void {
    let lastUrl = window.location.href;
    let lastPlatform = this.currentPlatform;

    // 监听历史记录变化
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function(...args) {
      originalPushState.apply(history, args);
      setTimeout(() => checkPageChange(), 100);
    };

    history.replaceState = function(...args) {
      originalReplaceState.apply(history, args);
      setTimeout(() => checkPageChange(), 100);
    };

    // 监听popstate事件
    window.addEventListener('popstate', () => {
      setTimeout(() => checkPageChange(), 100);
    });

    // 监听hashchange事件
    window.addEventListener('hashchange', () => {
      setTimeout(() => checkPageChange(), 100);
    });

    const checkPageChange = () => {
      const currentUrl = window.location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        const currentPlatform = this.detectCurrentPlatform();

        if (currentPlatform !== lastPlatform) {
          lastPlatform = currentPlatform;
          callback(currentPlatform);
        }
      }
    };

    // 监听DOM变化（SPA页面可能不会触发URL变化）
    const observer = new MutationObserver(() => {
      setTimeout(checkPageChange, 500);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  // 销毁管理器
  destroy(): void {
    this.adapters.clear();
    this.currentPlatform = null;
  }
}

// 导出单例实例
export const platformManager = PlatformManager.getInstance();
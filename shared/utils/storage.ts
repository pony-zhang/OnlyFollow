import type { CacheItem, UserConfig } from '../types';
import { STORAGE_KEYS, CACHE_CONFIG, DEFAULT_CONFIG } from '../constants';

// Chrome存储工具
export class StorageManager {
  // 获取配置
  static async getConfig(): Promise<UserConfig> {
    try {
      const result = await chrome.storage.sync.get(STORAGE_KEYS.CONFIG);
      return result[STORAGE_KEYS.CONFIG] || { ...DEFAULT_CONFIG };
    } catch (error) {
      console.error('获取配置失败:', error);
      return { ...DEFAULT_CONFIG };
    }
  }

  // 设置配置
  static async setConfig(config: Partial<UserConfig>): Promise<void> {
    try {
      const currentConfig = await this.getConfig();
      const newConfig = { ...currentConfig, ...config };
      await chrome.storage.sync.set({
        [STORAGE_KEYS.CONFIG]: newConfig,
      });
    } catch (error) {
      console.error('设置配置失败:', error);
      throw error;
    }
  }

  // 获取缓存项
  static async getCache<T>(key: string): Promise<T | null> {
    try {
      const result = await chrome.storage.local.get(key);
      const cacheItem = result[key] as CacheItem<T>;

      if (!cacheItem) return null;

      // 检查是否过期
      if (Date.now() > cacheItem.expiresAt) {
        await this.removeCache(key);
        return null;
      }

      return cacheItem.data;
    } catch (error) {
      console.error('获取缓存失败:', error);
      return null;
    }
  }

  // 设置缓存项
  static async setCache<T>(
    key: string,
    data: T,
    ttl: number = CACHE_CONFIG.CONTENT
  ): Promise<void> {
    try {
      const cacheItem: CacheItem<T> = {
        id: key,
        data,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        expiresAt: Date.now() + ttl,
        platform: this.extractPlatformFromKey(key),
      };

      await chrome.storage.local.set({ [key]: cacheItem });

      // 清理过期缓存
      await this.cleanExpiredCache();
    } catch (error) {
      console.error('设置缓存失败:', error);
      throw error;
    }
  }

  // 删除缓存项
  static async removeCache(key: string): Promise<void> {
    try {
      await chrome.storage.local.remove(key);
    } catch (error) {
      console.error('删除缓存失败:', error);
    }
  }

  // 清理过期缓存
  static async cleanExpiredCache(): Promise<void> {
    try {
      const allItems = await chrome.storage.local.get();
      const keysToRemove: string[] = [];

      Object.entries(allItems).forEach(([key, value]) => {
        if (key.startsWith('onlyfocus_') && typeof value === 'object' && value !== null) {
          const cacheItem = value as CacheItem;
          if (Date.now() > cacheItem.expiresAt) {
            keysToRemove.push(key);
          }
        }
      });

      if (keysToRemove.length > 0) {
        await chrome.storage.local.remove(keysToRemove);
      }
    } catch (error) {
      console.error('清理过期缓存失败:', error);
    }
  }

  // 清空所有缓存
  static async clearAllCache(): Promise<void> {
    try {
      const allItems = await chrome.storage.local.get();
      const keysToRemove = Object.keys(allItems).filter(key => key.startsWith('onlyfocus_'));

      if (keysToRemove.length > 0) {
        await chrome.storage.local.remove(keysToRemove);
      }
    } catch (error) {
      console.error('清空缓存失败:', error);
      throw error;
    }
  }

  // 获取缓存统计信息
  static async getCacheStats(): Promise<Record<string, number>> {
    try {
      const allItems = await chrome.storage.local.get();
      const stats: Record<string, number> = {};

      Object.entries(allItems).forEach(([key, value]) => {
        if (key.startsWith('onlyfocus_') && typeof value === 'object' && value !== null) {
          const cacheItem = value as CacheItem;
          const platform = cacheItem.platform;
          stats[platform] = (stats[platform] || 0) + 1;
        }
      });

      return stats;
    } catch (error) {
      console.error('获取缓存统计失败:', error);
      return {};
    }
  }

  // 从键名提取平台信息
  private static extractPlatformFromKey(key: string): any {
    const platformMatch = key.match(/onlyfocus_(\w+)_/);
    return platformMatch ? platformMatch[1] : 'unknown';
  }

  // 检查存储空间
  static async getStorageUsage(): Promise<{ used: number; available: number; percentage: number }> {
    try {
      const usage = await chrome.storage.local.getBytesInUse();
      const quota = 5242880; // 5MB 限制

      return {
        used: usage,
        available: quota - usage,
        percentage: (usage / quota) * 100,
      };
    } catch (error) {
      console.error('获取存储使用情况失败:', error);
      return { used: 0, available: 0, percentage: 0 };
    }
  }
}

// 本地存储工具（用于开发时临时存储）
export class LocalStorageManager {
  static getItem<T>(key: string): T | null {
    try {
      const item = localStorage.getItem(key);
      if (!item) return null;

      const parsed = JSON.parse(item);
      if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
        localStorage.removeItem(key);
        return null;
      }

      return parsed.data;
    } catch {
      return null;
    }
  }

  static setItem<T>(key: string, data: T, ttl?: number): void {
    try {
      const item = {
        data,
        expiresAt: ttl ? Date.now() + ttl : null,
      };
      localStorage.setItem(key, JSON.stringify(item));
    } catch (error) {
      console.error('设置本地存储失败:', error);
    }
  }

  static removeItem(key: string): void {
    localStorage.removeItem(key);
  }

  static clear(): void {
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('onlyfocus_')) {
        localStorage.removeItem(key);
      }
    });
  }
}
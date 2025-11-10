import type { CacheItem, UserConfig, Platform, PlatformConfig } from "../types";
import { STORAGE_KEYS, CACHE_CONFIG, DEFAULT_CONFIG } from "../constants";

// Chrome存储工具
export class StorageManager {
  // 获取配置
  static async getConfig(): Promise<UserConfig> {
    try {
      const result = await chrome.storage.sync.get(STORAGE_KEYS.CONFIG);
      const savedConfig = result[STORAGE_KEYS.CONFIG];

      if (!savedConfig) {
        return { ...DEFAULT_CONFIG };
      }

      // 检查是否需要迁移配置（兼容旧版本）
      if (this.isLegacyConfig(savedConfig)) {
        // 检查是否已经迁移过（避免重复迁移）
        const migrationKey = `${STORAGE_KEYS.CONFIG}_migrated_v2`;
        const migrationResult = await chrome.storage.sync.get(migrationKey);

        if (migrationResult[migrationKey]) {
          console.log("[StorageManager] 配置已迁移过，跳过迁移步骤");
          // 如果配置结构已经是新的，直接返回；否则进行合并
          if ((savedConfig as any).platformSettings) {
            return this.mergeWithDefaults(savedConfig);
          } else {
            // 特殊情况：有迁移标记但配置结构还是旧的，直接进行迁移
            console.log(
              "[StorageManager] 特殊情况：有迁移标记但配置结构异常，重新迁移",
            );
            const migratedConfig = this.migrateLegacyConfig(savedConfig);
            return migratedConfig;
          }
        }

        console.log("[StorageManager] 检测到旧版本配置，正在迁移...");
        const migratedConfig = this.migrateLegacyConfig(savedConfig);

        // 直接保存到Chrome存储，避免触发ConfigManager的setConfig流程
        await chrome.storage.sync.set({
          [STORAGE_KEYS.CONFIG]: migratedConfig,
          [migrationKey]: true, // 标记已迁移
        });

        console.log("[StorageManager] 配置迁移完成并已保存");
        return migratedConfig;
      }

      // 合并新配置项（确保新增字段有默认值）
      return this.mergeWithDefaults(savedConfig);
    } catch (error) {
      console.error("获取配置失败:", error);
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
      console.error("设置配置失败:", error);
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
      console.error("获取缓存失败:", error);
      return null;
    }
  }

  // 设置缓存项
  static async setCache<T>(
    key: string,
    data: T,
    ttl: number = CACHE_CONFIG.CONTENT,
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
      console.error("设置缓存失败:", error);
      throw error;
    }
  }

  // 删除缓存项
  static async removeCache(key: string): Promise<void> {
    try {
      await chrome.storage.local.remove(key);
    } catch (error) {
      console.error("删除缓存失败:", error);
    }
  }

  // 清理过期缓存
  static async cleanExpiredCache(): Promise<void> {
    try {
      const allItems = await chrome.storage.local.get();
      const keysToRemove: string[] = [];

      Object.entries(allItems).forEach(([key, value]) => {
        if (
          key.startsWith("onlyfollow_") &&
          typeof value === "object" &&
          value !== null
        ) {
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
      console.error("清理过期缓存失败:", error);
    }
  }

  // 清空所有缓存
  static async clearAllCache(): Promise<void> {
    try {
      const allItems = await chrome.storage.local.get();
      const keysToRemove = Object.keys(allItems).filter((key) =>
        key.startsWith("onlyfollow_"),
      );

      if (keysToRemove.length > 0) {
        await chrome.storage.local.remove(keysToRemove);
      }
    } catch (error) {
      console.error("清空缓存失败:", error);
      throw error;
    }
  }

  // 获取缓存统计信息
  static async getCacheStats(): Promise<Record<string, number>> {
    try {
      const allItems = await chrome.storage.local.get();
      const stats: Record<string, number> = {};

      Object.entries(allItems).forEach(([key, value]) => {
        if (
          key.startsWith("onlyfollow_") &&
          typeof value === "object" &&
          value !== null
        ) {
          const cacheItem = value as CacheItem;
          const platform = cacheItem.platform;
          stats[platform] = (stats[platform] || 0) + 1;
        }
      });

      return stats;
    } catch (error) {
      console.error("获取缓存统计失败:", error);
      return {};
    }
  }

  // 从键名提取平台信息
  private static extractPlatformFromKey(key: string): any {
    const platformMatch = key.match(/onlyfollow_(\w+)_/);
    return platformMatch ? platformMatch[1] : "unknown";
  }

  // 检查存储空间
  static async getStorageUsage(): Promise<{
    used: number;
    available: number;
    percentage: number;
  }> {
    try {
      const usage = await chrome.storage.local.getBytesInUse();
      const quota = 5242880; // 5MB 限制

      return {
        used: usage,
        available: quota - usage,
        percentage: (usage / quota) * 100,
      };
    } catch (error) {
      console.error("获取存储使用情况失败:", error);
      return { used: 0, available: 0, percentage: 0 };
    }
  }

  // 检查是否为旧版本配置
  private static isLegacyConfig(config: any): boolean {
    // 旧版本配置有 contentSettings 字段，但没有 platformSettings 字段
    const hasOldContentSettings = !!(config as any).contentSettings;
    const hasNewPlatformSettings = !!(config as any).platformSettings;

    // 只有当有旧格式且没有新格式时才认为是旧版本配置
    return hasOldContentSettings && !hasNewPlatformSettings;
  }

  // 迁移旧版本配置
  private static migrateLegacyConfig(legacyConfig: any): UserConfig {
    const {
      contentSettings = {},
      uiSettings = {},
      enabledPlatforms = [],
    } = legacyConfig;

    // 提取全局设置
    const globalSettings = {
      refreshInterval: contentSettings.refreshInterval || 30 * 60 * 1000,
      shuffleEnabled: contentSettings.shuffleEnabled ?? true,
      maxItemsPerPlatform: contentSettings.maxItems || 20,
    };

    // 为每个平台创建配置
    const platformSettings: Record<string, any> = {};
    const allPlatforms: Platform[] = [
      "bilibili",
      "youtube",
      "twitter",
      "instagram",
    ];

    allPlatforms.forEach((platform) => {
      const isPlatformEnabled = enabledPlatforms.includes(platform);

      // 根据平台特性设置不同的默认值
      if (platform === "bilibili") {
        platformSettings[platform] = {
          enabled: isPlatformEnabled,
          requestDelay: contentSettings.requestDelay || 5000,
          concurrentRequests: false, // B站强制关闭并发
          concurrentLimit: 1,
          maxItems: contentSettings.maxItems || 20,
          customSettings: {
            safeMode: true,
          },
        };
      } else if (platform === "youtube") {
        platformSettings[platform] = {
          enabled: isPlatformEnabled,
          requestDelay: 1000,
          concurrentRequests: true,
          concurrentLimit: 3,
          maxItems: 30,
          customSettings: {},
        };
      } else if (platform === "twitter") {
        platformSettings[platform] = {
          enabled: isPlatformEnabled,
          requestDelay: 2000,
          concurrentRequests: false,
          concurrentLimit: 2,
          maxItems: 25,
          customSettings: {},
        };
      } else if (platform === "instagram") {
        platformSettings[platform] = {
          enabled: isPlatformEnabled,
          requestDelay: 3000,
          concurrentRequests: false,
          concurrentLimit: 1,
          maxItems: 15,
          customSettings: {},
        };
      }
    });

    const migratedConfig: UserConfig = {
      enabledPlatforms,
      globalSettings,
      platformSettings: platformSettings as any,
      uiSettings: {
        showNotifications: uiSettings.showNotifications ?? true,
        theme: uiSettings.theme || "auto",
      },
    };

    console.log("[StorageManager] 配置迁移完成:", migratedConfig);
    return migratedConfig;
  }

  // 合并配置与默认值
  private static mergeWithDefaults(config: Partial<UserConfig>): UserConfig {
    const merged: UserConfig = {
      enabledPlatforms:
        config.enabledPlatforms || DEFAULT_CONFIG.enabledPlatforms,
      globalSettings: {
        ...DEFAULT_CONFIG.globalSettings,
        ...config.globalSettings,
      },
      platformSettings: { ...DEFAULT_CONFIG.platformSettings },
      uiSettings: {
        ...DEFAULT_CONFIG.uiSettings,
        ...config.uiSettings,
      },
    };

    // 合并平台设置
    if (config.platformSettings) {
      Object.keys(config.platformSettings).forEach((platform) => {
        if (DEFAULT_CONFIG.platformSettings[platform as Platform]) {
          merged.platformSettings[platform as Platform] = {
            ...DEFAULT_CONFIG.platformSettings[platform as Platform],
            ...config.platformSettings![platform as Platform],
            customSettings: {
              ...DEFAULT_CONFIG.platformSettings[platform as Platform]
                .customSettings,
              ...config.platformSettings![platform as Platform]?.customSettings,
            },
          };
        }
      });
    }

    return merged;
  }

  // 清理迁移相关的临时数据
  static async cleanupMigrationData(): Promise<void> {
    try {
      const keysToRemove = [
        `${STORAGE_KEYS.CONFIG}_migrated_v2`,
        // 可以添加其他需要清理的临时键
      ];

      await chrome.storage.sync.remove(keysToRemove);
      console.log("[StorageManager] 迁移数据清理完成");
    } catch (error) {
      console.error("[StorageManager] 清理迁移数据失败:", error);
    }
  }

  // 强制重新迁移配置（用于调试）
  static async forceRemigration(): Promise<void> {
    try {
      console.log("[StorageManager] 强制重新迁移配置...");

      // 删除迁移标记
      await chrome.storage.sync.remove(`${STORAGE_KEYS.CONFIG}_migrated_v2`);

      // 获取当前配置
      const result = await chrome.storage.sync.get(STORAGE_KEYS.CONFIG);
      const currentConfig = result[STORAGE_KEYS.CONFIG];

      if (currentConfig && (currentConfig as any).contentSettings) {
        // 检测到旧格式配置，强制迁移
        console.log("[StorageManager] 检测到旧格式配置，执行强制迁移...");

        // 删除旧配置
        await chrome.storage.sync.remove(STORAGE_KEYS.CONFIG);

        // 重新迁移会在下次getConfig时自动触发
        console.log("[StorageManager] 旧配置已删除，下次加载时将自动迁移");
      } else {
        console.log("[StorageManager] 配置已是新格式，无需迁移");
      }
    } catch (error) {
      console.error("[StorageManager] 强制重新迁移失败:", error);
      throw error;
    }
  }

  // 删除指定用户及其相关数据
  static async deleteUser(userId: string, platform?: Platform): Promise<void> {
    try {
      const keysToRemove: string[] = [];
      const allItems = await chrome.storage.local.get();

      // 查找与用户相关的缓存键
      for (const key of Object.keys(allItems)) {
        if (key.startsWith("onlyfollow_")) {
          // 删除用户的视频内容缓存
          if (key.includes("_videos_") && key.includes(userId)) {
            keysToRemove.push(key);
          }
          // 删除用户关注关系缓存中包含该用户的条目
          else if (key.includes("_followings_")) {
            try {
              const followingsData = allItems[key];
              if (
                followingsData &&
                followingsData.data &&
                Array.isArray(followingsData.data)
              ) {
                const filteredFollowings = followingsData.data.filter(
                  (user: any) => user.id !== userId,
                );
                if (filteredFollowings.length !== followingsData.data.length) {
                  // 更新关注列表，移除该用户
                  followingsData.data = filteredFollowings;
                  followingsData.updatedAt = Date.now();
                  await chrome.storage.local.set({ [key]: followingsData });
                  console.log(
                    `[StorageManager] 已从关注列表 ${key} 中移除用户 ${userId}`,
                  );
                }
              }
            } catch (error) {
              console.error(
                `[StorageManager] 处理关注列表 ${key} 时出错:`,
                error,
              );
            }
          }
        }
      }

      // 如果指定了平台，也删除该平台的相关缓存（仅限该用户）
      if (platform) {
        const platformKeys = Object.keys(allItems).filter(
          (key) =>
            key.startsWith(`onlyfollow_${platform}_`) &&
            (key.includes(userId) ||
              (key.includes("_videos_") && key.includes(userId))),
        );
        keysToRemove.push(...platformKeys);
      }

      // 删除找到的键
      if (keysToRemove.length > 0) {
        await chrome.storage.local.remove(keysToRemove);
        console.log(
          `[StorageManager] 已删除用户 ${userId} 的相关数据:`,
          keysToRemove,
        );
      }

      console.log(`[StorageManager] 用户 ${userId} 删除完成`);
    } catch (error) {
      console.error(`[StorageManager] 删除用户 ${userId} 失败:`, error);
      throw error;
    }
  }

  // 获取用户相关的所有缓存键
  static async getUserCacheKeys(userId: string): Promise<string[]> {
    try {
      const allItems = await chrome.storage.local.get();
      const userKeys: string[] = [];

      Object.keys(allItems).forEach((key) => {
        if (key.startsWith("onlyfollow_")) {
          // 查找包含用户ID的视频缓存键
          if (key.includes("_videos_") && key.includes(userId)) {
            userKeys.push(key);
          }
          // 查找可能包含该用户的关注缓存键
          else if (key.includes("_followings_")) {
            try {
              const followingsData = allItems[key];
              if (
                followingsData &&
                followingsData.data &&
                Array.isArray(followingsData.data)
              ) {
                const hasUser = followingsData.data.some(
                  (user: any) => user.id === userId,
                );
                if (hasUser) {
                  userKeys.push(key);
                }
              }
            } catch (error) {
              console.error(
                `[StorageManager] 检查关注列表 ${key} 时出错:`,
                error,
              );
            }
          }
        }
      });

      return userKeys;
    } catch (error) {
      console.error(`[StorageManager] 获取用户 ${userId} 缓存键失败:`, error);
      return [];
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
      console.error("设置本地存储失败:", error);
    }
  }

  static removeItem(key: string): void {
    localStorage.removeItem(key);
  }

  static clear(): void {
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith("onlyfollow_")) {
        localStorage.removeItem(key);
      }
    });
  }
}

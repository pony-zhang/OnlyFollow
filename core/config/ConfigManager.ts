import type { UserConfig, Platform } from '../../shared/types';
import { StorageManager } from '../../shared/utils/storage';
import { DEFAULT_CONFIG, STORAGE_KEYS } from '../../shared/constants';

export class ConfigManager {
  private static instance: ConfigManager;
  private config: UserConfig | null = null;
  private listeners: Array<(config: UserConfig) => void> = [];

  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  private constructor() {
    this.loadConfig();
  }

  // 加载配置
  private async loadConfig(): Promise<void> {
    try {
      this.config = await StorageManager.getConfig();
      this.notifyListeners();
    } catch (error) {
      console.error('加载配置失败:', error);
      this.config = { ...DEFAULT_CONFIG };
    }
  }

  // 获取配置
  async getConfig(): Promise<UserConfig> {
    if (!this.config) {
      await this.loadConfig();
    }
    return { ...this.config! };
  }

  // 更新配置
  async updateConfig(updates: Partial<UserConfig>): Promise<void> {
    try {
      const currentConfig = await this.getConfig();
      const newConfig = { ...currentConfig, ...updates };

      await StorageManager.setConfig(updates);
      this.config = newConfig;
      this.notifyListeners();

      console.log('配置已更新:', updates);
    } catch (error) {
      console.error('更新配置失败:', error);
      throw error;
    }
  }

  // 重置配置
  async resetConfig(): Promise<void> {
    try {
      await StorageManager.setConfig(DEFAULT_CONFIG);
      this.config = { ...DEFAULT_CONFIG };
      this.notifyListeners();

      console.log('配置已重置为默认值');
    } catch (error) {
      console.error('重置配置失败:', error);
      throw error;
    }
  }

  // 启用平台
  async enablePlatform(platform: Platform): Promise<void> {
    const config = await this.getConfig();
    if (!config.enabledPlatforms.includes(platform)) {
      await this.updateConfig({
        enabledPlatforms: [...config.enabledPlatforms, platform],
      });
    }
  }

  // 禁用平台
  async disablePlatform(platform: Platform): Promise<void> {
    const config = await this.getConfig();
    const newPlatforms = config.enabledPlatforms.filter(p => p !== platform);
    await this.updateConfig({
      enabledPlatforms: newPlatforms,
    });
  }

  // 检查平台是否启用
  async isPlatformEnabled(platform: Platform): Promise<boolean> {
    const config = await this.getConfig();
    return config.enabledPlatforms.includes(platform);
  }

  // 更新内容设置
  async updateContentSettings(settings: Partial<UserConfig['contentSettings']>): Promise<void> {
    const config = await this.getConfig();
    await this.updateConfig({
      contentSettings: { ...config.contentSettings, ...settings },
    });
  }

  // 更新UI设置
  async updateUISettings(settings: Partial<UserConfig['uiSettings']>): Promise<void> {
    const config = await this.getConfig();
    await this.updateConfig({
      uiSettings: { ...config.uiSettings, ...settings },
    });
  }

  // 添加配置监听器
  addListener(listener: (config: UserConfig) => void): void {
    this.listeners.push(listener);
  }

  // 移除配置监听器
  removeListener(listener: (config: UserConfig) => void): void {
    const index = this.listeners.indexOf(listener);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  // 通知监听器
  private notifyListeners(): void {
    if (this.config) {
      this.listeners.forEach(listener => {
        try {
          listener({ ...this.config });
        } catch (error) {
          console.error('配置监听器执行失败:', error);
        }
      });
    }
  }

  // 验证配置有效性
  private validateConfig(config: Partial<UserConfig>): boolean {
    // 验证平台配置
    if (config.enabledPlatforms) {
      const validPlatforms: Platform[] = ['bilibili', 'youtube', 'twitter', 'instagram'];
      const invalidPlatforms = config.enabledPlatforms.filter(p => !validPlatforms.includes(p));
      if (invalidPlatforms.length > 0) {
        console.warn('无效的平台配置:', invalidPlatforms);
        return false;
      }
    }

    // 验证内容设置
    if (config.contentSettings) {
      const { maxItems, refreshInterval } = config.contentSettings;
      if (maxItems !== undefined && (maxItems < 1 || maxItems > 100)) {
        console.warn('maxItems 应该在 1-100 之间');
        return false;
      }
      if (refreshInterval !== undefined && refreshInterval < 60000) { // 最小1分钟
        console.warn('refreshInterval 最小为 60000ms (1分钟)');
        return false;
      }
    }

    return true;
  }

  // 导出配置
  async exportConfig(): Promise<string> {
    const config = await this.getConfig();
    return JSON.stringify(config, null, 2);
  }

  // 导入配置
  async importConfig(configJson: string): Promise<void> {
    try {
      const config = JSON.parse(configJson) as Partial<UserConfig>;

      if (!this.validateConfig(config)) {
        throw new Error('配置格式无效');
      }

      await this.updateConfig(config);
      console.log('配置导入成功');
    } catch (error) {
      console.error('导入配置失败:', error);
      throw error;
    }
  }

  // 获取配置统计信息
  async getConfigStats(): Promise<Record<string, any>> {
    const config = await this.getConfig();
    const storageUsage = await StorageManager.getStorageUsage();

    return {
      enabledPlatformsCount: config.enabledPlatforms.length,
      maxItems: config.contentSettings.maxItems,
      refreshInterval: config.contentSettings.refreshInterval,
      shuffleEnabled: config.contentSettings.shuffleEnabled,
      theme: config.uiSettings.theme,
      showNotifications: config.uiSettings.showNotifications,
      storageUsage,
    };
  }
}

// 导出单例实例
export const configManager = ConfigManager.getInstance();
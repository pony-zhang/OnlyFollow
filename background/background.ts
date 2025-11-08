import { contentEngine } from '../core/content/ContentEngine';
import { configManager } from '../core/config/ConfigManager';
import { StorageManager } from '../shared/utils/storage';
import { ChromeExtensionApi } from '../shared/utils/api';
import { DEBUG_CONFIG } from '../shared/constants';

/**
 * 后台脚本（Service Worker）
 * 负责扩展的后台逻辑、消息处理和数据管理
 */

class BackgroundService {
  private isInitialized: boolean = false;

  constructor() {
    this.initialize();
  }

  // 初始化后台服务
  private async initialize(): Promise<void> {
    try {
      this.log('初始化后台服务...');

      // 设置消息监听器
      this.setupMessageListeners();

      // 设置事件监听器
      this.setupEventListeners();

      // 初始化配置管理器
      await this.initializeConfig();

      // 初始化内容引擎
      await this.initializeContentEngine();

      // 执行启动任务
      await this.performStartupTasks();

      this.isInitialized = true;
      this.log('后台服务初始化完成', 'success');
    } catch (error) {
      this.log(`后台服务初始化失败: ${error}`, 'error');
    }
  }

  // 设置消息监听器
  private setupMessageListeners(): void {
    // 获取配置
    ChromeExtensionApi.onMessage('getConfig', async () => {
      try {
        return await configManager.getConfig();
      } catch (error) {
        this.log(`获取配置失败: ${error}`, 'error');
        throw error;
      }
    });

    // 设置配置
    ChromeExtensionApi.onMessage('setConfig', async (data) => {
      try {
        await configManager.updateConfig(data);
        return { success: true };
      } catch (error) {
        this.log(`设置配置失败: ${error}`, 'error');
        throw error;
      }
    });

    // 重置配置
    ChromeExtensionApi.onMessage('resetConfig', async () => {
      try {
        await configManager.resetConfig();
        return { success: true };
      } catch (error) {
        this.log(`重置配置失败: ${error}`, 'error');
        throw error;
      }
    });

    // 启动内容引擎
    ChromeExtensionApi.onMessage('startContentEngine', async (data) => {
      try {
        await contentEngine.start(data);
        return { success: true };
      } catch (error) {
        this.log(`启动内容引擎失败: ${error}`, 'error');
        throw error;
      }
    });

    // 停止内容引擎
    ChromeExtensionApi.onMessage('stopContentEngine', async () => {
      try {
        contentEngine.stop();
        return { success: true };
      } catch (error) {
        this.log(`停止内容引擎失败: ${error}`, 'error');
        throw error;
      }
    });

    // 获取引擎状态
    ChromeExtensionApi.onMessage('getEngineStatus', async () => {
      try {
        return contentEngine.getStatus();
      } catch (error) {
        this.log(`获取引擎状态失败: ${error}`, 'error');
        throw error;
      }
    });

    // 手动刷新内容
    ChromeExtensionApi.onMessage('refreshContent', async (data) => {
      try {
        const content = await contentEngine.manualRefresh(data);
        return { success: true, content };
      } catch (error) {
        this.log(`手动刷新内容失败: ${error}`, 'error');
        throw error;
      }
    });

    // 获取关注用户
    ChromeExtensionApi.onMessage('getFollowedUsers', async (data) => {
      try {
        const users = await contentEngine.getFollowedUsers(data?.platform);
        return users;
      } catch (error) {
        this.log(`获取关注用户失败: ${error}`, 'error');
        throw error;
      }
    });

    // 获取缓存内容
    ChromeExtensionApi.onMessage('getCachedContent', async (data) => {
      try {
        const content = await contentEngine.getCachedContent(data?.platform);
        return content;
      } catch (error) {
        this.log(`获取缓存内容失败: ${error}`, 'error');
        throw error;
      }
    });

    // 清除缓存
    ChromeExtensionApi.onMessage('clearCache', async (data) => {
      try {
        await contentEngine.clearCache(data?.platform);
        return { success: true };
      } catch (error) {
        this.log(`清除缓存失败: ${error}`, 'error');
        throw error;
      }
    });

    // 获取缓存统计
    ChromeExtensionApi.onMessage('getCacheStats', async () => {
      try {
        const stats = await StorageManager.getCacheStats();
        const storageUsage = await StorageManager.getStorageUsage();
        return { stats, storageUsage };
      } catch (error) {
        this.log(`获取缓存统计失败: ${error}`, 'error');
        throw error;
      }
    });

    // 导出配置
    ChromeExtensionApi.onMessage('exportConfig', async () => {
      try {
        return await configManager.exportConfig();
      } catch (error) {
        this.log(`导出配置失败: ${error}`, 'error');
        throw error;
      }
    });

    // 导入配置
    ChromeExtensionApi.onMessage('importConfig', async (data) => {
      try {
        await configManager.importConfig(data);
        return { success: true };
      } catch (error) {
        this.log(`导入配置失败: ${error}`, 'error');
        throw error;
      }
    });

    // 获取配置统计
    ChromeExtensionApi.onMessage('getConfigStats', async () => {
      try {
        return await configManager.getConfigStats();
      } catch (error) {
        this.log(`获取配置统计失败: ${error}`, 'error');
        throw error;
      }
    });

    // 打开选项页
    ChromeExtensionApi.onMessage('openOptions', async () => {
      try {
        ChromeExtensionApi.openOptionsPage();
        return { success: true };
      } catch (error) {
        this.log(`打开选项页失败: ${error}`, 'error');
        throw error;
      }
    });
  }

  // 设置事件监听器
  private setupEventListeners(): void {
    // 扩展安装事件
    chrome.runtime.onInstalled.addListener(async (details) => {
      if (details.reason === 'install') {
        this.log('扩展首次安装');
        await this.handleFirstInstall();
      } else if (details.reason === 'update') {
        this.log(`扩展更新到版本 ${chrome.runtime.getManifest().version}`);
        await this.handleUpdate(details.previousVersion);
      }
    });

    // 扩展启动事件
    chrome.runtime.onStartup.addListener(async () => {
      this.log('扩展启动');
      await this.handleStartup();
    });

    // 标签页更新事件
    chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.url) {
        await this.handleTabUpdate(tabId, tab.url);
      }
    });

    // 标签页激活事件
    chrome.tabs.onActivated.addListener(async (activeInfo) => {
      await this.handleTabActivated(activeInfo.tabId);
    });

    // 内容引擎事件
    contentEngine.on('engineStarted', (data) => {
      this.log('内容引擎已启动', 'success');
      this.notifyContentEngineChange('started', data);
    });

    contentEngine.on('engineStopped', () => {
      this.log('内容引擎已停止', 'warning');
      this.notifyContentEngineChange('stopped');
    });

    contentEngine.on('refreshCompleted', (data) => {
      this.log(`内容刷新完成: ${data.content.length} 条内容`, 'success');
      this.notifyContentRefreshed(data);
    });

    contentEngine.on('refreshFailed', (data) => {
      this.log(`内容刷新失败: ${data.error}`, 'error');
      this.notifyError('内容刷新失败', data.error);
    });

    // 配置管理器事件
    configManager.addListener(async (config) => {
      this.log('配置已更新', 'info');
      await this.handleConfigChange(config);
    });
  }

  // 初始化配置
  private async initializeConfig(): Promise<void> {
    try {
      await configManager.getConfig();
      this.log('配置管理器初始化完成');
    } catch (error) {
      this.log(`配置管理器初始化失败: ${error}`, 'error');
    }
  }

  // 初始化内容引擎
  private async initializeContentEngine(): Promise<void> {
    try {
      // 根据配置决定是否自动启动内容引擎
      const config = await configManager.getConfig();
      if (config.enabledPlatforms.length > 0) {
        // 不在后台自动启动，等待页面加载后再启动
        this.log('内容引擎准备就绪，等待页面加载');
      }
    } catch (error) {
      this.log(`内容引擎初始化失败: ${error}`, 'error');
    }
  }

  // 执行启动任务
  private async performStartupTasks(): Promise<void> {
    try {
      // 清理过期缓存
      await StorageManager.cleanExpiredCache();
      this.log('过期缓存清理完成');

      // 检查存储使用情况
      const storageUsage = await StorageManager.getStorageUsage();
      if (storageUsage.percentage > 80) {
        this.log(`存储使用率较高: ${storageUsage.percentage.toFixed(1)}%`, 'warning');
      }

      // 设置定期清理任务
      this.setupPeriodicTasks();
    } catch (error) {
      this.log(`启动任务执行失败: ${error}`, 'error');
    }
  }

  // 设置定期任务
  private setupPeriodicTasks(): void {
    // 每小时清理一次过期缓存
    setInterval(async () => {
      try {
        await StorageManager.cleanExpiredCache();
      } catch (error) {
        this.log(`定期清理缓存失败: ${error}`, 'error');
      }
    }, 60 * 60 * 1000);

    // 每天检查一次存储使用情况
    setInterval(async () => {
      try {
        const usage = await StorageManager.getStorageUsage();
        if (usage.percentage > 90) {
          this.log(`存储使用率过高: ${usage.percentage.toFixed(1)}%`, 'error');
          // 可以在这里添加自动清理逻辑
        }
      } catch (error) {
        this.log(`检查存储使用情况失败: ${error}`, 'error');
      }
    }, 24 * 60 * 60 * 1000);
  }

  // 处理首次安装
  private async handleFirstInstall(): Promise<void> {
    try {
      // 设置默认配置
      await configManager.updateConfig({});

      // 打开欢迎页面或选项页
      chrome.tabs.create({
        url: chrome.runtime.getURL('options.html')
      });

      this.log('首次安装处理完成');
    } catch (error) {
      this.log(`首次安装处理失败: ${error}`, 'error');
    }
  }

  // 处理更新
  private async handleUpdate(previousVersion?: string): Promise<void> {
    try {
      // 可以在这里添加版本升级逻辑
      this.log(`更新处理完成，之前版本: ${previousVersion}`);
    } catch (error) {
      this.log(`更新处理失败: ${error}`, 'error');
    }
  }

  // 处理启动
  private async handleStartup(): Promise<void> {
    try {
      this.log('启动处理完成');
    } catch (error) {
      this.log(`启动处理失败: ${error}`, 'error');
    }
  }

  // 处理标签页更新
  private async handleTabUpdate(tabId: number, url: string): Promise<void> {
    try {
      // 检查是否为支持的网站
      const supportedPlatforms = ['bilibili.com', 'youtube.com', 'twitter.com', 'x.com', 'instagram.com'];
      const isSupported = supportedPlatforms.some(platform => url.includes(platform));

      if (isSupported) {
        this.log(`检测到支持的网站: ${url}`);
      }
    } catch (error) {
      this.log(`处理标签页更新失败: ${error}`, 'error');
    }
  }

  // 处理标签页激活
  private async handleTabActivated(tabId: number): Promise<void> {
    try {
      // 可以在这里添加标签页激活后的逻辑
    } catch (error) {
      this.log(`处理标签页激活失败: ${error}`, 'error');
    }
  }

  // 处理配置变化
  private async handleConfigChange(config: any): Promise<void> {
    try {
      // 通知所有内容脚本配置已更新
      const tabs = await chrome.tabs.query({});

      for (const tab of tabs) {
        if (tab.id && tab.url && this.isSupportedUrl(tab.url)) {
          try {
            await ChromeExtensionApi.sendMessage('configUpdated', config, tab.id);
          } catch (error) {
            // 忽略无法发送消息的标签页
          }
        }
      }
    } catch (error) {
      this.log(`处理配置变化失败: ${error}`, 'error');
    }
  }

  // 检查是否为支持的URL
  private isSupportedUrl(url: string): boolean {
    const supportedPlatforms = ['bilibili.com', 'youtube.com', 'twitter.com', 'x.com', 'instagram.com'];
    return supportedPlatforms.some(platform => url.includes(platform));
  }

  // 通知内容引擎状态变化
  private notifyContentEngineChange(status: string, data?: any): void {
    ChromeExtensionApi.createNotification(
      'OnlyFocus',
      `内容引擎${status === 'started' ? '已启动' : '已停止'}`
    );
  }

  // 通知内容刷新完成
  private async notifyContentRefreshed(data: any): Promise<void> {
    const config = await configManager.getConfig();
    if (config?.uiSettings?.showNotifications) {
      ChromeExtensionApi.createNotification(
        'OnlyFocus',
        `已刷新 ${data.content.length} 条关注内容`
      );
    }
  }

  // 通知错误
  private notifyError(title: string, message: string): void {
    ChromeExtensionApi.createNotification(
      `OnlyFocus - ${title}`,
      message
    );
  }

  // 日志工具
  private log(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info'): void {
    if (!DEBUG_CONFIG.enabled) return;

    const timestamp = new Date().toLocaleTimeString();
    const prefix = `${DEBUG_CONFIG.prefix} [Background]`;
    const color = DEBUG_CONFIG.colors[type];

    console.log(`%c${prefix} [${timestamp}] ${message}`, `color: ${color}`);
  }
}

// 创建后台服务实例
const backgroundService = new BackgroundService();

// 导出实例（用于调试）
(globalThis as any).onlyfocusBackground = backgroundService;
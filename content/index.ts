import { platformManager } from "./PlatformManager";
import { configManager } from "../core/config/ConfigManager";
import { ChromeExtensionApi } from "../shared/utils/api";
import { DEBUG_CONFIG } from "../shared/constants";
import type { ContentItem, FollowedUser } from "../shared/types";

/**
 * 内容脚本主入口
 * 负责页面内容替换和平台适配
 */

class ContentScript {
  private isInitialized: boolean = false;
  private currentPlatform: string | null = null;
  private isProcessing: boolean = false;

  constructor() {
    this.initialize();
  }

  // 初始化
  private async initialize(): Promise<void> {
    try {
      this.log("初始化内容脚本...");

      // 等待页面加载完成
      await this.waitForPageLoad();

      // 检测平台
      this.currentPlatform = platformManager.detectCurrentPlatform();

      if (!this.currentPlatform) {
        this.log("当前页面不受支持", "warning");
        return;
      }

      // 检查平台是否启用
      const isEnabled = await configManager.isPlatformEnabled(
        this.currentPlatform as any,
      );
      if (!isEnabled) {
        this.log(`平台 ${this.currentPlatform} 已禁用`, "warning");
        return;
      }

      // 设置消息监听器
      this.setupMessageListeners();

      // 监听页面变化
      this.setupPageChangeListeners();

      // 启动内容替换
      await this.startContentReplacement();

      this.isInitialized = true;
      this.log(
        `内容脚本初始化完成，当前平台: ${this.currentPlatform}`,
        "success",
      );

      // 通知背景脚本
      ChromeExtensionApi.sendMessage("platformDetected", {
        platform: this.currentPlatform,
        url: window.location.href,
      });
    } catch (error) {
      this.log(`初始化失败: ${error}`, "error");
    }
  }

  // 等待页面加载完成
  private waitForPageLoad(): Promise<void> {
    return new Promise((resolve) => {
      if (document.readyState === "complete") {
        resolve();
        return;
      }

      const handleLoad = () => {
        window.removeEventListener("load", handleLoad);
        resolve();
      };

      window.addEventListener("load", handleLoad);
    });
  }

  // 设置消息监听器
  private setupMessageListeners(): void {
    // 获取随机内容
    ChromeExtensionApi.onMessage("getRandomContent", async (data) => {
      try {
        const content = await platformManager.getRandomContent(data?.platform);
        return content;
      } catch (error) {
        this.log(`获取随机内容失败: ${error}`, "error");
        throw error;
      }
    });

    // 获取关注用户
    ChromeExtensionApi.onMessage("getFollowedUsers", async (data) => {
      try {
        const users = await platformManager.getFollowedUsers(data?.platform);
        return users;
      } catch (error) {
        this.log(`获取关注用户失败: ${error}`, "error");
        throw error;
      }
    });

    // 替换内容
    ChromeExtensionApi.onMessage("replaceContent", async (data) => {
      try {
        await this.replaceContent(data?.content, data?.platform);
        return { success: true };
      } catch (error) {
        this.log(`替换内容失败: ${error}`, "error");
        throw error;
      }
    });

    // 刷新内容
    ChromeExtensionApi.onMessage("refreshContent", async () => {
      try {
        await this.refreshContent();
        return { success: true };
      } catch (error) {
        this.log(`刷新内容失败: ${error}`, "error");
        throw error;
      }
    });

    // 获取平台信息
    ChromeExtensionApi.onMessage("getPlatformInfo", async () => {
      try {
        return platformManager.getPlatformInfo();
      } catch (error) {
        this.log(`获取平台信息失败: ${error}`, "error");
        throw error;
      }
    });
  }

  // 设置页面变化监听器
  private setupPageChangeListeners(): void {
    platformManager.onPageChange(async (platform) => {
      this.log(`检测到平台变化: ${this.currentPlatform} -> ${platform}`);

      const previousPlatform = this.currentPlatform;
      this.currentPlatform = platform;

      if (platform && platform !== previousPlatform) {
        // 平台变化，重新初始化
        await this.reinitialize();
      }
    });
  }

  // 启动内容替换
  private async startContentReplacement(): Promise<void> {
    if (!this.currentPlatform || this.isProcessing) {
      return;
    }

    try {
      this.isProcessing = true;
      this.log("开始内容替换...");

      // 等待推荐内容加载
      await this.waitForContentArea();

      // 获取随机内容
      const content = await platformManager.getRandomContent();

      if (content && content.length > 0) {
        // 替换页面内容
        await platformManager.replaceContent(content);

        this.log(`成功替换 ${content.length} 条内容`, "success");

        // 通知背景脚本
        ChromeExtensionApi.sendMessage("contentReplaced", {
          platform: this.currentPlatform,
          contentCount: content.length,
        });
      } else {
        this.log("未获取到可替换的内容", "warning");
      }
    } catch (error) {
      this.log(`内容替换失败: ${error}`, "error");

      // 通知背景脚本
      ChromeExtensionApi.sendMessage("errorOccurred", {
        platform: this.currentPlatform,
        error: error.message,
      });
    } finally {
      this.isProcessing = false;
    }
  }

  // 等待内容区域加载
  private async waitForContentArea(): Promise<void> {
    const adapter = platformManager.getCurrentAdapter();
    if (!adapter) {
      throw new Error("未找到当前平台适配器");
    }

    const maxAttempts = 20;
    const checkInterval = 500;
    let attempts = 0;

    return new Promise((resolve, reject) => {
      const checkContentArea = () => {
        attempts++;
        const contentArea = adapter.detectContentArea();

        if (contentArea) {
          this.log(`内容区域已加载 (尝试 ${attempts} 次)`);
          resolve();
        } else if (attempts >= maxAttempts) {
          reject(new Error("等待内容区域超时"));
        } else {
          setTimeout(checkContentArea, checkInterval);
        }
      };

      checkContentArea();
    });
  }

  // 替换内容
  private async replaceContent(
    content: ContentItem[],
    platform?: string,
  ): Promise<void> {
    const targetPlatform = platform || this.currentPlatform;
    if (!targetPlatform) {
      throw new Error("未指定平台");
    }

    await platformManager.replaceContent(content, targetPlatform as any);
  }

  // 刷新内容
  private async refreshContent(): Promise<void> {
    await this.startContentReplacement();
  }

  // 重新初始化
  private async reinitialize(): Promise<void> {
    this.isInitialized = false;
    this.currentPlatform = null;
    this.isProcessing = false;

    platformManager.refresh();
    await this.initialize();
  }

  // 日志工具
  private log(
    message: string,
    type: "info" | "success" | "warning" | "error" = "info",
  ): void {
    if (!DEBUG_CONFIG.enabled) return;

    const timestamp = new Date().toLocaleTimeString();
    const prefix = `${DEBUG_CONFIG.prefix} [ContentScript]`;
    const color = DEBUG_CONFIG.colors[type];

    console.log(`%c${prefix} [${timestamp}] ${message}`, `color: ${color}`);
  }

  // 销毁
  destroy(): void {
    this.isInitialized = false;
    this.currentPlatform = null;
    this.isProcessing = false;
    platformManager.destroy();
  }
}

// 创建内容脚本实例
const contentScript = new ContentScript();

// 导出实例（用于调试）
(window as any).onlyfollowContentScript = contentScript;

// 页面卸载时清理
window.addEventListener("beforeunload", () => {
  contentScript.destroy();
});

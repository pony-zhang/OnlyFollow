import type { ApiResponse } from '../types';
import { ERROR_MESSAGES } from '../constants';

// 通用API请求工具
export class ApiClient {
  private static instance: ApiClient;
  private requestQueue: Map<string, Promise<any>> = new Map();

  static getInstance(): ApiClient {
    if (!ApiClient.instance) {
      ApiClient.instance = new ApiClient();
    }
    return ApiClient.instance;
  }

  // 通用请求方法
  async request<T = any>(
    url: string,
    options: RequestInit = {},
    cacheKey?: string
  ): Promise<ApiResponse<T>> {
    // 防重复请求
    if (cacheKey && this.requestQueue.has(cacheKey)) {
      return this.requestQueue.get(cacheKey);
    }

    const requestPromise = this.executeRequest<T>(url, options);

    if (cacheKey) {
      this.requestQueue.set(cacheKey, requestPromise);

      // 请求完成后移除队列
      requestPromise.finally(() => {
        this.requestQueue.delete(cacheKey);
      });
    }

    return requestPromise;
  }

  private async executeRequest<T = any>(
    url: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': navigator.userAgent,
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      return {
        success: true,
        data,
      };
    } catch (error) {
      let errorMessage: string = ERROR_MESSAGES.NETWORK_ERROR;

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          errorMessage = '请求超时';
        } else if (error.message.includes('401')) {
          errorMessage = ERROR_MESSAGES.PERMISSION_DENIED;
        } else if (error.message.includes('429')) {
          errorMessage = ERROR_MESSAGES.API_RATE_LIMIT;
        } else {
          errorMessage = error.message;
        }
      }

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  // GET请求
  async get<T = any>(
    url: string,
    params?: Record<string, any>,
    cacheKey?: string
  ): Promise<ApiResponse<T>> {
    const searchParams = new URLSearchParams();

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value));
        }
      });
    }

    const fullUrl = params ? `${url}?${searchParams.toString()}` : url;

    return this.request<T>(fullUrl, { method: 'GET' }, cacheKey);
  }

  // POST请求
  async post<T = any>(
    url: string,
    data?: any,
    cacheKey?: string
  ): Promise<ApiResponse<T>> {
    return this.request<T>(url, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    }, cacheKey);
  }

  // 带重试的请求
  async requestWithRetry<T = any>(
    url: string,
    options: RequestInit = {},
    maxRetries: number = 3,
    delay: number = 1000
  ): Promise<ApiResponse<T>> {
    let lastError: Error | null = null;

    for (let i = 0; i <= maxRetries; i++) {
      try {
        const result = await this.request<T>(url, options);

        if (result.success || i === maxRetries) {
          return result;
        }

        // 如果是频率限制错误，增加延迟
        if (result.error?.includes('频繁') || result.error?.includes('rate')) {
          delay = Math.min(delay * 2, 10000); // 最大10秒
        }

        lastError = new Error(result.error);

        // 等待后重试
        if (i < maxRetries) {
          await this.delay(delay * (i + 1));
        }
      } catch (error) {
        lastError = error as Error;

        if (i < maxRetries) {
          await this.delay(delay * (i + 1));
        }
      }
    }

    return {
      success: false,
      error: lastError?.message || ERROR_MESSAGES.NETWORK_ERROR,
    };
  }

  // 延迟工具
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Chrome扩展API工具
export class ChromeExtensionApi {
  // 发送消息到背景脚本
  static async sendMessage<T = any>(
    action: string,
    data?: any,
    tabId?: number,
    retries: number = 3
  ): Promise<T> {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const message = { action, data, tabId };

        let result: any;
        if (tabId) {
          result = await chrome.tabs.sendMessage(tabId, message);
        } else {
          result = await chrome.runtime.sendMessage(message);
        }

        // 检查响应是否包含错误
        if (result && typeof result === 'object' && 'error' in result) {
          throw new Error(result.error);
        }

        return result;
      } catch (error) {
        console.error(`发送消息失败 (尝试 ${attempt + 1}/${retries}):`, error);

        // 如果是最后一次尝试，直接抛出错误
        if (attempt === retries - 1) {
          throw error;
        }

        // 等待一段时间后重试
        await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }

    throw new Error('消息发送失败');
  }

  // 监听消息
  static onMessage<T = any>(
    action: string,
    callback: (data: T, sender?: chrome.runtime.MessageSender) => any
  ): void {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === action) {
        try {
          const result = callback(message.data, sender);

          if (result instanceof Promise) {
            result
              .then(data => {
                // 确保返回的数据是有效的
                if (data !== undefined) {
                  sendResponse(data);
                } else {
                  sendResponse({ success: true });
                }
              })
              .catch(error => {
                console.error(`处理消息 ${action} 失败:`, error);
                sendResponse({ error: error.message });
              });
            return true; // 保持消息通道开放
          }

          // 对于同步结果，确保返回有效数据
          if (result !== undefined) {
            sendResponse(result);
          } else {
            sendResponse({ success: true });
          }
        } catch (error) {
          console.error(`处理消息 ${action} 失败:`, error);
          sendResponse({ error: error instanceof Error ? error.message : String(error) });
        }
      }
    });
  }

  // 获取当前标签页
  static async getCurrentTab(): Promise<chrome.tabs.Tab> {
    return new Promise((resolve, reject) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length > 0) {
          resolve(tabs[0]);
        } else {
          reject(new Error('无法获取当前标签页'));
        }
      });
    });
  }

  // 执行脚本
  static async executeScript(
    tabId: number,
    details: any
  ): Promise<any[]> {
    return await chrome.scripting.executeScript({
      target: { tabId },
      ...details,
    });
  }

  // 创建通知
  static createNotification(
    title: string,
    message: string,
    options?: chrome.notifications.NotificationOptions
  ): void {
    if (chrome.notifications) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: chrome.runtime.getURL('assets/icons/icon48.png'),
        title,
        message,
        ...options,
      });
    }
  }

  // 打开选项页
  static openOptionsPage(): void {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    }
  }
}

// 导出默认实例
export const apiClient = ApiClient.getInstance();
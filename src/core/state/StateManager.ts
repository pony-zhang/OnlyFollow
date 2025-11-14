import { StorageManager } from "../../shared/utils/storage";
import { configManager } from "../config/ConfigManager";
import type {
  AppState,
  PluginState,
  PlatformState,
  EngineState,
  StateChangeEvent,
  StateChangeListener,
} from "./StateTypes";
import {
  DEFAULT_PLUGIN_STATE,
  DEFAULT_PLATFORM_STATE,
  DEFAULT_ENGINE_STATE,
} from "./StateTypes";
import type { Platform } from "../../shared/types";

/**
 * 状态管理器 - 负责插件状态的统一管理
 */
export class StateManager {
  private static instance: StateManager;
  private currentState: AppState;
  private listeners: Map<string, StateChangeListener[]> = new Map();
  private readonly STORAGE_KEY = "onlyfollow_app_state";

  private constructor() {
    this.currentState = this.createDefaultState();
  }

  /**
   * 获取单例实例
   */
  static getInstance(): StateManager {
    if (!StateManager.instance) {
      StateManager.instance = new StateManager();
    }
    return StateManager.instance;
  }

  /**
   * 初始化状态管理器
   */
  async initialize(): Promise<void> {
    console.log("[StateManager] 初始化状态管理器...");

    try {
      // 从存储中加载状态
      const savedState = await this.loadState();
      if (savedState) {
        this.currentState = this.mergeStates(
          savedState,
          this.createDefaultState(),
        );
        console.log("[StateManager] 已加载保存的状态");
      } else {
        console.log("[StateManager] 使用默认状态");
      }

      // 验证状态完整性
      await this.validateState();

      console.log("[StateManager] 状态管理器初始化完成");
    } catch (error) {
      console.error("[StateManager] 初始化失败:", error);
      // 降级到默认状态
      this.currentState = this.createDefaultState();
    }
  }

  /**
   * 获取完整状态
   */
  getState(): AppState {
    return { ...this.currentState };
  }

  /**
   * 获取插件状态
   */
  getPluginState(): PluginState {
    return { ...this.currentState.plugin };
  }

  /**
   * 获取平台状态
   */
  getPlatformState(platform: Platform): PlatformState {
    return { ...this.currentState.platforms[platform] };
  }

  /**
   * 获取引擎状态
   */
  getEngineState(): EngineState {
    return { ...this.currentState.engine };
  }

  /**
   * 更新插件状态
   */
  async updatePluginState(updates: Partial<PluginState>): Promise<void> {
    const oldState = { ...this.currentState.plugin };
    const newState = { ...oldState, ...updates, lastUpdated: Date.now() };

    this.currentState.plugin = newState;

    // 触发变化事件
    this.emitStateChange("plugin", "plugin", oldState, newState);

    // 保存到存储
    await this.saveState();

    console.log("[StateManager] 插件状态已更新:", updates);
  }

  /**
   * 更新平台状态
   */
  async updatePlatformState(
    platform: Platform,
    updates: Partial<PlatformState>,
  ): Promise<void> {
    const oldState = { ...this.currentState.platforms[platform] };
    const newState = { ...oldState, ...updates };

    this.currentState.platforms[platform] = newState;

    // 触发变化事件
    this.emitStateChange("platform", platform, oldState, newState);

    // 保存到存储
    await this.saveState();

    console.log(`[StateManager] 平台 ${platform} 状态已更新:`, updates);
  }

  /**
   * 更新引擎状态
   */
  async updateEngineState(updates: Partial<EngineState>): Promise<void> {
    const oldState = { ...this.currentState.engine };
    const newState = { ...oldState, ...updates };

    // 计算运行时长
    if (updates.isRunning !== undefined) {
      if (updates.isRunning && !oldState.isRunning) {
        // 刚启动
        newState.startTime = Date.now();
      } else if (!updates.isRunning && oldState.isRunning) {
        // 刚停止
        newState.startTime = null;
      }
    }

    this.currentState.engine = newState;

    // 触发变化事件
    this.emitStateChange("engine", "engine", oldState, newState);

    // 引擎状态不需要持久化（运行时状态）
    console.log("[StateManager] 引擎状态已更新:", updates);
  }

  /**
   * 检查插件是否启用
   */
  isPluginEnabled(): boolean {
    return (
      this.currentState.plugin.enabled && !this.currentState.plugin.isPaused
    );
  }

  /**
   * 检查平台是否启用
   */
  isPlatformEnabled(platform: Platform): boolean {
    return (
      this.currentState.plugin.enabled &&
      !this.currentState.plugin.isPaused &&
      this.currentState.platforms[platform]?.enabled
    );
  }

  /**
   * 启用插件
   */
  async enablePlugin(): Promise<void> {
    await this.updatePluginState({ enabled: true, isPaused: false });
  }

  /**
   * 禁用插件
   */
  async disablePlugin(): Promise<void> {
    await this.updatePluginState({ enabled: false, isPaused: false });
  }

  /**
   * 暂停插件
   */
  async pausePlugin(): Promise<void> {
    await this.updatePluginState({ isPaused: true });
  }

  /**
   * 恢复插件
   */
  async resumePlugin(): Promise<void> {
    await this.updatePluginState({ isPaused: false });
  }

  /**
   * 启用平台
   */
  async enablePlatform(platform: Platform): Promise<void> {
    await this.updatePlatformState(platform, {
      enabled: true,
      status: "inactive",
    });
  }

  /**
   * 禁用平台
   */
  async disablePlatform(platform: Platform): Promise<void> {
    await this.updatePlatformState(platform, {
      enabled: false,
      status: "disabled",
    });
  }

  /**
   * 更新平台活动状态
   */
  async updatePlatformActivity(
    platform: Platform,
    isActive: boolean,
    error?: string,
  ): Promise<void> {
    const updates: Partial<PlatformState> = {
      lastActive: Date.now(),
      status: isActive ? "active" : "inactive",
    };

    if (error) {
      updates.status = "error";
      updates.errorCount = this.currentState.platforms[platform].errorCount + 1;
    } else {
      updates.errorCount = 0;
    }

    await this.updatePlatformState(platform, updates);
  }

  /**
   * 更新引擎运行状态
   */
  async updateEngineRunningState(
    isRunning: boolean,
    error?: string,
  ): Promise<void> {
    const updates: Partial<EngineState> = { isRunning };

    if (error) {
      updates.lastError = error;
    } else {
      updates.lastError = null;
    }

    if (isRunning) {
      updates.lastRefresh = Date.now();
    }

    await this.updateEngineState(updates);
  }

  /**
   * 添加状态变化监听器
   */
  addStateChangeListener(
    type: "plugin" | "platform" | "engine",
    listener: StateChangeListener,
  ): void {
    const key = type;
    if (!this.listeners.has(key)) {
      this.listeners.set(key, []);
    }
    this.listeners.get(key)!.push(listener);
  }

  /**
   * 移除状态变化监听器
   */
  removeStateChangeListener(
    type: "plugin" | "platform" | "engine",
    listener: StateChangeListener,
  ): void {
    const key = type;
    const listeners = this.listeners.get(key);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * 获取状态统计信息
   */
  getStateStatistics(): {
    pluginEnabled: boolean;
    platformsEnabled: number;
    platformsTotal: number;
    platformsActive: number;
    platformsError: number;
    engineRunning: boolean;
    uptime: number;
  } {
    const platforms = Object.values(this.currentState.platforms);

    return {
      pluginEnabled: this.isPluginEnabled(),
      platformsEnabled: platforms.filter((p) => p.enabled).length,
      platformsTotal: platforms.length,
      platformsActive: platforms.filter((p) => p.status === "active").length,
      platformsError: platforms.filter((p) => p.status === "error").length,
      engineRunning: this.currentState.engine.isRunning,
      uptime: this.currentState.engine.uptime,
    };
  }

  /**
   * 重置所有状态
   */
  async resetAllStates(): Promise<void> {
    console.log("[StateManager] 重置所有状态...");
    this.currentState = this.createDefaultState();
    await this.saveState();

    // 触发重置事件
    this.emitStateChange("plugin", "plugin", {}, this.currentState.plugin);
  }

  // 私有方法

  /**
   * 创建默认状态
   */
  private createDefaultState(): AppState {
    const platforms: Record<Platform, PlatformState> = {} as any;

    const allPlatforms: Platform[] = [
      "bilibili",
      "youtube",
      "twitter",
      "instagram",
    ];
    allPlatforms.forEach((platform) => {
      platforms[platform] = {
        platform,
        ...DEFAULT_PLATFORM_STATE,
      };
    });

    return {
      plugin: { ...DEFAULT_PLUGIN_STATE },
      platforms,
      engine: { ...DEFAULT_ENGINE_STATE },
    };
  }

  /**
   * 从存储加载状态
   */
  private async loadState(): Promise<AppState | null> {
    try {
      const saved = await StorageManager.getCache<AppState>(this.STORAGE_KEY);
      return saved;
    } catch (error) {
      console.error("[StateManager] 加载状态失败:", error);
      return null;
    }
  }

  /**
   * 保存状态到存储
   */
  private async saveState(): Promise<void> {
    try {
      // 只保存插件状态和平台状态，不保存引擎状态（运行时状态）
      const stateToSave: AppState = {
        ...this.currentState,
        engine: DEFAULT_ENGINE_STATE, // 重置引擎状态
      };

      await StorageManager.setCache(
        this.STORAGE_KEY,
        stateToSave,
        7 * 24 * 60 * 60 * 1000,
      ); // 7天TTL
    } catch (error) {
      console.error("[StateManager] 保存状态失败:", error);
    }
  }

  /**
   * 合并状态（用于版本升级）
   */
  private mergeStates(saved: AppState, defaults: AppState): AppState {
    return {
      plugin: { ...defaults.plugin, ...saved.plugin },
      platforms: { ...defaults.platforms, ...saved.platforms },
      engine: { ...defaults.engine }, // 引擎状态不合并
    };
  }

  /**
   * 验证状态完整性
   */
  private async validateState(): Promise<void> {
    // 检查所有平台是否存在
    const allPlatforms: Platform[] = [
      "bilibili",
      "youtube",
      "twitter",
      "instagram",
    ];

    for (const platform of allPlatforms) {
      if (!this.currentState.platforms[platform]) {
        console.log(`[StateManager] 添加缺失的平台状态: ${platform}`);
        this.currentState.platforms[platform] = {
          platform,
          ...DEFAULT_PLATFORM_STATE,
        };
      }
    }

    // 保存修正后的状态
    await this.saveState();
  }

  /**
   * 触发状态变化事件
   */
  private emitStateChange(
    type: "plugin" | "platform" | "engine",
    key: string,
    oldValue: any,
    newValue: any,
  ): void {
    const event: StateChangeEvent = {
      type,
      key,
      oldValue,
      newValue,
      timestamp: Date.now(),
    };

    const listeners = this.listeners.get(type);
    if (listeners) {
      listeners.forEach((listener) => {
        try {
          listener(event);
        } catch (error) {
          console.error("[StateManager] 状态监听器执行失败:", error);
        }
      });
    }

    // 调试模式下输出详细日志
    if (this.currentState.plugin.globalSettings.debugMode) {
      console.log(`[StateManager] 状态变化 - ${type}.${key}:`, event);
    }
  }
}

// 导出单例实例
export const stateManager = StateManager.getInstance();

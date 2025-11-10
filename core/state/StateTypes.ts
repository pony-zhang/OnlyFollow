import type { Platform } from '../types';

/**
 * 插件全局状态接口
 */
export interface PluginState {
  // 插件总开关
  enabled: boolean;

  // 自动启动（浏览器启动时自动运行）
  autoStart: boolean;

  // 暂停状态（临时暂停，保持配置）
  isPaused: boolean;

  // 全局设置
  globalSettings: {
    // 显示通知
    showNotifications: boolean;

    // 主题
    theme: 'light' | 'dark' | 'auto';

    // 调试模式
    debugMode: boolean;
  };

  // 状态更新时间
  lastUpdated: number;

  // 版本号（用于迁移）
  version: string;
}

/**
 * 平台状态接口
 */
export interface PlatformState {
  // 平台标识
  platform: Platform;

  // 是否启用
  enabled: boolean;

  // 最后活动时间
  lastActive: number;

  // 错误计数
  errorCount: number;

  // 状态信息
  status: 'active' | 'inactive' | 'error' | 'disabled';
}

/**
 * 引擎状态接口
 */
export interface EngineState {
  // 是否运行中
  isRunning: boolean;

  // 启动时间
  startTime: number | null;

  // 最后刷新时间
  lastRefresh: number;

  // 下次刷新时间
  nextRefresh: number | null;

  // 运行时长（毫秒）
  uptime: number;

  // 错误信息
  lastError: string | null;

  // 当前活动平台
  activePlatforms: Platform[];
}

/**
 * 完整状态接口
 */
export interface AppState {
  // 插件全局状态
  plugin: PluginState;

  // 各平台状态
  platforms: Record<Platform, PlatformState>;

  // 引擎状态
  engine: EngineState;
}

/**
 * 状态变化事件类型
 */
export type StateChangeEvent = {
  type: 'plugin' | 'platform' | 'engine';
  key: string;
  oldValue: any;
  newValue: any;
  timestamp: number;
};

/**
 * 状态监听器类型
 */
export type StateChangeListener = (event: StateChangeEvent) => void;

/**
 * 默认插件状态
 */
export const DEFAULT_PLUGIN_STATE: PluginState = {
  enabled: true,
  autoStart: true,
  isPaused: false,
  globalSettings: {
    showNotifications: true,
    theme: 'auto',
    debugMode: false,
  },
  lastUpdated: Date.now(),
  version: '1.0.0',
};

/**
 * 默认平台状态
 */
export const DEFAULT_PLATFORM_STATE: Omit<PlatformState, 'platform'> = {
  enabled: true,
  lastActive: 0,
  errorCount: 0,
  status: 'inactive',
};

/**
 * 默认引擎状态
 */
export const DEFAULT_ENGINE_STATE: EngineState = {
  isRunning: false,
  startTime: null,
  lastRefresh: 0,
  nextRefresh: null,
  uptime: 0,
  lastError: null,
  activePlatforms: [],
};
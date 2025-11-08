import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import type { UserConfig, Platform } from '../shared/types';
import { ChromeExtensionApi } from '../shared/utils/api';

interface PopupState {
  config: UserConfig | null;
  isLoading: boolean;
  error: string | null;
  currentTab: 'overview' | 'settings' | 'stats';
  engineStatus: any;
  cacheStats: any;
}

// 弹窗组件
function Popup() {
  const [state, setState] = useState<PopupState>({
    config: null,
    isLoading: true,
    error: null,
    currentTab: 'overview',
    engineStatus: null,
    cacheStats: null,
  });

  // 初始化数据
  useEffect(() => {
    initializeData();
  }, []);

  const initializeData = async () => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));

      // 等待背景脚本准备就绪
      await waitForBackgroundReady();

      // 并行获取数据
      const [config, engineStatus, cacheStats] = await Promise.all([
        ChromeExtensionApi.sendMessage('getConfig'),
        ChromeExtensionApi.sendMessage('getEngineStatus').catch(() => null),
        ChromeExtensionApi.sendMessage('getCacheStats').catch(() => null),
      ]);

      setState(prev => ({
        ...prev,
        config,
        engineStatus,
        cacheStats,
        isLoading: false,
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : '加载失败',
      }));
    }
  };

  // 等待背景脚本准备就绪
  const waitForBackgroundReady = async (maxRetries = 5): Promise<void> => {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const health = await ChromeExtensionApi.sendMessage('healthCheck');
        if (health?.status === 'ready') {
          return;
        }
      } catch (error) {
        // 背景脚本可能还没准备好，继续等待
      }

      // 等待一段时间后重试
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    throw new Error('背景脚本未能及时响应');
  };

  // 切换平台开关
  const togglePlatform = async (platform: Platform) => {
    if (!state.config) return;

    try {
      const enabledPlatforms = state.config.enabledPlatforms.includes(platform)
        ? state.config.enabledPlatforms.filter(p => p !== platform)
        : [...state.config.enabledPlatforms, platform];

      await ChromeExtensionApi.sendMessage('setConfig', { enabledPlatforms });

      setState(prev => ({
        ...prev,
        config: prev.config ? {
          ...prev.config,
          enabledPlatforms,
        } : null,
      }));
    } catch (error) {
      console.error('切换平台失败:', error);
    }
  };

  // 打开选项页
  const openOptions = () => {
    ChromeExtensionApi.sendMessage('openOptions');
    window.close();
  };

  // 手动刷新内容
  const refreshContent = async () => {
    try {
      await ChromeExtensionApi.sendMessage('refreshContent');
      await initializeData(); // 重新获取状态
    } catch (error) {
      console.error('刷新内容失败:', error);
    }
  };

  // 渲染加载状态
  if (state.isLoading) {
    return (
      <div className="popup-container">
        <div className="loading">
          <div className="spinner"></div>
          <p>加载中...</p>
        </div>
      </div>
    );
  }

  // 渲染错误状态
  if (state.error) {
    return (
      <div className="popup-container">
        <div className="error">
          <p>{state.error}</p>
          <button onClick={initializeData}>重试</button>
        </div>
      </div>
    );
  }

  // 渲染主界面
  return (
    <div className="popup-container">
      <header className="popup-header">
        <h1>OnlyFocus</h1>
        <div className="header-actions">
          <button
            onClick={refreshContent}
            className="refresh-btn"
            title="刷新内容"
          >
            🔄
          </button>
          <button
            onClick={openOptions}
            className="settings-btn"
            title="设置"
          >
            ⚙️
          </button>
        </div>
      </header>

      <div className="popup-tabs">
        <button
          className={`tab ${state.currentTab === 'overview' ? 'active' : ''}`}
          onClick={() => setState(prev => ({ ...prev, currentTab: 'overview' }))}
        >
          概览
        </button>
        <button
          className={`tab ${state.currentTab === 'settings' ? 'active' : ''}`}
          onClick={() => setState(prev => ({ ...prev, currentTab: 'settings' }))}
        >
          设置
        </button>
        <button
          className={`tab ${state.currentTab === 'stats' ? 'active' : ''}`}
          onClick={() => setState(prev => ({ ...prev, currentTab: 'stats' }))}
        >
          统计
        </button>
      </div>

      <div className="popup-content">
        {state.currentTab === 'overview' && (
          <OverviewTab
            config={state.config}
            engineStatus={state.engineStatus}
            onTogglePlatform={togglePlatform}
          />
        )}
        {state.currentTab === 'settings' && (
          <SettingsTab
            config={state.config}
            onUpdateConfig={async (updates) => {
              await ChromeExtensionApi.sendMessage('setConfig', updates);
              await initializeData();
            }}
          />
        )}
        {state.currentTab === 'stats' && (
          <StatsTab
            engineStatus={state.engineStatus}
            cacheStats={state.cacheStats}
          />
        )}
      </div>
    </div>
  );
}

// 概览标签页
function OverviewTab({ config, engineStatus, onTogglePlatform }: {
  config: UserConfig;
  engineStatus: any;
  onTogglePlatform: (platform: Platform) => void;
}) {
  return (
    <div className="overview-tab">
      <div className="platform-status">
        <h3>平台状态</h3>
        <div className="platform-list">
          {(['bilibili', 'youtube', 'twitter', 'instagram'] as Platform[]).map(platform => (
            <div key={platform} className="platform-item">
              <label className="platform-label">
                <input
                  type="checkbox"
                  checked={config.enabledPlatforms.includes(platform)}
                  onChange={() => onTogglePlatform(platform)}
                />
                <span className="platform-name">
                  {platform === 'bilibili' && '哔哩哔哩'}
                  {platform === 'youtube' && 'YouTube'}
                  {platform === 'twitter' && 'Twitter/X'}
                  {platform === 'instagram' && 'Instagram'}
                </span>
              </label>
            </div>
          ))}
        </div>
      </div>

      <div className="engine-status">
        <h3>引擎状态</h3>
        {engineStatus ? (
          <div className="status-info">
            <div className="status-item">
              <span className="status-label">运行状态:</span>
              <span className={`status-value ${engineStatus.isRunning ? 'running' : 'stopped'}`}>
                {engineStatus.isRunning ? '运行中' : '已停止'}
              </span>
            </div>
            {engineStatus.lastRefresh > 0 && (
              <div className="status-item">
                <span className="status-label">上次刷新:</span>
                <span className="status-value">
                  {new Date(engineStatus.lastRefresh).toLocaleTimeString()}
                </span>
              </div>
            )}
            {engineStatus.uptime > 0 && (
              <div className="status-item">
                <span className="status-label">运行时长:</span>
                <span className="status-value">
                  {Math.floor(engineStatus.uptime / 1000)}秒
                </span>
              </div>
            )}
          </div>
        ) : (
          <p>引擎状态未知</p>
        )}
      </div>

      <div className="quick-actions">
        <h3>快速操作</h3>
        <div className="action-buttons">
          <button onClick={() => window.open('dashboard.html', '_blank')}>
            查看面板
          </button>
          <button onClick={() => window.open('options.html', '_blank')}>
            详细设置
          </button>
        </div>
      </div>
    </div>
  );
}

// 设置标签页
function SettingsTab({ config, onUpdateConfig }: {
  config: UserConfig;
  onUpdateConfig: (updates: Partial<UserConfig>) => Promise<void>;
}) {
  return (
    <div className="settings-tab">
      <div className="setting-group">
        <h3>内容设置</h3>
        <div className="setting-item">
          <label>最大内容数量</label>
          <input
            type="number"
            min="1"
            max="100"
            value={config.contentSettings.maxItems}
            onChange={(e) => onUpdateConfig({
              contentSettings: {
                ...config.contentSettings,
                maxItems: parseInt(e.target.value) || 20,
              },
            })}
          />
        </div>
        <div className="setting-item">
          <label>刷新间隔 (分钟)</label>
          <input
            type="number"
            min="1"
            value={config.contentSettings.refreshInterval / 60000}
            onChange={(e) => onUpdateConfig({
              contentSettings: {
                ...config.contentSettings,
                refreshInterval: parseInt(e.target.value) * 60000,
              },
            })}
          />
        </div>
        <div className="setting-item">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={config.contentSettings.shuffleEnabled}
              onChange={(e) => onUpdateConfig({
                contentSettings: {
                  ...config.contentSettings,
                  shuffleEnabled: e.target.checked,
                },
              })}
            />
            <span>启用内容洗牌</span>
          </label>
        </div>
      </div>

      <div className="setting-group">
        <h3>界面设置</h3>
        <div className="setting-item">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={config.uiSettings.showNotifications}
              onChange={(e) => onUpdateConfig({
                uiSettings: {
                  ...config.uiSettings,
                  showNotifications: e.target.checked,
                },
              })}
            />
            <span>显示通知</span>
          </label>
        </div>
        <div className="setting-item">
          <label>主题</label>
          <select
            value={config.uiSettings.theme}
            onChange={(e) => onUpdateConfig({
              uiSettings: {
                ...config.uiSettings,
                theme: e.target.value as 'light' | 'dark' | 'auto',
              },
            })}
          >
            <option value="auto">自动</option>
            <option value="light">浅色</option>
            <option value="dark">深色</option>
          </select>
        </div>
      </div>
    </div>
  );
}

// 统计标签页
function StatsTab({ engineStatus, cacheStats }: {
  engineStatus: any;
  cacheStats: any;
}) {
  return (
    <div className="stats-tab">
      {engineStatus && (
        <div className="stats-group">
          <h3>引擎统计</h3>
          <div className="stats-grid">
            <div className="stat-item">
              <span className="stat-label">运行状态</span>
              <span className={`stat-value ${engineStatus.isRunning ? 'running' : 'stopped'}`}>
                {engineStatus.isRunning ? '运行中' : '已停止'}
              </span>
            </div>
            {engineStatus.uptime > 0 && (
              <div className="stat-item">
                <span className="stat-label">运行时长</span>
                <span className="stat-value">
                  {Math.floor(engineStatus.uptime / 1000)}秒
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {cacheStats && (
        <div className="stats-group">
          <h3>缓存统计</h3>
          <div className="stats-grid">
            {Object.entries(cacheStats.stats).map(([platform, count]) => (
              <div key={platform} className="stat-item">
                <span className="stat-label">{platform}</span>
                <span className="stat-value">{count} 条</span>
              </div>
            ))}
            {cacheStats.storageUsage && (
              <div className="stat-item">
                <span className="stat-label">存储使用</span>
                <span className="stat-value">
                  {cacheStats.storageUsage.percentage.toFixed(1)}%
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="stats-actions">
        <button onClick={() => ChromeExtensionApi.sendMessage('clearCache')}>
          清除缓存
        </button>
        <button onClick={() => window.open('dashboard.html', '_blank')}>
          详细统计
        </button>
      </div>
    </div>
  );
}

// 渲染应用
const container = document.getElementById('app');
if (container) {
  const root = createRoot(container);
  root.render(<Popup />);
}
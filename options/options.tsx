import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import type { UserConfig, Platform } from '../shared/types';
import { ChromeExtensionApi } from '../shared/utils/api';

function OptionsPage() {
  const [config, setConfig] = useState<UserConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setIsLoading(true);
      const data = await ChromeExtensionApi.sendMessage('getConfig');
      setConfig(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载配置失败');
    } finally {
      setIsLoading(false);
    }
  };

  const saveConfig = async (updates: Partial<UserConfig>) => {
    try {
      await ChromeExtensionApi.sendMessage('setConfig', updates);
      await loadConfig();
      setSaveMessage('配置已保存');
      setTimeout(() => setSaveMessage(null), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    }
  };

  const togglePlatform = async (platform: Platform) => {
    if (!config) return;

    const enabledPlatforms = config.enabledPlatforms.includes(platform)
      ? config.enabledPlatforms.filter(p => p !== platform)
      : [...config.enabledPlatforms, platform];

    await saveConfig({ enabledPlatforms });
  };

  const updateContentSettings = async (settings: Partial<UserConfig['contentSettings']>) => {
    if (!config) return;

    await saveConfig({
      contentSettings: { ...config.contentSettings, ...settings }
    });
  };

  const updateUISettings = async (settings: Partial<UserConfig['uiSettings']>) => {
    if (!config) return;

    await saveConfig({
      uiSettings: { ...config.uiSettings, ...settings }
    });
  };

  const resetConfig = async () => {
    if (confirm('确定要重置所有配置吗？')) {
      try {
        await ChromeExtensionApi.sendMessage('resetConfig');
        await loadConfig();
        setSaveMessage('配置已重置');
        setTimeout(() => setSaveMessage(null), 2000);
      } catch (err) {
        setError(err instanceof Error ? err.message : '重置失败');
      }
    }
  };

  if (isLoading) {
    return (
      <div className="options-container">
        <div className="loading">
          <div className="spinner"></div>
          <p>加载中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="options-container">
        <div className="error">
          <h2>错误</h2>
          <p>{error}</p>
          <button onClick={loadConfig}>重试</button>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="options-container">
        <div className="error">
          <p>无法加载配置</p>
        </div>
      </div>
    );
  }

  return (
    <div className="options-container">
      <header className="options-header">
        <h1>OnlyFocus 设置</h1>
        {saveMessage && <div className="save-message">{saveMessage}</div>}
      </header>

      <main className="options-main">
        <section className="settings-section">
          <h2>平台设置</h2>
          <div className="platform-settings">
            {(['bilibili', 'youtube', 'twitter', 'instagram'] as Platform[]).map(platform => (
              <label key={platform} className="platform-toggle">
                <input
                  type="checkbox"
                  checked={config.enabledPlatforms.includes(platform)}
                  onChange={() => togglePlatform(platform)}
                />
                <span className="platform-name">
                  {platform === 'bilibili' && '哔哩哔哩'}
                  {platform === 'youtube' && 'YouTube'}
                  {platform === 'twitter' && 'Twitter/X'}
                  {platform === 'instagram' && 'Instagram'}
                </span>
              </label>
            ))}
          </div>
        </section>

        <section className="settings-section">
          <h2>内容设置</h2>
          <div className="form-group">
            <label htmlFor="maxItems">最大内容数量</label>
            <input
              id="maxItems"
              type="number"
              min="1"
              max="100"
              value={config.contentSettings.maxItems}
              onChange={(e) => updateContentSettings({
                maxItems: parseInt(e.target.value) || 20
              })}
            />
          </div>
          <div className="form-group">
            <label htmlFor="refreshInterval">刷新间隔（分钟）</label>
            <input
              id="refreshInterval"
              type="number"
              min="1"
              value={config.contentSettings.refreshInterval / 60000}
              onChange={(e) => updateContentSettings({
                refreshInterval: parseInt(e.target.value) * 60000
              })}
            />
          </div>
          <div className="form-group">
            <label htmlFor="requestDelay">请求间隔（毫秒）</label>
            <input
              id="requestDelay"
              type="number"
              min="500"
              max="10000"
              step="100"
              value={config.contentSettings.requestDelay}
              onChange={(e) => updateContentSettings({
                requestDelay: parseInt(e.target.value) || 2000
              })}
            />
            <small>设置API请求之间的间隔时间，避免触发频率限制（建议2000-5000毫秒）</small>
          </div>
          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={config.contentSettings.shuffleEnabled}
                onChange={(e) => updateContentSettings({
                  shuffleEnabled: e.target.checked
                })}
              />
              <span>启用内容洗牌</span>
            </label>
          </div>
        </section>

        <section className="settings-section">
          <h2>界面设置</h2>
          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={config.uiSettings.showNotifications}
                onChange={(e) => updateUISettings({
                  showNotifications: e.target.checked
                })}
              />
              <span>显示通知</span>
            </label>
          </div>
          <div className="form-group">
            <label htmlFor="theme">主题</label>
            <select
              id="theme"
              value={config.uiSettings.theme}
              onChange={(e) => updateUISettings({
                theme: e.target.value as 'light' | 'dark' | 'auto'
              })}
            >
              <option value="auto">自动</option>
              <option value="light">浅色</option>
              <option value="dark">深色</option>
            </select>
          </div>
        </section>

        <section className="settings-section">
          <h2>管理</h2>
          <div className="action-buttons">
            <button onClick={() => window.open('dashboard.html', '_blank')}>
              查看面板
            </button>
            <button onClick={() => ChromeExtensionApi.sendMessage('clearCache')}>
              清除缓存
            </button>
            <button onClick={resetConfig} className="danger">
              重置配置
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

// 渲染应用
const container = document.getElementById('app');
if (container) {
  const root = createRoot(container);
  root.render(<OptionsPage />);
}
import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import type { UserConfig, Platform } from "../../shared/types";
import { ChromeExtensionApi } from "../../shared/utils/api";

// 兼容性函数：将新配置转换为旧格式以保持UI兼容
const getLegacyConfig = (config: UserConfig | null) => {
  if (!config) return null;

  // 如果是旧格式（有contentSettings），直接返回
  if ((config as any).contentSettings) {
    return config;
  }

  // 如果是新格式，转换为兼容的格式
  return {
    ...config,
    contentSettings: {
      maxItems: config.globalSettings?.maxItemsPerPlatform || 20,
      refreshInterval: config.globalSettings?.refreshInterval || 30 * 60 * 1000,
      shuffleEnabled: config.globalSettings?.shuffleEnabled ?? true,
      requestDelay: config.platformSettings?.bilibili?.requestDelay || 5000,
      concurrentRequests:
        config.platformSettings?.bilibili?.concurrentRequests || false,
      concurrentLimit: config.platformSettings?.bilibili?.concurrentLimit || 1,
    },
    uiSettings: config.uiSettings,
  };
};

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
      const data = await ChromeExtensionApi.sendMessage("getConfig");

      // 确保配置有正确的结构
      if (data && !data.globalSettings && data.contentSettings) {
        // 这是旧格式配置，添加兼容性字段
        const compatibleConfig = {
          ...data,
          globalSettings: {
            maxItemsPerPlatform: data.contentSettings.maxItems || 20,
            refreshInterval:
              data.contentSettings.refreshInterval || 30 * 60 * 1000,
            shuffleEnabled: data.contentSettings.shuffleEnabled ?? true,
          },
          platformSettings: {
            bilibili: {
              enabled: data.enabledPlatforms?.includes("bilibili") || false,
              requestDelay: data.contentSettings.requestDelay || 5000,
              concurrentRequests:
                data.contentSettings.concurrentRequests || false,
              concurrentLimit: data.contentSettings.concurrentLimit || 1,
              maxItems: data.contentSettings.maxItems || 20,
              customSettings: {},
            },
            youtube: {
              enabled: data.enabledPlatforms?.includes("youtube") || false,
              requestDelay: 1000,
              concurrentRequests: true,
              concurrentLimit: 3,
              maxItems: 30,
              customSettings: {},
            },
            twitter: {
              enabled: data.enabledPlatforms?.includes("twitter") || false,
              requestDelay: 2000,
              concurrentRequests: false,
              concurrentLimit: 2,
              maxItems: 25,
              customSettings: {},
            },
            instagram: {
              enabled: data.enabledPlatforms?.includes("instagram") || false,
              requestDelay: 3000,
              concurrentRequests: false,
              concurrentLimit: 1,
              maxItems: 15,
              customSettings: {},
            },
          },
        };
        setConfig(compatibleConfig);
      } else {
        setConfig(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载配置失败");
    } finally {
      setIsLoading(false);
    }
  };

  const saveConfig = async (updates: Partial<UserConfig>) => {
    try {
      await ChromeExtensionApi.sendMessage("setConfig", updates);
      await loadConfig();
      setSaveMessage("配置已保存");
      setTimeout(() => setSaveMessage(null), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    }
  };

  const togglePlatform = async (platform: Platform) => {
    if (!config) return;

    const enabledPlatforms = config.enabledPlatforms.includes(platform)
      ? config.enabledPlatforms.filter((p) => p !== platform)
      : [...config.enabledPlatforms, platform];

    await saveConfig({ enabledPlatforms });
  };

  const updateContentSettings = async (
    settings: Partial<UserConfig["globalSettings"]>,
  ) => {
    if (!config) return;

    await saveConfig({
      globalSettings: { ...config.globalSettings, ...settings },
    });
  };

  const updateUISettings = async (
    settings: Partial<UserConfig["uiSettings"]>,
  ) => {
    if (!config) return;

    await saveConfig({
      uiSettings: { ...config.uiSettings, ...settings },
    });
  };

  const resetConfig = async () => {
    if (confirm("确定要重置所有配置吗？")) {
      try {
        await ChromeExtensionApi.sendMessage("resetConfig");
        await loadConfig();
        setSaveMessage("配置已重置");
        setTimeout(() => setSaveMessage(null), 2000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "重置失败");
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
        <h1>OnlyFollow 设置</h1>
        {saveMessage && <div className="save-message">{saveMessage}</div>}
      </header>

      <main className="options-main">
        <section className="settings-section">
          <h2>平台设置</h2>
          <div className="platform-settings">
            {(
              ["bilibili", "youtube", "twitter", "instagram"] as Platform[]
            ).map((platform) => (
              <label key={platform} className="platform-toggle">
                <input
                  type="checkbox"
                  checked={config.enabledPlatforms.includes(platform)}
                  onChange={() => togglePlatform(platform)}
                />
                <span className="platform-name">
                  {platform === "bilibili" && "哔哩哔哩"}
                  {platform === "youtube" && "YouTube"}
                  {platform === "twitter" && "Twitter/X"}
                  {platform === "instagram" && "Instagram"}
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
              value={config.globalSettings.maxItemsPerPlatform}
              onChange={(e) =>
                updateContentSettings({
                  maxItemsPerPlatform: parseInt(e.target.value) || 20,
                })
              }
            />
          </div>
          <div className="form-group">
            <label htmlFor="refreshInterval">刷新间隔（分钟）</label>
            <input
              id="refreshInterval"
              type="number"
              min="1"
              value={config.globalSettings.refreshInterval / 60000}
              onChange={(e) =>
                updateContentSettings({
                  refreshInterval: parseInt(e.target.value) * 60000,
                })
              }
            />
          </div>
          <div className="form-group">
            <label htmlFor="requestDelay">请求间隔（毫秒）</label>
            <input
              id="requestDelay"
              type="number"
              min="1000"
              max="10000"
              step="1000"
              value={config.platformSettings.bilibili.requestDelay}
              onChange={(e) => {
                const updates = {
                  platformSettings: {
                    ...config.platformSettings,
                    bilibili: {
                      ...config.platformSettings.bilibili,
                      requestDelay: parseInt(e.target.value) || 15000,
                    },
                  },
                };
                saveConfig(updates);
              }}
            />
            <small>
              设置API请求之间的间隔时间，避免触发频率限制（建议15000毫秒以上）
            </small>
          </div>
          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={config.globalSettings.shuffleEnabled}
                onChange={(e) =>
                  updateContentSettings({
                    shuffleEnabled: e.target.checked,
                  })
                }
              />
              <span>启用内容洗牌</span>
            </label>
          </div>
          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={config.platformSettings.bilibili.concurrentRequests}
                onChange={(e) => {
                  const updates = {
                    platformSettings: {
                      ...config.platformSettings,
                      bilibili: {
                        ...config.platformSettings.bilibili,
                        concurrentRequests: e.target.checked,
                      },
                    },
                  };
                  saveConfig(updates);
                }}
              />
              <span>启用并发请求</span>
            </label>
            <small>
              启用后可加快后台更新速度，但可能触发B站频率限制（强烈建议关闭）
            </small>
          </div>
          {config.platformSettings.bilibili.concurrentRequests && (
            <div className="form-group">
              <label htmlFor="concurrentLimit">并发数量</label>
              <input
                id="concurrentLimit"
                type="number"
                min="1"
                max="3"
                value={config.platformSettings.bilibili.concurrentLimit}
                onChange={(e) => {
                  const updates = {
                    platformSettings: {
                      ...config.platformSettings,
                      bilibili: {
                        ...config.platformSettings.bilibili,
                        concurrentLimit: parseInt(e.target.value) || 1,
                      },
                    },
                  };
                  saveConfig(updates);
                }}
              />
              <small>同时进行的最大请求数量（建议设置为1，避免请求失败）</small>
            </div>
          )}
        </section>

        <section className="settings-section">
          <h2>界面设置</h2>
          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={config.uiSettings.showNotifications}
                onChange={(e) =>
                  updateUISettings({
                    showNotifications: e.target.checked,
                  })
                }
              />
              <span>显示通知</span>
            </label>
          </div>
          <div className="form-group">
            <label htmlFor="theme">主题</label>
            <select
              id="theme"
              value={config.uiSettings.theme}
              onChange={(e) =>
                updateUISettings({
                  theme: e.target.value as "light" | "dark" | "auto",
                })
              }
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
            <button onClick={() => window.open("dashboard.html", "_blank")}>
              查看面板
            </button>
            <button
              onClick={() => ChromeExtensionApi.sendMessage("clearCache")}
            >
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
const container = document.getElementById("app");
if (container) {
  const root = createRoot(container);
  root.render(<OptionsPage />);
}

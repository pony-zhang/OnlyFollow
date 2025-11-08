import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import type { UserConfig, ContentItem, FollowedUser, Platform } from '../shared/types';
import { ChromeExtensionApi } from '../shared/utils/api';
import { NumberFormatter, DateFormatter } from '../shared/utils/format';

interface DashboardState {
  config: UserConfig | null;
  isLoading: boolean;
  error: string | null;

  // 数据状态
  followedUsers: FollowedUser[];
  cachedContent: ContentItem[];
  engineStatus: any;
  cacheStats: any;

  // 界面状态
  selectedPlatform: Platform | 'all';
  selectedView: 'users' | 'content' | 'stats';
  searchQuery: string;
}

// 主面板组件
function Dashboard() {
  const [state, setState] = useState<DashboardState>({
    config: null,
    isLoading: true,
    error: null,
    followedUsers: [],
    cachedContent: [],
    engineStatus: null,
    cacheStats: null,
    selectedPlatform: 'all',
    selectedView: 'users',
    searchQuery: '',
  });

  // 初始化数据
  useEffect(() => {
    initializeData();
  }, []);

  const initializeData = async () => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));

      // 并行获取所有数据
      const [config, followedUsers, cachedContent, engineStatus, cacheStats] = await Promise.all([
        ChromeExtensionApi.sendMessage('getConfig'),
        ChromeExtensionApi.sendMessage('getFollowedUsers').catch(() => []),
        ChromeExtensionApi.sendMessage('getCachedContent').catch(() => []),
        ChromeExtensionApi.sendMessage('getEngineStatus').catch(() => null),
        ChromeExtensionApi.sendMessage('getCacheStats').catch(() => null),
      ]);

      setState(prev => ({
        ...prev,
        config,
        followedUsers,
        cachedContent,
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

  // 刷新数据
  const refreshData = async () => {
    await initializeData();
  };

  // 清除缓存
  const clearCache = async (platform?: Platform) => {
    try {
      await ChromeExtensionApi.sendMessage('clearCache', { platform });
      await refreshData();
    } catch (error) {
      console.error('清除缓存失败:', error);
    }
  };

  // 过滤数据
  const filteredUsers = (state.followedUsers || []).filter(user =>
    state.selectedPlatform === 'all' || user.platform === state.selectedPlatform
  ).filter(user =>
    !state.searchQuery ||
    (user.displayName || '').toLowerCase().includes(state.searchQuery.toLowerCase()) ||
    (user.username || '').toLowerCase().includes(state.searchQuery.toLowerCase())
  );

  const filteredContent = (state.cachedContent || []).filter(content =>
    state.selectedPlatform === 'all' || content.platform === state.selectedPlatform
  ).filter(content =>
    !state.searchQuery ||
    content.title.toLowerCase().includes(state.searchQuery.toLowerCase()) ||
    (content.author?.displayName || '').toLowerCase().includes(state.searchQuery.toLowerCase())
  );

  // 渲染加载状态
  if (state.isLoading) {
    return (
      <div className="dashboard-container">
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
      <div className="dashboard-container">
        <div className="error">
          <h2>加载失败</h2>
          <p>{state.error}</p>
          <button onClick={refreshData}>重试</button>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1>OnlyFocus 查看面板</h1>
        <div className="header-actions">
          <button onClick={refreshData} className="refresh-btn">
            🔄 刷新数据
          </button>
          <button onClick={() => window.open('options.html', '_blank')} className="settings-btn">
            ⚙️ 设置
          </button>
          <button onClick={() => window.close()} className="close-btn">
            ✕ 关闭
          </button>
        </div>
      </header>

      <div className="dashboard-controls">
        <div className="view-selector">
          <button
            className={`view-btn ${state.selectedView === 'users' ? 'active' : ''}`}
            onClick={() => setState(prev => ({ ...prev, selectedView: 'users' }))}
          >
            关注用户 ({filteredUsers.length})
          </button>
          <button
            className={`view-btn ${state.selectedView === 'content' ? 'active' : ''}`}
            onClick={() => setState(prev => ({ ...prev, selectedView: 'content' }))}
          >
            缓存内容 ({filteredContent.length})
          </button>
          <button
            className={`view-btn ${state.selectedView === 'stats' ? 'active' : ''}`}
            onClick={() => setState(prev => ({ ...prev, selectedView: 'stats' }))}
          >
            统计信息
          </button>
        </div>

        <div className="filters">
          <select
            value={state.selectedPlatform}
            onChange={(e) => setState(prev => ({
              ...prev,
              selectedPlatform: e.target.value as Platform | 'all'
            }))}
          >
            <option value="all">所有平台</option>
            <option value="bilibili">哔哩哔哩</option>
            <option value="youtube">YouTube</option>
            <option value="twitter">Twitter/X</option>
            <option value="instagram">Instagram</option>
          </select>

          <input
            type="text"
            placeholder="搜索..."
            value={state.searchQuery}
            onChange={(e) => setState(prev => ({ ...prev, searchQuery: e.target.value }))}
          />
        </div>
      </div>

      <div className="dashboard-content">
        {state.selectedView === 'users' && (
          <UsersView users={filteredUsers} onClearCache={clearCache} />
        )}
        {state.selectedView === 'content' && (
          <ContentView content={filteredContent} onClearCache={clearCache} />
        )}
        {state.selectedView === 'stats' && (
          <StatsView
            config={state.config}
            engineStatus={state.engineStatus}
            cacheStats={state.cacheStats}
            onClearCache={clearCache}
          />
        )}
      </div>
    </div>
  );
}

// 用户视图组件
function UsersView({ users, onClearCache }: {
  users: FollowedUser[];
  onClearCache: (platform?: Platform) => void;
}) {
  if (users.length === 0) {
    return (
      <div className="empty-state">
        <p>暂无关注用户数据</p>
      </div>
    );
  }

  return (
    <div className="users-view">
      <div className="view-header">
        <h3>关注用户</h3>
        <div className="view-actions">
          {Array.from(new Set((users || []).map(u => u.platform))).map(platform => (
            <button
              key={platform}
              onClick={() => onClearCache(platform)}
              className="clear-cache-btn"
            >
              清除 {platform} 缓存
            </button>
          ))}
        </div>
      </div>

      <div className="users-grid">
        {users.map(user => (
          <div key={user.id} className="user-card">
            <div className="user-avatar">
              {user.avatar ? (
                <img src={user.avatar} alt={user.displayName || '用户'} />
              ) : (
                <div className="avatar-placeholder">
                  {(user.displayName || 'U').charAt(0).toUpperCase()}
                </div>
              )}
              {user.verified && <div className="verified-badge">✓</div>}
            </div>
            <div className="user-info">
              <h4 className="user-name">{user.displayName || '未知用户'}</h4>
              <p className="user-username">@{user.username || 'unknown'}</p>
              <p className="user-platform">{user.platform || 'unknown'}</p>
            </div>
            <div className="user-actions">
              <a
                href={`https://www.${user.platform === 'bilibili' ? 'bilibili.com' :
                                   user.platform === 'youtube' ? 'youtube.com' :
                                   user.platform === 'twitter' ? 'twitter.com' :
                                   'instagram.com'}/${user.platformId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="user-link"
              >
                查看主页
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// 内容视图组件
function ContentView({ content, onClearCache }: {
  content: ContentItem[];
  onClearCache: (platform?: Platform) => void;
}) {
  if (content.length === 0) {
    return (
      <div className="empty-state">
        <p>暂无缓存内容</p>
      </div>
    );
  }

  return (
    <div className="content-view">
      <div className="view-header">
        <h3>缓存内容</h3>
        <div className="view-actions">
          {Array.from(new Set((content || []).map(c => c.platform))).map(platform => (
            <button
              key={platform}
              onClick={() => onClearCache(platform)}
              className="clear-cache-btn"
            >
              清除 {platform} 缓存
            </button>
          ))}
        </div>
      </div>

      <div className="content-list">
        {content.map(item => (
          <div key={item.id} className="content-card">
            <div className="content-thumbnail">
              {item.thumbnail && (
                <img src={item.thumbnail} alt={item.title} />
              )}
              <div className="content-type">{item.type}</div>
            </div>
            <div className="content-info">
              <h4 className="content-title">
                <a href={item.url} target="_blank" rel="noopener noreferrer">
                  {item.title}
                </a>
              </h4>
              <p className="content-author">
                作者: {item.author?.displayName || '未知'}
              </p>
              <p className="content-time">
                发布时间: {DateFormatter.formatAbsolute(item.publishedAt)}
              </p>
              {item.metrics && (
                <div className="content-metrics">
                  {item.metrics.views && (
                    <span className="metric">
                      👁 {NumberFormatter.formatLarge(item.metrics.views)}
                    </span>
                  )}
                  {item.metrics.likes && (
                    <span className="metric">
                      👍 {NumberFormatter.formatLarge(item.metrics.likes)}
                    </span>
                  )}
                  {item.metrics.comments && (
                    <span className="metric">
                      💬 {NumberFormatter.formatLarge(item.metrics.comments)}
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="content-platform">
              {item.platform}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// 统计视图组件
function StatsView({ config, engineStatus, cacheStats, onClearCache }: {
  config: UserConfig | null;
  engineStatus: any;
  cacheStats: any;
  onClearCache: (platform?: Platform) => void;
}) {
  return (
    <div className="stats-view">
      <div className="stats-section">
        <h3>配置信息</h3>
        {config && (
          <div className="stats-grid">
            <div className="stat-card">
              <h4>启用的平台</h4>
              <p>{config.enabledPlatforms.join(', ')}</p>
            </div>
            <div className="stat-card">
              <h4>最大内容数量</h4>
              <p>{config.contentSettings.maxItems}</p>
            </div>
            <div className="stat-card">
              <h4>刷新间隔</h4>
              <p>{config.contentSettings.refreshInterval / 60000} 分钟</p>
            </div>
            <div className="stat-card">
              <h4>内容洗牌</h4>
              <p>{config.contentSettings.shuffleEnabled ? '启用' : '禁用'}</p>
            </div>
            <div className="stat-card">
              <h4>显示通知</h4>
              <p>{config.uiSettings.showNotifications ? '启用' : '禁用'}</p>
            </div>
            <div className="stat-card">
              <h4>主题</h4>
              <p>{config.uiSettings.theme}</p>
            </div>
          </div>
        )}
      </div>

      {engineStatus && (
        <div className="stats-section">
          <h3>引擎状态</h3>
          <div className="stats-grid">
            <div className="stat-card">
              <h4>运行状态</h4>
              <p className={engineStatus.isRunning ? 'status-running' : 'status-stopped'}>
                {engineStatus.isRunning ? '运行中' : '已停止'}
              </p>
            </div>
            {engineStatus.lastRefresh > 0 && (
              <div className="stat-card">
                <h4>上次刷新</h4>
                <p>{new Date(engineStatus.lastRefresh).toLocaleString()}</p>
              </div>
            )}
            {engineStatus.uptime > 0 && (
              <div className="stat-card">
                <h4>运行时长</h4>
                <p>{Math.floor(engineStatus.uptime / 1000)} 秒</p>
              </div>
            )}
          </div>
        </div>
      )}

      {cacheStats && (
        <div className="stats-section">
          <h3>缓存统计</h3>
          <div className="stats-grid">
            {Object.entries(cacheStats.stats || {}).map(([platform, count]) => (
              <div key={platform} className="stat-card">
                <h4>{platform}</h4>
                <p>{count} 条缓存</p>
              </div>
            ))}
            {cacheStats.storageUsage && (
              <div className="stat-card">
                <h4>存储使用</h4>
                <p>{cacheStats.storageUsage.percentage.toFixed(1)}%</p>
                <p>
                  {Math.round(cacheStats.storageUsage.used / 1024)}KB /
                  {Math.round(cacheStats.storageUsage.available / 1024)}KB
                </p>
              </div>
            )}
          </div>

          <div className="cache-actions">
            <button onClick={() => onClearCache()}>
              清除所有缓存
            </button>
            {Object.keys(cacheStats.stats || {}).map(platform => (
              <button key={platform} onClick={() => onClearCache(platform as Platform)}>
                清除 {platform} 缓存
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// 渲染应用
const container = document.getElementById('app');
if (container) {
  const root = createRoot(container);
  root.render(<Dashboard />);
}
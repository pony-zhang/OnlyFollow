import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import type {
  UserConfig,
  ContentItem,
  FollowedUser,
  Platform,
} from "../shared/types";
import { ChromeExtensionApi } from "../shared/utils/api";
import { NumberFormatter, DateFormatter } from "../shared/utils/format";

interface DashboardState {
  config: UserConfig | null;
  isLoading: boolean;
  error: string | null;

  // 数据状态
  followedUsers: FollowedUser[];
  engineStatus: any;
  cacheStats: any;

  // 界面状态
  selectedPlatform: Platform | "all";
  selectedView: "users" | "stats";
  searchQuery: string;

  // 排序状态
  userSortBy: "name" | "platform" | "cacheCount" | "updatedAt";
  userSortOrder: "asc" | "desc";
  contentSortBy: "title" | "publishedAt" | "views" | "likes" | "duration";
  contentSortOrder: "asc" | "desc";
}

// 主面板组件
function Dashboard() {
  const [state, setState] = useState<DashboardState>({
    config: null,
    isLoading: true,
    error: null,
    followedUsers: [],
    engineStatus: null,
    cacheStats: null,
    selectedPlatform: "all",
    selectedView: "users",
    searchQuery: "",
    userSortBy: "updatedAt",
    userSortOrder: "desc",
    contentSortBy: "publishedAt",
    contentSortOrder: "desc",
  });

  // 初始化数据
  useEffect(() => {
    initializeData();
  }, []);

  const initializeData = async () => {
    try {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      // 等待背景脚本准备就绪
      await waitForBackgroundReady();

      // 并行获取所有数据
      const results = await Promise.allSettled([
        ChromeExtensionApi.sendMessage("getConfig"),
        ChromeExtensionApi.sendMessage("getFollowedUsers"),
        ChromeExtensionApi.sendMessage("getEngineStatus"),
        ChromeExtensionApi.sendMessage("getCacheStats"),
      ]);

      const config =
        results[0].status === "fulfilled" ? results[0].value : null;
      const followedUsers =
        results[1].status === "fulfilled" && Array.isArray(results[1].value)
          ? results[1].value
          : [];
      const engineStatus =
        results[2].status === "fulfilled" ? results[2].value : null;
      const cacheStats =
        results[3].status === "fulfilled" ? results[3].value : null;

      console.log("[Dashboard] 获取到的数据:", {
        followedUsersCount: followedUsers.length,
        engineStatus,
        cacheStats,
      });

      setState((prev) => ({
        ...prev,
        config,
        followedUsers,
        engineStatus,
        cacheStats,
        isLoading: false,
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : "加载失败",
      }));
    }
  };

  // 等待背景脚本准备就绪
  const waitForBackgroundReady = async (maxRetries = 10): Promise<void> => {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const health = await ChromeExtensionApi.sendMessage("healthCheck");
        if (health?.status === "ready") {
          return;
        }
      } catch (error) {
        // 背景脚本可能还没准备好，继续等待
      }

      // 等待一段时间后重试
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    throw new Error("背景脚本未能及时响应，请刷新页面重试");
  };

  // 刷新数据
  const refreshData = async () => {
    await initializeData();
  };

  // 清除缓存
  const clearCache = async (platform?: Platform) => {
    try {
      await ChromeExtensionApi.sendMessage("clearCache", { platform });
      await refreshData();
    } catch (error) {
      console.error("清除缓存失败:", error);
    }
  };

  // 删除用户
  const deleteUser = async (
    userId: string,
    platform: Platform,
    userName: string,
  ) => {
    try {
      await ChromeExtensionApi.sendMessage("deleteUser", { userId, platform });
      console.log(`用户 ${userName} 删除成功`);
      await refreshData(); // 刷新数据
    } catch (error) {
      console.error("删除用户失败:", error);
    }
  };

  // 过滤数据 - 添加完整的防御性检查
  const filteredUsers = Array.isArray(state.followedUsers)
    ? state.followedUsers.filter(
        (user) =>
          user &&
          (state.selectedPlatform === "all" ||
            user.platform === state.selectedPlatform) &&
          (!state.searchQuery ||
            (user.displayName &&
              user.displayName
                .toLowerCase()
                .includes(state.searchQuery.toLowerCase())) ||
            (user.username &&
              user.username
                .toLowerCase()
                .includes(state.searchQuery.toLowerCase()))),
      )
    : [];

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
        <h1>OnlyFollow 查看面板</h1>
        <div className="header-actions">
          <button onClick={refreshData} className="refresh-btn">
            🔄 刷新数据
          </button>
          <button
            onClick={() => window.open("options.html", "_blank")}
            className="settings-btn"
          >
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
            className={`view-btn ${state.selectedView === "users" ? "active" : ""}`}
            onClick={() =>
              setState((prev) => ({ ...prev, selectedView: "users" }))
            }
          >
            关注用户 ({filteredUsers.length})
          </button>
          <button
            className={`view-btn ${state.selectedView === "stats" ? "active" : ""}`}
            onClick={() =>
              setState((prev) => ({ ...prev, selectedView: "stats" }))
            }
          >
            统计信息
          </button>
        </div>

        <div className="filters">
          <select
            value={state.selectedPlatform}
            onChange={(e) =>
              setState((prev) => ({
                ...prev,
                selectedPlatform: e.target.value as Platform | "all",
              }))
            }
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
            onChange={(e) =>
              setState((prev) => ({ ...prev, searchQuery: e.target.value }))
            }
          />
        </div>
      </div>

      <div className="dashboard-content">
        {state.selectedView === "users" && (
          <UsersView
            users={filteredUsers}
            onClearCache={clearCache}
            sortBy={state.userSortBy}
            sortOrder={state.userSortOrder}
            onSortChange={(sortBy, sortOrder) =>
              setState((prev) => ({
                ...prev,
                userSortBy: sortBy,
                userSortOrder: sortOrder,
              }))
            }
            onDeleteUser={deleteUser}
          />
        )}
        {state.selectedView === "stats" && (
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
function UsersView({
  users,
  onClearCache,
  sortBy,
  sortOrder,
  onSortChange,
  onDeleteUser,
}: {
  users: FollowedUser[];
  onClearCache: (platform?: Platform) => void;
  sortBy: string;
  sortOrder: "asc" | "desc";
  onSortChange: (sortBy: string, sortOrder: "asc" | "desc") => void;
  onDeleteUser: (userId: string, platform: Platform, userName: string) => void;
}) {
  const safeUsers = users || [];
  const [selectedUser, setSelectedUser] = useState<FollowedUser | null>(null);
  const [userContent, setUserContent] = useState<ContentItem[]>([]);
  const [userCacheCounts, setUserCacheCounts] = useState<Map<string, number>>(
    new Map(),
  );
  const [contentSearchQuery, setContentSearchQuery] = useState("");
  const [contentSortBy, setContentSortBy] = useState("publishedAt");
  const [contentSortOrder, setContentSortOrder] = useState<"asc" | "desc">(
    "desc",
  );
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<{
    userId: string;
    platform: Platform;
    userName: string;
  } | null>(null);

  // 排序和过滤辅助函数
  const sortUsers = (
    users: FollowedUser[],
    sortBy: string,
    sortOrder: "asc" | "desc",
    cacheCounts: Map<string, number>,
  ): FollowedUser[] => {
    return [...users].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortBy) {
        case "name":
          aValue = (a.displayName || "").toLowerCase();
          bValue = (b.displayName || "").toLowerCase();
          break;
        case "platform":
          aValue = a.platform;
          bValue = b.platform;
          break;
        case "cacheCount":
          aValue = cacheCounts.get(a.id) || 0;
          bValue = cacheCounts.get(b.id) || 0;
          break;
        case "updatedAt":
          aValue = a.updatedAt || 0;
          bValue = b.updatedAt || 0;
          break;
        default:
          return 0;
      }

      if (aValue < bValue) {
        return sortOrder === "asc" ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortOrder === "asc" ? 1 : -1;
      }
      return 0;
    });
  };

  const sortContent = (
    content: ContentItem[],
    sortBy: string,
    sortOrder: "asc" | "desc",
  ): ContentItem[] => {
    return [...content].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortBy) {
        case "title":
          aValue = (a.title || "").toLowerCase();
          bValue = (b.title || "").toLowerCase();
          break;
        case "publishedAt":
          aValue = a.publishedAt || 0;
          bValue = b.publishedAt || 0;
          break;
        case "views":
          aValue = a.metrics?.views || 0;
          bValue = b.metrics?.views || 0;
          break;
        case "likes":
          aValue = a.metrics?.likes || 0;
          bValue = b.metrics?.likes || 0;
          break;
        case "duration":
          aValue = a.duration || 0;
          bValue = b.duration || 0;
          break;
        default:
          return 0;
      }

      if (aValue < bValue) {
        return sortOrder === "asc" ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortOrder === "asc" ? 1 : -1;
      }
      return 0;
    });
  };

  // 获取用户的缓存数量
  const getUserCacheCount = async (user: FollowedUser): Promise<number> => {
    try {
      const cacheKey = `onlyfollow_${user.platform}_videos_${user.platformId}`;
      const cacheItem = await chrome.storage.local.get(cacheKey);

      if (
        cacheItem[cacheKey] &&
        cacheItem[cacheKey].data &&
        Array.isArray(cacheItem[cacheKey].data)
      ) {
        return cacheItem[cacheKey].data.length;
      }
      return 0;
    } catch (error) {
      console.error(`获取用户 ${user.displayName} 缓存数量失败:`, error);
      return 0;
    }
  };

  // 初始化时获取所有用户的缓存数量
  useEffect(() => {
    const loadCacheCounts = async () => {
      const counts = new Map<string, number>();

      for (const user of safeUsers) {
        const count = await getUserCacheCount(user);
        counts.set(user.id, count);
      }

      setUserCacheCounts(counts);
    };

    if (safeUsers.length > 0) {
      loadCacheCounts();
    }
  }, [safeUsers]);

  // 应用排序到用户列表
  const sortedUsers = sortUsers(safeUsers, sortBy, sortOrder, userCacheCounts);

  // 过滤内容列表
  const filteredContent = userContent.filter(
    (item) =>
      item &&
      (!contentSearchQuery ||
        (item.title &&
          item.title
            .toLowerCase()
            .includes(contentSearchQuery.toLowerCase())) ||
        (item.description &&
          item.description
            .toLowerCase()
            .includes(contentSearchQuery.toLowerCase()))),
  );

  // 应用排序到内容列表
  const sortedContent = sortContent(
    filteredContent,
    contentSortBy,
    contentSortOrder,
  );

  if (safeUsers.length === 0) {
    return (
      <div className="empty-state">
        <p>暂无关注用户数据</p>
      </div>
    );
  }

  // 获取用户的内容
  const handleUserClick = async (user: FollowedUser) => {
    try {
      console.log(`[UsersView] 获取用户 ${user.displayName} 的内容`);

      // 直接从Chrome存储获取该用户的视频缓存
      const cacheKey = `onlyfollow_${user.platform}_videos_${user.platformId}`;
      const cacheItem = await chrome.storage.local.get(cacheKey);

      if (
        cacheItem[cacheKey] &&
        cacheItem[cacheKey].data &&
        Array.isArray(cacheItem[cacheKey].data)
      ) {
        const content = cacheItem[cacheKey].data;
        console.log(`[UsersView] 获取到 ${content.length} 个内容`);
        setUserContent(content);
        setSelectedUser(user);
      } else {
        console.log(`[UsersView] 用户 ${user.displayName} 没有缓存的内容`);
        setUserContent([]);
        setSelectedUser(user);
      }
    } catch (error) {
      console.error(`[UsersView] 获取用户内容失败:`, error);
      setUserContent([]);
      setSelectedUser(user);
    }
  };

  // 返回用户列表
  const handleBack = () => {
    setSelectedUser(null);
    setUserContent([]);
  };

  // 处理删除用户
  const handleDeleteUser = (user: FollowedUser) => {
    setDeleteConfirmUser({
      userId: user.id,
      platform: user.platform,
      userName: user.displayName || user.username || "未知用户",
    });
  };

  // 确认删除用户
  const confirmDeleteUser = () => {
    if (deleteConfirmUser) {
      onDeleteUser(
        deleteConfirmUser.userId,
        deleteConfirmUser.platform,
        deleteConfirmUser.userName,
      );
      setDeleteConfirmUser(null);
    }
  };

  // 取消删除
  const cancelDeleteUser = () => {
    setDeleteConfirmUser(null);
  };

  // 显示单个用户的详细内容
  if (selectedUser) {
    return (
      <div className="user-detail-view">
        <div className="user-detail-header">
          <button onClick={handleBack} className="back-btn">
            ← 返回列表
          </button>
          <div className="user-detail-info">
            <div className="user-avatar">
              {selectedUser.avatar ? (
                <img
                  src={selectedUser.avatar}
                  alt={selectedUser.displayName || "用户"}
                />
              ) : (
                <div className="avatar-placeholder">
                  {(selectedUser.displayName || "U").charAt(0).toUpperCase()}
                </div>
              )}
              {selectedUser.verified && <div className="verified-badge">✓</div>}
            </div>
            <div className="user-detail-text">
              <h3>{selectedUser.displayName || "未知用户"}</h3>
              <p>@{selectedUser.username || "unknown"}</p>
              <p className="content-count">缓存内容: {userContent.length} 个</p>
            </div>
          </div>
        </div>

        <div className="content-controls">
          <div className="content-search">
            <input
              type="text"
              placeholder="搜索内容..."
              value={contentSearchQuery}
              onChange={(e) => setContentSearchQuery(e.target.value)}
              className="content-search-input"
            />
          </div>
          <div className="content-sort">
            <select
              value={contentSortBy}
              onChange={(e) => setContentSortBy(e.target.value)}
              className="content-sort-select"
            >
              <option value="publishedAt">发布时间</option>
              <option value="title">标题</option>
              <option value="views">观看次数</option>
              <option value="likes">点赞数</option>
              <option value="duration">时长</option>
            </select>
            <button
              onClick={() =>
                setContentSortOrder(contentSortOrder === "asc" ? "desc" : "asc")
              }
              className="content-sort-order"
            >
              {contentSortOrder === "asc" ? "↑" : "↓"}
            </button>
          </div>
        </div>

        <div className="user-content-list">
          {sortedContent.length === 0 ? (
            <div className="empty-state">
              <p>
                {contentSearchQuery ? "未找到匹配的内容" : "该用户暂无缓存内容"}
              </p>
            </div>
          ) : (
            sortedContent.map((item) => (
              <div key={item.id} className="content-card">
                <div className="content-thumbnail">
                  {item.thumbnail && (
                    <img src={item.thumbnail} alt={item.title || "内容"} />
                  )}
                  <div className="content-type">{item.type || "unknown"}</div>
                </div>
                <div className="content-info">
                  <h4 className="content-title">
                    <a
                      href={item.url || "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {item.title || "无标题"}
                    </a>
                  </h4>
                  <p className="content-time">
                    发布时间:{" "}
                    {item.publishedAt
                      ? DateFormatter.formatAbsolute(item.publishedAt)
                      : "未知"}
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
                          💬{" "}
                          {NumberFormatter.formatLarge(item.metrics.comments)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                {item.duration && (
                  <div className="content-duration">
                    {DateFormatter.formatDuration(item.duration)}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="users-view">
      <div className="view-header">
        <h3>关注用户</h3>
        <div className="view-header-controls">
          <div className="user-sort">
            <select
              value={sortBy}
              onChange={(e) => onSortChange(e.target.value, sortOrder)}
              className="user-sort-select"
            >
              <option value="updatedAt">更新时间</option>
              <option value="name">名称</option>
              <option value="platform">平台</option>
              <option value="cacheCount">缓存数量</option>
            </select>
            <button
              onClick={() =>
                onSortChange(sortBy, sortOrder === "asc" ? "desc" : "asc")
              }
              className="user-sort-order"
            >
              {sortOrder === "asc" ? "↑" : "↓"}
            </button>
          </div>
          <div className="view-actions">
            {Array.from(new Set(safeUsers.map((u) => u.platform))).map(
              (platform) => (
                <button
                  key={platform}
                  onClick={() => onClearCache(platform)}
                  className="clear-cache-btn"
                >
                  清除 {platform} 缓存
                </button>
              ),
            )}
          </div>
        </div>
      </div>

      <div className="users-grid">
        {sortedUsers.map((user) => (
          <div
            key={user.id}
            className="user-card clickable"
            onClick={() => handleUserClick(user)}
          >
            <div className="user-avatar">
              {user.avatar ? (
                <img src={user.avatar} alt={user.displayName || "用户"} />
              ) : (
                <div className="avatar-placeholder">
                  {(user.displayName || "U").charAt(0).toUpperCase()}
                </div>
              )}
              {user.verified && <div className="verified-badge">✓</div>}
            </div>
            <div className="user-info">
              <h4 className="user-name">{user.displayName || "未知用户"}</h4>
              <p className="user-username">@{user.username || "unknown"}</p>
              <p className="user-platform">{user.platform || "unknown"}</p>
              <div className="user-cache-indicator">
                <span className="cache-badge">
                  缓存: {userCacheCounts.get(user.id) || 0} 个视频
                </span>
              </div>
            </div>
            <div className="user-actions">
              <a
                href={`https://www.${
                  user.platform === "bilibili"
                    ? "bilibili.com"
                    : user.platform === "youtube"
                      ? "youtube.com"
                      : user.platform === "twitter"
                        ? "twitter.com"
                        : "instagram.com"
                }/${user.platformId || ""}`}
                target="_blank"
                rel="noopener noreferrer"
                className="user-link"
                onClick={(e) => e.stopPropagation()}
              >
                查看主页
              </a>
              <button
                className="delete-user-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteUser(user);
                }}
                title="删除该用户及其所有缓存数据"
              >
                🗑️
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* 删除确认对话框 */}
      {deleteConfirmUser && (
        <div className="confirm-dialog-overlay">
          <div className="confirm-dialog">
            <div className="confirm-dialog-header">
              <h3>确认删除用户</h3>
              <button className="close-btn" onClick={cancelDeleteUser}>
                ✕
              </button>
            </div>
            <div className="confirm-dialog-body">
              <p>您确定要删除以下用户吗？</p>
              <div className="user-info-summary">
                <strong>{deleteConfirmUser.userName}</strong>
                <span className="platform-tag">
                  {deleteConfirmUser.platform}
                </span>
              </div>
              <p className="warning-text">
                ⚠️ 此操作将删除该用户的所有缓存数据，包括：
              </p>
              <ul className="delete-list">
                <li>该用户的关注关系</li>
                <li>该用户的所有视频内容缓存</li>
                <li>相关的统计信息</li>
              </ul>
              <p className="irreversible-warning">
                此操作 <strong>不可恢复</strong>，请谨慎操作！
              </p>
            </div>
            <div className="confirm-dialog-actions">
              <button className="cancel-btn" onClick={cancelDeleteUser}>
                取消
              </button>
              <button className="delete-btn" onClick={confirmDeleteUser}>
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 统计视图组件
function StatsView({
  config,
  engineStatus,
  cacheStats,
  onClearCache,
}: {
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
              <p>{(config.enabledPlatforms || []).join(", ")}</p>
            </div>
            <div className="stat-card">
              <h4>最大内容数量</h4>
              <p>{config.globalSettings?.maxItemsPerPlatform || 20}</p>
            </div>
            <div className="stat-card">
              <h4>刷新间隔</h4>
              <p>
                {config.globalSettings?.refreshInterval
                  ? config.globalSettings.refreshInterval / 60000
                  : 30}{" "}
                分钟
              </p>
            </div>
            <div className="stat-card">
              <h4>内容洗牌</h4>
              <p>{config.globalSettings?.shuffleEnabled ? "启用" : "禁用"}</p>
            </div>
            <div className="stat-card">
              <h4>显示通知</h4>
              <p>{config.uiSettings.showNotifications ? "启用" : "禁用"}</p>
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
              <p
                className={
                  engineStatus.isRunning ? "status-running" : "status-stopped"
                }
              >
                {engineStatus.isRunning ? "运行中" : "已停止"}
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
            <button onClick={() => onClearCache()}>清除所有缓存</button>
            {Object.keys(cacheStats.stats || {}).map((platform) => (
              <button
                key={platform}
                onClick={() => onClearCache(platform as Platform)}
              >
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
const container = document.getElementById("app");
if (container) {
  const root = createRoot(container);
  root.render(<Dashboard />);
}

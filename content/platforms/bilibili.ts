import type {
  PlatformAdapter,
  FollowedUser,
  ContentItem,
} from "../../shared/types";
import {
  PLATFORM_CONFIG,
  CACHE_CONFIG,
  ERROR_MESSAGES,
} from "../../shared/constants";
import { StorageManager } from "../../shared/utils/storage";
import { apiClient } from "../../shared/utils/api";
import { DOMUtils, ContentReplacer } from "../../shared/utils/dom";
import { NumberFormatter, DateFormatter } from "../../shared/utils/format";
import { configManager } from "../../core/config/ConfigManager";

export class BilibiliAdapter implements PlatformAdapter {
  readonly platform = "bilibili" as const;

  private readonly config = PLATFORM_CONFIG.bilibili;
  private readonly maxUpSers = 100;
  private readonly videosPerUp = 2;
  private readonly totalVideosNeeded = 20;
  private readonly minUpsNeeded = 15;
  private requestDelay = 15000; // 默认15秒，B站API限制极其严格，将从配置中读取
  private concurrentRequests = false; // 默认关闭并发，B站限制严格
  private concurrentLimit = 1; // 并发限制，避免请求失败
  private rateLimitHitCount = 0; // 频率限制命中计数
  private lastRateLimitTime = 0; // 上次频率限制时间

  // 换一换功能相关状态
  private currentCachedVideos: ContentItem[] = []; // 当前可用的缓存视频池
  private displayedVideoIds: Set<string> = new Set(); // 已显示的视频ID，避免重复
  private refreshButtonHandler: (() => void) | null = null; // 换一换按钮的事件处理器

  // 检查是否在B站页面
  isActive(): boolean {
    return window.location.hostname.includes("bilibili.com");
  }

  // 检查是否登录
  private async isLogin(): Promise<boolean> {
    console.log("[Bilibili] ===== 开始登录检测 =====");

    try {
      console.log("[Bilibili] 步骤1: 检查document.cookie");

      // 1. 检查document.cookie
      const docCookies = document.cookie;
      console.log(
        "[Bilibili] document.cookie包含:",
        docCookies ? "有内容" : "无内容",
      );
      console.log("[Bilibili] document.cookie详细:", docCookies);

      if (
        docCookies &&
        (docCookies.includes("SESSDATA") || docCookies.includes("DedeUserID"))
      ) {
        console.log("[Bilibili] ✅ document.cookie检测到登录状态");
        return true;
      }

      console.log("[Bilibili] 步骤2: 检查页面元素");

      // 2. 检查页面元素
      const hasUserInfo = !!(
        document.querySelector(".nav-user-info") ||
        document.querySelector(".user-con") ||
        document.querySelector(".header-avatar-wrap") ||
        document.querySelector(".header-entry-wrap") ||
        document.querySelector(".user-avatar")
      );

      console.log("[Bilibili] 页面元素检测结果:", hasUserInfo);
      if (hasUserInfo) {
        console.log("[Bilibili] ✅ 页面元素检测到登录状态");
        return true;
      }

      console.log("[Bilibili] 步骤3: 检查Chrome API获取的cookies");

      // 3. 检查Chrome API获取的cookies
      const cookies = await this.getCookies();
      console.log("[Bilibili] Chrome API获取到cookies数量:", cookies.length);

      const hasSessData = cookies.some((cookie) => cookie.name === "SESSDATA");
      const hasDedeUserId = cookies.some(
        (cookie) => cookie.name === "DedeUserID",
      );
      const hasSessionData = hasSessData || hasDedeUserId;

      console.log("[Bilibili] Chrome API检测结果:", {
        hasSessData,
        hasDedeUserId,
        hasSessionData,
        cookieNames: cookies.map((c) => c.name),
      });

      if (hasSessionData) {
        console.log("[Bilibili] ✅ Chrome API检测到登录状态");
      } else {
        console.log("[Bilibili] ❌ Chrome API未检测到登录状态");
      }

      console.log(
        "[Bilibili] ===== 登录检测完成，结果:",
        hasSessionData,
        " =====",
      );
      return hasSessionData;
    } catch (error) {
      console.error("[Bilibili] ❌ 检查登录状态失败:", error);
      console.log("[Bilibili] ===== 登录检测异常，返回false =====");
      return false;
    }
  }

  // 获取用户ID
  private async getUserId(): Promise<string | null> {
    try {
      // 1. 尝试从全局变量获取
      const globalState = (window as any).__INITIAL_STATE__;
      if (globalState?.nav?.userInfo?.mid) {
        return globalState.nav.userInfo.mid;
      }

      // 2. 尝试从document.cookie获取
      const cookies = document.cookie.split(";");
      for (const cookie of cookies) {
        const trimmed = cookie.trim();
        if (trimmed.startsWith("DedeUserID=")) {
          return trimmed.substring("DedeUserID=".length);
        }
      }

      // 3. 尝试通过Chrome API获取cookie
      const chromeCookies = await this.getCookies();
      const dedeUserIdCookie = chromeCookies.find(
        (cookie) => cookie.name === "DedeUserID",
      );
      if (dedeUserIdCookie) {
        return dedeUserIdCookie.value;
      }

      return null;
    } catch (error) {
      console.warn("[Bilibili] 获取用户ID失败:", error);
      return null;
    }
  }

  // 获取B站相关cookies
  private async getCookies(): Promise<chrome.cookies.Cookie[]> {
    try {
      // 尝试多个domain来获取所有cookies
      const domains = ["bilibili.com", ".bilibili.com", "www.bilibili.com"];
      let allCookies: chrome.cookies.Cookie[] = [];

      for (const domain of domains) {
        const message = {
          action: "getCookies",
          data: {
            domain: domain,
          },
        };

        console.log(`[Bilibili] 尝试获取domain ${domain} 的cookies:`);

        const response = await chrome.runtime.sendMessage(message);

        if (Array.isArray(response)) {
          console.log(
            `[Bilibili] domain ${domain} 获取到 ${response.length} 个cookies`,
          );
          allCookies = allCookies.concat(response);
        }
      }

      // 去重（基于cookie name）
      const uniqueCookies = allCookies.filter(
        (cookie, index, self) =>
          index === self.findIndex((c) => c.name === cookie.name),
      );

      console.log("[Bilibili] 总共获取到cookies:", uniqueCookies.length);
      console.log(
        "[Bilibili] Cookie名称列表:",
        uniqueCookies.map((c) => c.name),
      );

      return uniqueCookies;
    } catch (error) {
      console.error("[Bilibili] 获取cookies失败:", error);
      return [];
    }
  }

  // 获取cookie字符串
  private async getCookieString(): Promise<string> {
    try {
      console.log("[Bilibili] ===== getCookieString开始 =====");

      // 完全按照bilibili_example.md：直接使用document.cookie
      console.log(
        "[Bilibili] 直接使用document.cookie (完全仿照bilibili_example.md):",
      );
      console.log("[Bilibili] document.cookie长度:", document.cookie.length);

      return document.cookie;
    } catch (error) {
      console.error("[Bilibili] 获取cookie字符串失败:", error);
      return document.cookie || "";
    }
  }

  // 获取关注列表
  async getFollowedUsers(): Promise<FollowedUser[]> {
    console.log("[Bilibili] ===== getFollowedUsers开始 =====");

    // 直接从Chrome存储读取配置中的请求间隔
    try {
      if (
        typeof chrome !== "undefined" &&
        chrome.storage &&
        chrome.storage.local
      ) {
        const result = await chrome.storage.local.get("onlyfocus_config");
        const config = result.onlyfocus_config;

        // 优先使用新的平台特定配置，如果不存在则尝试旧配置
        if (config?.platformSettings?.bilibili?.requestDelay) {
          this.requestDelay = config.platformSettings.bilibili.requestDelay;
          console.log(
            "[Bilibili] 从新配置读取请求间隔:",
            this.requestDelay,
            "ms",
          );
        } else if (config?.contentSettings?.requestDelay) {
          this.requestDelay = config.contentSettings.requestDelay;
          console.log(
            "[Bilibili] 从旧配置读取请求间隔:",
            this.requestDelay,
            "ms",
          );
        } else {
          console.log(
            "[Bilibili] 配置中没有requestDelay，使用默认值:",
            this.requestDelay,
          );
        }
      } else {
        console.warn(
          "[Bilibili] Chrome存储API不可用，使用默认请求间隔:",
          this.requestDelay,
        );
      }
    } catch (error) {
      console.warn(
        "[Bilibili] 读取配置失败，使用默认请求间隔:",
        this.requestDelay,
        "错误:",
        error,
      );
    }

    // 先检查登录状态
    console.log("[Bilibili] 调用isLogin()检测登录状态...");
    const isLoggedIn = await this.isLogin();
    console.log("[Bilibili] isLogin()返回结果:", isLoggedIn);

    if (!isLoggedIn) {
      console.error("[Bilibili] 登录检测失败，抛出异常");
      throw new Error(ERROR_MESSAGES.NOT_LOGGED_IN);
    }

    console.log("[Bilibili] 登录检测通过，开始获取UID...");
    const uid = await this.getUserId();
    console.log("[Bilibili] 获取到UID:", uid);

    if (!uid) {
      console.error("[Bilibili] 获取UID失败，抛出异常");
      throw new Error(ERROR_MESSAGES.NOT_LOGGED_IN);
    }

    const cacheKey = `onlyfocus_bilibili_followings_${uid}`;
    const cached = await StorageManager.getCache<FollowedUser[]>(cacheKey);

    if (cached) {
      console.log(`[Bilibili] 从缓存获取关注列表: ${cached.length} 个UP主`);
      return cached;
    }

    console.log("[Bilibili] 开始获取关注列表...");
    const allUps: FollowedUser[] = [];
    let page = 1;
    const pageSize = 50;

    try {
      // 获取完整的cookie字符串
      const cookies = await this.getCookieString();
      console.log("[Bilibili] 获取到cookies长度:", cookies.length);

      while (allUps.length < this.maxUpSers) {
        console.log(
          `[Bilibili] 发起API请求 - 页面: ${page}, 当前获取: ${allUps.length}/${this.maxUpSers}`,
        );

        const url = `https://api.bilibili.com/x/relation/followings?vmid=${uid}&pn=${page}&ps=${pageSize}&order=desc`;
        console.log("[Bilibili] 请求URL:", url);

        console.log("[Bilibili] 获取cookies并通过background script发送请求...");
        console.log("[Bilibili] document.cookie长度:", document.cookie.length);
        console.log(
          "[Bilibili] document.cookie包含SESSDATA:",
          document.cookie.includes("SESSDATA"),
        );

        // 获取完整的cookie字符串
        const cookies = await this.getCookieString();
        console.log("[Bilibili] 最终使用的cookies长度:", cookies.length);

        // 通过background script发送请求，手动传递cookies
        const response = await chrome.runtime.sendMessage({
          action: "makeRequest",
          data: {
            url: url,
            method: "GET",
            headers: {
              Cookie: cookies,
              Referer: "https://www.bilibili.com",
              "User-Agent": navigator.userAgent,
              Accept: "application/json, text/plain, */*",
              "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
              "Accept-Encoding": "gzip, deflate, br",
              Origin: "https://www.bilibili.com",
              "Sec-Fetch-Dest": "empty",
              "Sec-Fetch-Mode": "cors",
              "Sec-Fetch-Site": "same-site",
            },
          },
        });

        console.log("[Bilibili] Background script响应:", response);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = JSON.parse(response.responseText);

        console.log("[Bilibili] API响应数据:", {
          code: data.code,
          message: data.message,
          hasData: !!data.data,
          dataListLength: data.data?.list?.length || 0,
          fullData: data,
        });

        if (data.code !== 0) {
          console.error(
            "[Bilibili] API返回错误码:",
            data.code,
            "错误信息:",
            data.message,
          );
          throw new Error(data.message || "获取关注列表失败");
        }

        if (!data.data?.list || data.data.list.length === 0) {
          break;
        }

        const ups: FollowedUser[] = data.data.list.map((up: any) => ({
          id: `bilibili_${up.mid}`,
          platform: this.platform,
          platformId: up.mid,
          username: up.uname,
          displayName: up.uname,
          avatar: up.face,
          verified: up.official_verify?.type !== -1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }));

        allUps.push(...ups);

        if (data.data.list.length < pageSize) {
          break;
        }

        page++;

        // 延迟避免频率限制
        if (allUps.length < this.maxUpSers) {
          console.log(`[Bilibili] 等待 ${this.requestDelay}ms 后请求下一页...`);
          await this.delay(this.requestDelay);
        }
      }

      // 缓存结果
      await StorageManager.setCache(
        cacheKey,
        allUps,
        CACHE_CONFIG.FOLLOWED_USERS,
      );
      console.log(`[Bilibili] 获取关注列表完成: ${allUps.length} 个UP主`);

      return allUps;
    } catch (error) {
      console.error("[Bilibili] 获取关注列表失败:", error);
      throw error;
    }
  }

  // 获取UP主的视频
  async getUserContent(
    userId: string,
    limit: number = this.videosPerUp,
  ): Promise<ContentItem[]> {
    const cacheKey = `onlyfocus_bilibili_videos_${userId}`;
    const cached = await StorageManager.getCache<ContentItem[]>(cacheKey);

    if (cached) {
      console.log(
        `[Bilibili] 从缓存获取UP ${userId} 的视频 (${cached.length} 个)`,
      );
      return this.getRandomVideos(cached, limit);
    }

    try {
      // 获取视频池（按播放量排序，可以获取不同时期的视频）
      const url = `https://api.bilibili.com/x/space/arc/search?mid=${userId}&ps=50&tid=0&pn=1&order=click`;

      console.log(`[Bilibili] 开始获取UP ${userId} 的视频`);

      const response = await fetch(url, {
        headers: {
          Referer: "https://www.bilibili.com",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.code !== 0 || !data.data?.list?.vlist) {
        throw new Error(data.message || "获取视频失败");
      }

      const videoPool: ContentItem[] = data.data.list.vlist.map((v: any) => ({
        id: `bilibili_${v.bvid}`,
        platform: this.platform,
        platformId: v.bvid,
        author: {
          id: `bilibili_${v.mid}`,
          platform: this.platform,
          platformId: v.mid,
          username: v.author,
          displayName: v.author,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        title: v.title,
        description: v.description,
        thumbnail: v.pic?.startsWith("http://")
          ? v.pic.replace("http://", "https://")
          : v.pic,
        url: `https://www.bilibili.com/video/${v.bvid}`,
        publishedAt: v.created * 1000,
        metrics: {
          views: v.play,
          likes: v.like,
          comments: v.video_review || v.danmaku,
        },
        duration: this.parseDuration(v.length),
        type: "video",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }));

      // 缓存视频池
      await StorageManager.setCache(cacheKey, videoPool, CACHE_CONFIG.CONTENT);

      // 随机选择视频
      const selectedVideos = this.getRandomVideos(videoPool, limit);
      console.log(
        `[Bilibili] 获取UP ${userId} 的视频池: ${videoPool.length} 个，随机选择 ${selectedVideos.length} 个`,
      );

      return selectedVideos;
    } catch (error) {
      console.error(`[Bilibili] 获取UP ${userId} 视频失败:`, error);
      return [];
    }
  }

  // 从视频池中随机选择视频
  private getRandomVideos(videos: ContentItem[], count: number): ContentItem[] {
    if (videos.length <= count) {
      return [...videos];
    }

    const shuffled = [...videos].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }

  // 解析时长字符串
  private parseDuration(durationStr: string): number {
    if (!durationStr) return 0;

    const parts = durationStr.split(":");
    if (parts.length === 2) {
      const [minutes, seconds] = parts.map(Number);
      return minutes * 60 + seconds;
    } else if (parts.length === 3) {
      const [hours, minutes, seconds] = parts.map(Number);
      return hours * 3600 + minutes * 60 + seconds;
    }

    return 0;
  }

  // 获取随机关注内容
  async getRandomContent(): Promise<ContentItem[]> {
    // 从配置中读取请求设置
    await this.loadRequestSettings();

    const followedUsers = await this.getFollowedUsers();

    if (followedUsers.length === 0) {
      throw new Error("没有关注任何UP主");
    }

    // 随机打乱UP主顺序
    const shuffledUsers = [...followedUsers].sort(() => Math.random() - 0.5);

    // 计算需要多少个UP主
    const upsNeeded = Math.max(
      this.minUpsNeeded,
      Math.ceil(this.totalVideosNeeded / this.videosPerUp),
    );
    const selectedUsers = shuffledUsers.slice(
      0,
      Math.min(upsNeeded, shuffledUsers.length),
    );

    console.log(`[Bilibili] 选择了 ${selectedUsers.length} 个UP主获取视频`);
    console.log(
      `[Bilibili] 请求设置: 延迟=${this.requestDelay}ms, 并发=${this.concurrentRequests}, 并发限制=${this.concurrentLimit}`,
    );

    // 第一步：先从缓存获取所有可用的视频
    const cachedVideos: ContentItem[] = [];
    const usersNeedingUpdate: FollowedUser[] = [];

    console.log(`[Bilibili] 第一阶段：检查缓存...`);
    for (let i = 0; i < selectedUsers.length; i++) {
      const user = selectedUsers[i];

      try {
        const cacheKey = `onlyfocus_bilibili_videos_${user.platformId}`;
        const cached = await StorageManager.getCache<ContentItem[]>(cacheKey);

        if (cached) {
          console.log(
            `[Bilibili] ${user.displayName}: 使用缓存视频 (${cached.length} 个)`,
          );
          const videos = this.getRandomVideos(cached, this.videosPerUp);
          cachedVideos.push(...videos);
        } else {
          console.log(`[Bilibili] ${user.displayName}: 需要网络请求`);
          usersNeedingUpdate.push(user);
        }
      } catch (error) {
        console.error(`[Bilibili] 检查 ${user.displayName} 缓存失败:`, error);
        usersNeedingUpdate.push(user);
      }
    }

    console.log(
      `[Bilibili] 缓存阶段完成，获得 ${cachedVideos.length} 个视频，需要更新 ${usersNeedingUpdate.length} 个UP主`,
    );

    // 第二步：如果有缓存视频，先进行界面替换
    if (cachedVideos.length > 0) {
      console.log(
        `[Bilibili] 使用缓存视频进行界面替换 (${cachedVideos.length} 个)`,
      );
      try {
        await this.replaceContent(cachedVideos);

        // 记录已显示的视频ID
        cachedVideos.forEach(video => this.displayedVideoIds.add(video.id));

        // 初始化换一换按钮功能
        await this.initializeRefreshButton();

      } catch (error) {
        console.error("[Bilibili] 使用缓存视频替换内容失败:", error);
      }
    }

    // 第三步：异步更新需要网络请求的UP主视频
    if (usersNeedingUpdate.length > 0) {
      console.log(
        `[Bilibili] 第二阶段：网络请求更新 ${usersNeedingUpdate.length} 个UP主...`,
      );

      // 在后台异步更新，不阻塞界面
      this.updateUserVideosInBackground(usersNeedingUpdate);
    }

    // 返回当前可用的视频（主要是缓存视频）
    const finalVideos = cachedVideos.slice(0, this.totalVideosNeeded);

    console.log(
      `[Bilibili] 立即返回 ${finalVideos.length} 个缓存视频，${usersNeedingUpdate.length} 个UP主将在后台更新`,
    );

    return finalVideos;
  }

  // 后台异步更新UP主视频 - 支持并发配置
  private async updateUserVideosInBackground(
    users: FollowedUser[],
  ): Promise<void> {
    console.log(`[Bilibili] 后台更新开始，共 ${users.length} 个UP主`);
    console.log(
      `[Bilibili] 更新模式: ${this.concurrentRequests ? "并发" : "串行"}处理`,
    );

    if (this.concurrentRequests) {
      // 并发处理模式
      await this.updateUsersConcurrently(users);
    } else {
      // 串行处理模式（默认，B站限制严格）
      await this.updateUsersSequentially(users);
    }

    console.log(`[Bilibili] 后台更新完成，重新初始化换一换按钮...`);

    // 更新完成后重新初始化换一换按钮，使其能使用新缓存的视频
    try {
      await this.initializeRefreshButton();
    } catch (error) {
      console.error("[Bilibili] 后台更新后重新初始化换一换按钮失败:", error);
    }
  }

  // 并发处理用户更新
  private async updateUsersConcurrently(users: FollowedUser[]): Promise<void> {
    console.log(`[Bilibili] 并发更新模式，并发限制: ${this.concurrentLimit}`);

    // 将用户分批处理
    const batches: FollowedUser[][] = [];
    for (let i = 0; i < users.length; i += this.concurrentLimit) {
      batches.push(users.slice(i, i + this.concurrentLimit));
    }

    console.log(
      `[Bilibili] 分为 ${batches.length} 批，每批最多 ${this.concurrentLimit} 个并发请求`,
    );

    // 分批并发处理
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];

      console.log(
        `[Bilibili] 处理第 ${batchIndex + 1}/${batches.length} 批，包含 ${batch.length} 个UP主`,
      );

      // 批内并发请求
      const batchPromises = batch.map(async (user, userIndex) => {
        try {
          console.log(
            `[Bilibili] 并发更新UP主: ${user.displayName} (批次 ${batchIndex + 1}-${userIndex + 1})`,
          );

          // 直接调用网络请求，跳过缓存检查
          await this.fetchUserVideosFromNetwork(user.platformId);

          return { success: true, user: user.displayName };
        } catch (error) {
          console.error(`[Bilibili] 并发更新 ${user.displayName} 失败:`, error);
          return { success: false, user: user.displayName, error };
        }
      });

      // 等待当前批次完成
      const batchResults = await Promise.allSettled(batchPromises);

      // 统计结果
      const successful = batchResults.filter(
        (r) => r.status === "fulfilled" && r.value?.success,
      ).length;
      console.log(
        `[Bilibili] 批次 ${batchIndex + 1} 完成: ${successful}/${batch.length} 个成功`,
      );

      // 批次间延迟（如果有下一批）
      if (batchIndex < batches.length - 1) {
        console.log(
          `[Bilibili] 批次间等待 ${this.requestDelay * 2}ms 后处理下一批...`,
        );
        await this.delay(this.requestDelay * 2); // 批次间延迟加倍
      }
    }
  }

  // 串行处理用户更新
  private async updateUsersSequentially(users: FollowedUser[]): Promise<void> {
    const updateStartTime = Date.now();
    console.log(
      `[Bilibili] 串行更新模式，请求间隔: ${this.requestDelay}ms - 开始时间: ${new Date(updateStartTime).toLocaleTimeString()}`,
    );

    // 重置频率限制计数
    this.rateLimitHitCount = 0;
    this.lastRateLimitTime = 0;

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const userStartTime = Date.now();

      // 检查是否需要跳过后续请求（如果连续遇到频率限制）
      if (this.shouldSkipDueToRateLimit()) {
        console.log(
          `[Bilibili] 连续遇到频率限制，跳过剩余 ${users.length - i} 个UP主`,
        );
        break;
      }

      console.log(
        `[Bilibili] 串行更新第 ${i + 1}/${users.length} 个UP主: ${user.displayName} - 开始时间: ${new Date(userStartTime).toLocaleTimeString()}`,
      );

      // 直接调用网络请求，跳过缓存检查（现在这个方法不会抛出异常）
      await this.fetchUserVideosFromNetwork(user.platformId);

      // 成功后重置频率限制计数
      this.rateLimitHitCount = 0;

      const userDuration = Date.now() - userStartTime;
      console.log(
        `[Bilibili] UP主 ${user.displayName} 处理完成 - 耗时: ${userDuration}ms`,
      );

      // UP主间延迟 - 对于B站需要更长的间隔
      if (i < users.length - 1) {
        // B站API限制极其严格，使用更长的间隔
        const delayTime = Math.max(this.requestDelay * 1.5, 20000); // 至少20秒间隔，或配置值的1.5倍
        const nextUserTime = Date.now() + delayTime;
        console.log(
          `[Bilibili] 串行更新等待 ${delayTime}ms 后处理下一个UP主，预计开始时间: ${new Date(nextUserTime).toLocaleTimeString()} (B站严格模式)...`,
        );
        await this.delay(delayTime);
      }
    }

    const totalUpdateDuration = Date.now() - updateStartTime;
    console.log(
      `[Bilibili] 串行更新完成 - 总耗时: ${totalUpdateDuration}ms, 共遇到 ${this.rateLimitHitCount} 次频率限制, 成功处理 ${users.length - this.rateLimitHitCount}/${users.length} 个UP主`,
    );
  }

  // 判断是否应该因频率限制跳过后续请求
  private shouldSkipDueToRateLimit(): boolean {
    // B站API限制极其严格，连续2次频率限制就暂停，时间窗口延长到10分钟
    if (
      this.rateLimitHitCount >= 2 &&
      Date.now() - this.lastRateLimitTime < 10 * 60 * 1000
    ) {
      console.log(
        `[Bilibili] 检测到严重频率限制，暂停更新以避免被封禁 (连续${this.rateLimitHitCount}次)`,
      );
      return true;
    }
    return false;
  }

  // 直接从网络获取UP主视频（重试机制）
  private async fetchUserVideosFromNetwork(userId: string): Promise<void> {
    const url = `https://api.bilibili.com/x/space/arc/search?mid=${userId}&ps=50&tid=0&pn=1&order=click`;
    const requestStartTime = Date.now();
    const maxRetries = 3;
    const retryDelay = 3000; // 3秒间隔

    console.log(
      `[Bilibili] 开始获取UP ${userId} 视频，最多重试 ${maxRetries} 次 - 开始时间: ${new Date(requestStartTime).toLocaleTimeString()}`,
    );

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const attemptStartTime = Date.now();
      console.log(
        `[Bilibili] 第 ${attempt}/${maxRetries} 次尝试获取UP ${userId} 视频 - 时间: ${new Date(attemptStartTime).toLocaleTimeString()}`,
      );

      try {
        // Content script直接请求同域名API
        console.log(`[Bilibili] 尝试 ${attempt}: 直接fetch请求: ${url}`);
        const response = await fetch(url, {
          method: "GET",
          headers: {
            Referer: "https://www.bilibili.com",
            Accept: "application/json, text/plain, */*",
          },
        });

        const responseTime = Date.now();
        const attemptDuration = responseTime - attemptStartTime;
        console.log(
          `[Bilibili] 尝试 ${attempt} 完成 - 响应时间: ${new Date(responseTime).toLocaleTimeString()}, 耗时: ${attemptDuration}ms`,
          `状态: ${response.status} ${response.statusText}`,
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        // 专门处理B站API的错误码
        if (data.code === -799) {
          console.log(
            `[Bilibili] 尝试 ${attempt}: 检测到API频率限制(code:-799)`,
          );
          const ttl = data.ttl || 30;
          if (attempt < maxRetries) {
            console.log(
              `[Bilibili] 尝试 ${attempt}: 频率限制，将在 ${retryDelay / 1000} 秒后重试...`,
            );
            await this.delay(retryDelay);
            continue;
          } else {
            throw new Error(
              `API频率限制(code:-799)，${maxRetries}次重试均失败`,
            );
          }
        }

        if (data.code !== 0 || !data.data?.list?.vlist) {
          if (attempt < maxRetries) {
            console.log(
              `[Bilibili] 尝试 ${attempt}: API返回错误(${data.code}: ${data.message})，将在 ${retryDelay / 1000} 秒后重试...`,
            );
            await this.delay(retryDelay);
            continue;
          } else {
            throw new Error(
              `API错误(${data.code}: ${data.message})，${maxRetries}次重试均失败`,
            );
          }
        }

        // 成功获取数据
        const videoPool: ContentItem[] = data.data.list.vlist.map((v: any) => ({
          id: `bilibili_${v.bvid}`,
          platform: this.platform,
          platformId: v.bvid,
          author: {
            id: `bilibili_${v.mid}`,
            platform: this.platform,
            platformId: v.mid,
            username: v.author,
            displayName: v.author,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
          title: v.title,
          description: v.description,
          thumbnail: v.pic?.startsWith("http://")
            ? v.pic.replace("http://", "https://")
            : v.pic,
          url: `https://www.bilibili.com/video/${v.bvid}`,
          publishedAt: v.created * 1000,
          metrics: {
            views: v.play,
            likes: v.like,
            comments: v.video_review || v.danmaku,
          },
          duration: this.parseDuration(v.length),
          type: "video",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }));

        // 缓存视频池
        const cacheKey = `onlyfocus_bilibili_videos_${userId}`;
        await StorageManager.setCache(
          cacheKey,
          videoPool,
          CACHE_CONFIG.CONTENT,
        );

        const totalDuration = Date.now() - requestStartTime;
        console.log(
          `[Bilibili] ✅ 成功获取UP ${userId} 视频: ${videoPool.length} 个视频，尝试次数: ${attempt}/${maxRetries}，总耗时: ${totalDuration}ms`,
        );

        return; // 成功则直接返回
      } catch (error) {
        const attemptDuration = Date.now() - attemptStartTime;
        console.error(
          `[Bilibili] 尝试 ${attempt} 失败 - 耗时: ${attemptDuration}ms:`,
          error,
        );

        if (attempt < maxRetries) {
          console.log(
            `[Bilibili] 尝试 ${attempt} 失败，将在 ${retryDelay / 1000} 秒后重试下一个尝试...`,
          );
          await this.delay(retryDelay);
        } else {
          // 最后一次尝试失败，但不抛出错误，而是记录并继续
          const totalDuration = Date.now() - requestStartTime;
          console.warn(
            `[Bilibili] ⚠️ UP ${userId} 所有 ${maxRetries} 次尝试均失败，总耗时: ${totalDuration}ms，将跳过此UP主继续处理下一个`,
          );
          return; // 失败也返回，但不抛出异常，让流程继续
        }
      }
    }
  }

  // 检测内容区域
  detectContentArea(): Element | null {
    return document.querySelector(this.config.selectors.contentArea);
  }

  // 替换页面内容
  async replaceContent(content: ContentItem[]): Promise<void> {
    const contentArea = this.detectContentArea();
    if (!contentArea) {
      console.warn("[Bilibili] 未找到内容区域");
      return;
    }

    // 等待视频卡片加载
    const cards = await DOMUtils.waitForElements(
      this.config.selectors.contentArea,
      Math.min(content.length, 10),
      10000,
    );

    if (cards.length === 0) {
      console.warn("[Bilibili] 未找到视频卡片");
      return;
    }

    console.log(
      `[Bilibili] 开始替换 ${Math.min(content.length, cards.length)} 个视频卡片`,
    );

    // 替换每个卡片的内容
    for (let i = 0; i < Math.min(content.length, cards.length); i++) {
      const card = cards[i];
      const video = content[i];

      try {
        this.replaceCardContent(card, video);
      } catch (error) {
        console.error(`[Bilibili] 替换卡片 ${i} 内容失败:`, error);
      }
    }

    console.log("[Bilibili] 内容替换完成");
  }

  // 替换单个卡片内容
  private replaceCardContent(card: Element, video: ContentItem): void {
    try {
      // 封面图
      const coverImg = card.querySelector(
        ".bili-video-card__cover img",
      ) as HTMLImageElement;
      if (coverImg) {
        const coverBase =
          video.thumbnail + "@672w_378h_1c_!web-home-common-cover";
        coverImg.src = coverBase;
        coverImg.alt = video.title;

        // 处理picture标签中的source
        const sources = card.querySelectorAll(".bili-video-card__cover source");
        sources.forEach((source) => {
          const srcElement = source as HTMLSourceElement;
          if (srcElement.type === "image/avif") {
            srcElement.srcset = coverBase + ".avif";
          } else if (srcElement.type === "image/webp") {
            srcElement.srcset = coverBase + ".webp";
          }
        });
      }

      // 链接
      const videoUrl = video.url;
      const imageLink = card.querySelector(
        ".bili-video-card__image--link",
      ) as HTMLAnchorElement;
      const titleLink = card.querySelector(
        ".bili-video-card__info--tit a",
      ) as HTMLAnchorElement;
      const ownerLink = card.querySelector(
        ".bili-video-card__info--owner",
      ) as HTMLAnchorElement;

      if (imageLink) imageLink.href = videoUrl;
      if (titleLink) {
        titleLink.href = videoUrl;
        titleLink.textContent = video.title;
        titleLink.title = video.title;
      }
      if (ownerLink) {
        ownerLink.href = `//space.bilibili.com/${video.author.platformId}`;
      }

      // 标题
      const titleElement = card.querySelector(".bili-video-card__info--tit");
      if (titleElement) {
        titleElement.setAttribute("title", video.title);
      }

      // UP主
      const authorElement = card.querySelector(
        ".bili-video-card__info--author",
      );
      if (authorElement) {
        authorElement.textContent = video.author.displayName;
        authorElement.setAttribute("title", video.author.displayName);
      }

      // 统计数据
      const statsTexts = card.querySelectorAll(".bili-video-card__stats--text");
      if (statsTexts.length >= 2 && video.metrics) {
        statsTexts[0].textContent = NumberFormatter.formatLarge(
          video.metrics.views || 0,
        );
        statsTexts[1].textContent = NumberFormatter.formatLarge(
          video.metrics.comments || 0,
        );
      }

      // 时长
      const durationElement = card.querySelector(
        ".bili-video-card__stats__duration",
      );
      if (durationElement && video.duration) {
        durationElement.textContent = DateFormatter.formatDuration(
          video.duration,
        );
      }

      // 发布时间
      const dateElement = card.querySelector(".bili-video-card__info--date");
      if (dateElement) {
        const formattedDate = DateFormatter.formatAbsolute(
          video.publishedAt,
          "date",
        ).replace(/\//g, "-");
        dateElement.textContent = `· ${formattedDate}`;
      }
    } catch (error) {
      console.error("[Bilibili] 替换卡片内容失败:", error);
      throw error;
    }
  }

  // 加载平台特定配置
  private async loadRequestSettings(): Promise<void> {
    try {
      const config = await configManager.getConfig();
      const platformConfig = config.platformSettings[this.platform];

      if (!platformConfig) {
        console.warn(`[Bilibili] 未找到平台配置，使用默认安全设置`);
        this.setDefaultSettings();
        return;
      }

      // 使用平台特定配置
      this.requestDelay = platformConfig.requestDelay;
      this.concurrentRequests = platformConfig.concurrentRequests;
      this.concurrentLimit = platformConfig.concurrentLimit;

      // B站安全模式：如果配置不安全，强制使用安全设置
      if (
        platformConfig.concurrentRequests ||
        platformConfig.concurrentLimit > 1
      ) {
        console.warn(
          `[Bilibili] ⚠️ 检测到不安全的并发配置，已强制启用安全模式`,
        );
        this.concurrentRequests = false;
        this.concurrentLimit = 1;
      }

      console.log(
        `[Bilibili] 平台配置加载完成: 延迟=${this.requestDelay}ms, 并发=${this.concurrentRequests}, 限制=${this.concurrentLimit}`,
      );

      // 显示自定义设置
      if (platformConfig.customSettings) {
        console.log(`[Bilibili] 自定义设置:`, platformConfig.customSettings);
      }
    } catch (error) {
      console.warn(`[Bilibili] 加载平台配置失败，使用安全默认值:`, error);
      this.setDefaultSettings();
    }
  }

  // 设置默认安全配置
  private setDefaultSettings(): void {
    this.requestDelay = 5000;
    this.concurrentRequests = false;
    this.concurrentLimit = 1;
  }

  // 延迟工具
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // 获取平台信息
  getPlatformInfo() {
    return {
      name: this.config.name,
      domain: this.config.domain,
      colors: this.config.colors,
      selectors: this.config.selectors,
    };
  }

  // ===== 换一换功能相关方法 =====

  // 初始化换一换功能 - 在获取内容后调用
  async initializeRefreshButton(): Promise<void> {
    console.log("[Bilibili] 初始化换一换按钮功能...");

    try {
      // 1. 收集所有可用的缓存视频
      await this.collectAllCachedVideos();

      if (this.currentCachedVideos.length === 0) {
        console.log("[Bilibili] 没有缓存视频，跳过换一换按钮初始化");
        return;
      }

      // 2. 查找并劫持换一换按钮
      await this.hijackRefreshButton();

      console.log(`[Bilibili] 换一换按钮初始化完成，可用缓存视频: ${this.currentCachedVideos.length} 个`);
    } catch (error) {
      console.error("[Bilibili] 初始化换一换按钮失败:", error);
    }
  }

  // 收集所有可用的缓存视频
  private async collectAllCachedVideos(): Promise<void> {
    console.log("[Bilibili] 收集所有缓存视频...");

    try {
      // 获取当前用户的关注列表
      const followedUsers = await this.getFollowedUsers();
      const allVideos: ContentItem[] = [];

      // 遍历每个UP主的缓存
      for (const user of followedUsers) {
        const cacheKey = `onlyfocus_bilibili_videos_${user.platformId}`;
        const cached = await StorageManager.getCache<ContentItem[]>(cacheKey);

        if (cached && cached.length > 0) {
          console.log(`[Bilibili] UP ${user.displayName}: ${cached.length} 个缓存视频`);
          allVideos.push(...cached);
        }
      }

      // 过滤掉已显示的视频，确保换一换能显示新内容
      const availableVideos = allVideos.filter(video => !this.displayedVideoIds.has(video.id));

      this.currentCachedVideos = availableVideos;
      console.log(`[Bilibili] 总计收集到 ${allVideos.length} 个缓存视频，可用新视频: ${availableVideos.length} 个`);

    } catch (error) {
      console.error("[Bilibili] 收集缓存视频失败:", error);
      this.currentCachedVideos = [];
    }
  }

  // 查找并劫持换一换按钮
  private async hijackRefreshButton(): Promise<void> {
    console.log("[Bilibili] 查找换一换按钮...");

    // 等待按钮出现，最多等待10秒
    const button = await DOMUtils.waitForElement('.primary-btn.roll-btn', 10000);

    if (!button) {
      console.log("[Bilibili] 未找到换一换按钮");
      return;
    }

    console.log("[Bilibili] 找到换一换按钮，开始劫持功能...");

    // 移除原有的事件监听器（通过克隆重建元素）
    const newButton = button.cloneNode(true) as HTMLButtonElement;
    button.parentNode?.replaceChild(newButton, button);

    // 添加新的事件处理器
    this.refreshButtonHandler = () => this.handleRefreshClick();
    newButton.addEventListener('click', this.refreshButtonHandler);

    // 修改按钮样式，表示功能已改变
    newButton.style.backgroundColor = '#00a1d6'; // B站蓝色
    newButton.title = "从缓存视频中换一批新的内容";

    // 添加视觉标识
    const span = newButton.querySelector('span');
    if (span) {
      span.textContent = "缓存换一换";
    }

    console.log("[Bilibili] 换一换按钮劫持完成");
  }

  // 处理换一换按钮点击
  private async handleRefreshClick(): Promise<void> {
    console.log("[Bilibili] 换一换按钮被点击，从缓存获取新视频...");

    if (this.currentCachedVideos.length === 0) {
      console.log("[Bilibili] 没有可用的缓存视频，尝试重新收集...");
      await this.collectAllCachedVideos();

      if (this.currentCachedVideos.length === 0) {
        this.showMessage("没有可用的缓存视频，请先浏览一些内容");
        return;
      }
    }

    try {
      // 从缓存视频中随机选择一批新的
      const newVideos = this.getRandomVideos(this.currentCachedVideos, this.totalVideosNeeded);

      if (newVideos.length === 0) {
        this.showMessage("缓存视频已用完，请稍后再试");
        return;
      }

      // 记录即将显示的视频ID，避免下次重复显示
      newVideos.forEach(video => this.displayedVideoIds.add(video.id));

      // 从缓存池中移除已使用的视频
      const usedIds = new Set(newVideos.map(v => v.id));
      this.currentCachedVideos = this.currentCachedVideos.filter(v => !usedIds.has(v.id));

      // 替换页面内容
      await this.replaceContent(newVideos);

      // 显示提示信息
      this.showMessage(`已替换为 ${newVideos.length} 个新的缓存视频`);

      console.log(`[Bilibili] 换一换完成: 显示了 ${newVideos.length} 个新视频，剩余缓存: ${this.currentCachedVideos.length} 个`);

    } catch (error) {
      console.error("[Bilibili] 换一换处理失败:", error);
      this.showMessage("换一换失败，请稍后重试");
    }
  }

  // 显示临时提示信息
  private showMessage(message: string): void {
    // 创建提示元素
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 12px 20px;
      border-radius: 4px;
      font-size: 14px;
      z-index: 10000;
      transition: opacity 0.3s ease;
    `;

    document.body.appendChild(toast);

    // 3秒后自动消失
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => {
        document.body.removeChild(toast);
      }, 300);
    }, 3000);
  }

  // 清理换一换功能（页面卸载时调用）
  cleanupRefreshButton(): void {
    console.log("[Bilibili] 清理换一换按钮功能...");

    if (this.refreshButtonHandler) {
      const button = document.querySelector('.primary-btn.roll-btn');
      if (button) {
        button.removeEventListener('click', this.refreshButtonHandler);
      }
      this.refreshButtonHandler = null;
    }

    // 重置状态
    this.currentCachedVideos = [];
    this.displayedVideoIds.clear();
  }
}

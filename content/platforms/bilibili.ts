import type { PlatformAdapter, FollowedUser, ContentItem } from '../../shared/types';
import { PLATFORM_CONFIG, CACHE_CONFIG, ERROR_MESSAGES } from '../../shared/constants';
import { StorageManager } from '../../shared/utils/storage';
import { apiClient } from '../../shared/utils/api';
import { DOMUtils, ContentReplacer } from '../../shared/utils/dom';
import { NumberFormatter, DateFormatter } from '../../shared/utils/format';

export class BilibiliAdapter implements PlatformAdapter {
  readonly platform = 'bilibili' as const;

  private readonly config = PLATFORM_CONFIG.bilibili;
  private readonly maxUpSers = 100;
  private readonly videosPerUp = 2;
  private readonly totalVideosNeeded = 20;
  private readonly minUpsNeeded = 15;
  private readonly requestDelay = 1500;

  // 检查是否在B站页面
  isActive(): boolean {
    return window.location.hostname.includes('bilibili.com');
  }

  // 检查是否登录
  private isLogin(): boolean {
    const cookies = document.cookie.split(';');
    const hasSessionData = cookies.some(cookie =>
      cookie.trim().startsWith('SESSDATA=') || cookie.trim().startsWith('DedeUserID=')
    );

    const hasUserInfo = !!(
      document.querySelector('.nav-user-info') ||
      document.querySelector('.user-con') ||
      document.querySelector('.header-avatar-wrap')
    );

    return hasSessionData || hasUserInfo;
  }

  // 获取用户ID
  private getUserId(): string | null {
    // 尝试从全局变量获取
    const globalState = (window as any).__INITIAL_STATE__;
    if (globalState?.nav?.userInfo?.mid) {
      return globalState.nav.userInfo.mid;
    }

    // 尝试从cookie获取
    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
      const trimmed = cookie.trim();
      if (trimmed.startsWith('DedeUserID=')) {
        return trimmed.substring('DedeUserID='.length);
      }
    }

    return null;
  }

  // 获取关注列表
  async getFollowedUsers(): Promise<FollowedUser[]> {
    const uid = this.getUserId();
    if (!uid) {
      throw new Error(ERROR_MESSAGES.NOT_LOGGED_IN);
    }

    const cacheKey = `onlyfocus_bilibili_followings_${uid}`;
    const cached = await StorageManager.getCache<FollowedUser[]>(cacheKey);

    if (cached) {
      console.log(`[Bilibili] 从缓存获取关注列表: ${cached.length} 个UP主`);
      return cached;
    }

    console.log('[Bilibili] 开始获取关注列表...');
    const allUps: FollowedUser[] = [];
    let page = 1;
    const pageSize = 50;

    try {
      while (allUps.length < this.maxUpSers) {
        const url = `https://api.bilibili.com/x/relation/followings?vmid=${uid}&pn=${page}&ps=${pageSize}&order=desc`;

        const response = await fetch(url, {
          headers: {
            'Cookie': document.cookie,
            'Referer': 'https://www.bilibili.com',
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        if (data.code !== 0) {
          throw new Error(data.message || '获取关注列表失败');
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
          await this.delay(500);
        }
      }

      // 缓存结果
      await StorageManager.setCache(cacheKey, allUps, CACHE_CONFIG.FOLLOWED_USERS);
      console.log(`[Bilibili] 获取关注列表完成: ${allUps.length} 个UP主`);

      return allUps;
    } catch (error) {
      console.error('[Bilibili] 获取关注列表失败:', error);
      throw error;
    }
  }

  // 获取UP主的视频
  async getUserContent(userId: string, limit: number = this.videosPerUp): Promise<ContentItem[]> {
    const cacheKey = `onlyfocus_bilibili_videos_${userId}`;
    const cached = await StorageManager.getCache<ContentItem[]>(cacheKey);

    if (cached) {
      console.log(`[Bilibili] 从缓存获取UP ${userId} 的视频`);
      return this.getRandomVideos(cached, limit);
    }

    try {
      // 获取视频池（按播放量排序，可以获取不同时期的视频）
      const url = `https://api.bilibili.com/x/space/arc/search?mid=${userId}&ps=50&tid=0&pn=1&order=click`;

      const response = await fetch(url, {
        headers: {
          'Cookie': document.cookie,
          'Referer': 'https://www.bilibili.com',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.code !== 0 || !data.data?.list?.vlist) {
        throw new Error(data.message || '获取视频失败');
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
        thumbnail: v.pic?.startsWith('http://') ? v.pic.replace('http://', 'https://') : v.pic,
        url: `https://www.bilibili.com/video/${v.bvid}`,
        publishedAt: v.created * 1000,
        metrics: {
          views: v.play,
          likes: v.like,
          comments: v.video_review || v.danmaku,
        },
        duration: this.parseDuration(v.length),
        type: 'video',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }));

      // 缓存视频池
      await StorageManager.setCache(cacheKey, videoPool, CACHE_CONFIG.CONTENT);

      // 随机选择视频
      const selectedVideos = this.getRandomVideos(videoPool, limit);
      console.log(`[Bilibili] 获取UP ${userId} 的视频池: ${videoPool.length} 个，随机选择 ${selectedVideos.length} 个`);

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

    const parts = durationStr.split(':');
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
    const followedUsers = await this.getFollowedUsers();

    if (followedUsers.length === 0) {
      throw new Error('没有关注任何UP主');
    }

    // 随机打乱UP主顺序
    const shuffledUsers = [...followedUsers].sort(() => Math.random() - 0.5);

    // 计算需要多少个UP主
    const upsNeeded = Math.max(this.minUpsNeeded, Math.ceil(this.totalVideosNeeded / this.videosPerUp));
    const selectedUsers = shuffledUsers.slice(0, Math.min(upsNeeded, shuffledUsers.length));

    console.log(`[Bilibili] 选择了 ${selectedUsers.length} 个UP主获取视频`);

    // 并发获取视频（控制并发数）
    const allVideos: ContentItem[] = [];
    const batchSize = 5;

    for (let i = 0; i < selectedUsers.length; i += batchSize) {
      const batch = selectedUsers.slice(i, i + batchSize);

      const batchPromises = batch.map(async (user) => {
        try {
          const videos = await this.getUserContent(user.platformId);
          if (videos.length > 0) {
            console.log(`[Bilibili] ${user.displayName}: 随机选择了 ${videos.length} 个视频`);
            return videos;
          }
          return [];
        } catch (error) {
          console.error(`[Bilibili] 获取 ${user.displayName} 的视频失败:`, error);
          return [];
        }
      });

      const batchResults = await Promise.all(batchPromises);
      allVideos.push(...batchResults.flat());

      // 批次间延迟
      if (i + batchSize < selectedUsers.length) {
        await this.delay(this.requestDelay);
      }
    }

    // 再次随机打乱所有视频
    const shuffledVideos = allVideos.sort(() => Math.random() - 0.5);
    const finalVideos = shuffledVideos.slice(0, this.totalVideosNeeded);

    console.log(`[Bilibili] 获取到 ${finalVideos.length} 个来自 ${selectedUsers.length} 个不同UP主的随机视频`);

    return finalVideos;
  }

  // 检测内容区域
  detectContentArea(): Element | null {
    return document.querySelector(this.config.selectors.contentArea);
  }

  // 替换页面内容
  async replaceContent(content: ContentItem[]): Promise<void> {
    const contentArea = this.detectContentArea();
    if (!contentArea) {
      console.warn('[Bilibili] 未找到内容区域');
      return;
    }

    // 等待视频卡片加载
    const cards = await DOMUtils.waitForElements(
      this.config.selectors.contentArea,
      Math.min(content.length, 10),
      10000
    );

    if (cards.length === 0) {
      console.warn('[Bilibili] 未找到视频卡片');
      return;
    }

    console.log(`[Bilibili] 开始替换 ${Math.min(content.length, cards.length)} 个视频卡片`);

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

    console.log('[Bilibili] 内容替换完成');
  }

  // 替换单个卡片内容
  private replaceCardContent(card: Element, video: ContentItem): void {
    try {
      // 封面图
      const coverImg = card.querySelector('.bili-video-card__cover img') as HTMLImageElement;
      if (coverImg) {
        const coverBase = video.thumbnail + '@672w_378h_1c_!web-home-common-cover';
        coverImg.src = coverBase;
        coverImg.alt = video.title;

        // 处理picture标签中的source
        const sources = card.querySelectorAll('.bili-video-card__cover source');
        sources.forEach(source => {
          const srcElement = source as HTMLSourceElement;
          if (srcElement.type === 'image/avif') {
            srcElement.srcset = coverBase + '.avif';
          } else if (srcElement.type === 'image/webp') {
            srcElement.srcset = coverBase + '.webp';
          }
        });
      }

      // 链接
      const videoUrl = video.url;
      const imageLink = card.querySelector('.bili-video-card__image--link') as HTMLAnchorElement;
      const titleLink = card.querySelector('.bili-video-card__info--tit a') as HTMLAnchorElement;
      const ownerLink = card.querySelector('.bili-video-card__info--owner') as HTMLAnchorElement;

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
      const titleElement = card.querySelector('.bili-video-card__info--tit');
      if (titleElement) {
        titleElement.setAttribute('title', video.title);
      }

      // UP主
      const authorElement = card.querySelector('.bili-video-card__info--author');
      if (authorElement) {
        authorElement.textContent = video.author.displayName;
        authorElement.setAttribute('title', video.author.displayName);
      }

      // 统计数据
      const statsTexts = card.querySelectorAll('.bili-video-card__stats--text');
      if (statsTexts.length >= 2 && video.metrics) {
        statsTexts[0].textContent = NumberFormatter.formatLarge(video.metrics.views || 0);
        statsTexts[1].textContent = NumberFormatter.formatLarge(video.metrics.comments || 0);
      }

      // 时长
      const durationElement = card.querySelector('.bili-video-card__stats__duration');
      if (durationElement && video.duration) {
        durationElement.textContent = DateFormatter.formatDuration(video.duration);
      }

      // 发布时间
      const dateElement = card.querySelector('.bili-video-card__info--date');
      if (dateElement) {
        const formattedDate = DateFormatter.formatAbsolute(video.publishedAt, 'date').replace(/\//g, '-');
        dateElement.textContent = `· ${formattedDate}`;
      }

    } catch (error) {
      console.error('[Bilibili] 替换卡片内容失败:', error);
      throw error;
    }
  }

  // 延迟工具
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
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
}
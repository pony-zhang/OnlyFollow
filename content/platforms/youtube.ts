import type { PlatformAdapter, FollowedUser, ContentItem } from '../../shared/types';
import { PLATFORM_CONFIG, ERROR_MESSAGES } from '../../shared/constants';

export class YouTubeAdapter implements PlatformAdapter {
  readonly platform = 'youtube' as const;

  private readonly config = PLATFORM_CONFIG.youtube;

  isActive(): boolean {
    return window.location.hostname.includes('youtube.com');
  }

  async getFollowedUsers(): Promise<FollowedUser[]> {
    // TODO: 实现YouTube关注列表获取
    // 需要YouTube Data API v3
    console.warn('[YouTube] 关注列表获取功能待实现');
    return [];
  }

  async getUserContent(userId: string, limit?: number): Promise<ContentItem[]> {
    // TODO: 实现YouTube内容获取
    console.warn('[YouTube] 内容获取功能待实现');
    return [];
  }

  async replaceContent(content: ContentItem[]): Promise<void> {
    // TODO: 实现YouTube内容替换
    console.warn('[YouTube] 内容替换功能待实现');
  }

  detectContentArea(): Element | null {
    return document.querySelector(this.config.selectors.contentArea);
  }
}
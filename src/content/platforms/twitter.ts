import type { PlatformAdapter, FollowedUser, ContentItem } from '../../shared/types';
import { PLATFORM_CONFIG, ERROR_MESSAGES } from '../../shared/constants';

export class TwitterAdapter implements PlatformAdapter {
  readonly platform = 'twitter' as const;

  private readonly config = PLATFORM_CONFIG.twitter;

  isActive(): boolean {
    return window.location.hostname.includes('twitter.com') || window.location.hostname.includes('x.com');
  }

  async getFollowedUsers(): Promise<FollowedUser[]> {
    // TODO: 实现Twitter关注列表获取
    // 需要Twitter API v2
    console.warn('[Twitter] 关注列表获取功能待实现');
    return [];
  }

  async getUserContent(userId: string, limit?: number): Promise<ContentItem[]> {
    // TODO: 实现Twitter内容获取
    console.warn('[Twitter] 内容获取功能待实现');
    return [];
  }

  async replaceContent(content: ContentItem[]): Promise<void> {
    // TODO: 实现Twitter内容替换
    console.warn('[Twitter] 内容替换功能待实现');
  }

  detectContentArea(): Element | null {
    return document.querySelector(this.config.selectors.contentArea);
  }
}
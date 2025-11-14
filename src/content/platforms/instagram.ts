import type { PlatformAdapter, FollowedUser, ContentItem } from '../../shared/types';
import { PLATFORM_CONFIG, ERROR_MESSAGES } from '../../shared/constants';

export class InstagramAdapter implements PlatformAdapter {
  readonly platform = 'instagram' as const;

  private readonly config = PLATFORM_CONFIG.instagram;

  isActive(): boolean {
    return window.location.hostname.includes('instagram.com');
  }

  async getFollowedUsers(): Promise<FollowedUser[]> {
    // TODO: 实现Instagram关注列表获取
    // 需要Instagram Basic Display API
    console.warn('[Instagram] 关注列表获取功能待实现');
    return [];
  }

  async getUserContent(userId: string, limit?: number): Promise<ContentItem[]> {
    // TODO: 实现Instagram内容获取
    console.warn('[Instagram] 内容获取功能待实现');
    return [];
  }

  async replaceContent(content: ContentItem[]): Promise<void> {
    // TODO: 实现Instagram内容替换
    console.warn('[Instagram] 内容替换功能待实现');
  }

  detectContentArea(): Element | null {
    return document.querySelector(this.config.selectors.contentArea);
  }
}
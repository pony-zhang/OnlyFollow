// 数字格式化工具
export class NumberFormatter {
  // 格式化大数字
  static formatLarge(num: number): string {
    if (num === undefined || num === null) return '0';
    if (typeof num !== 'number') num = parseInt(num) || 0;

    if (num >= 100000000) {
      return (num / 100000000).toFixed(1) + '亿';
    }
    if (num >= 10000) {
      return (num / 10000).toFixed(1) + '万';
    }
    return num.toString();
  }

  // 格式化播放量
  static formatViews(views: number): string {
    return this.formatLarge(views) + ' 次观看';
  }

  // 格式化点赞数
  static formatLikes(likes: number): string {
    return this.formatLarge(likes) + ' 个赞';
  }

  // 格式化评论数
  static formatComments(comments: number): string {
    return this.formatLarge(comments) + ' 条评论';
  }

  // 格式化分享数
  static formatShares(shares: number): string {
    return this.formatLarge(shares) + ' 次分享';
  }
}

// 时间格式化工具
export class DateFormatter {
  // 格式化相对时间
  static formatRelative(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const months = Math.floor(days / 30);
    const years = Math.floor(months / 12);

    if (years > 0) return `${years}年前`;
    if (months > 0) return `${months}个月前`;
    if (days > 0) return `${days}天前`;
    if (hours > 0) return `${hours}小时前`;
    if (minutes > 0) return `${minutes}分钟前`;
    return '刚刚';
  }

  // 格式化绝对时间
  static formatAbsolute(timestamp: number, format: 'full' | 'date' | 'time' = 'full'): string {
    const date = new Date(timestamp);

    switch (format) {
      case 'full':
        return date.toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        });
      case 'date':
        return date.toLocaleDateString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        });
      case 'time':
        return date.toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit',
        });
      default:
        return date.toLocaleDateString('zh-CN');
    }
  }

  // 格式化时长
  static formatDuration(seconds: number): string {
    if (typeof seconds === 'string' && seconds.includes(':')) {
      return seconds;
    }

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    } else {
      return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
  }

  // 格式化发布时间
  static formatPublishTime(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;
    const oneDay = 24 * 60 * 60 * 1000;

    if (diff < oneDay) {
      return this.formatRelative(timestamp);
    } else {
      return this.formatAbsolute(timestamp, 'date');
    }
  }
}

// 文本格式化工具
export class TextFormatter {
  // 截断文本
  static truncate(text: string, maxLength: number, suffix: string = '...'): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - suffix.length) + suffix;
  }

  // 清理HTML标签
  static stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '');
  }

  // 转义HTML
  static escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // 高亮关键词
  static highlightKeywords(text: string, keywords: string[], className: string = 'highlight'): string {
    let result = text;
    keywords.forEach(keyword => {
      const regex = new RegExp(`(${keyword})`, 'gi');
      result = result.replace(regex, `<span class="${className}">$1</span>`);
    });
    return result;
  }

  // 移除表情符号
  static removeEmojis(text: string): string {
    const emojiRegex = /[\u{1f600}-\u{1f64f}]|[\u{1f300}-\u{1f5ff}]|[\u{1f680}-\u{1f6ff}]|[\u{1f1e0}-\u{1f1ff}]|[\u{2600}-\u{26ff}]|[\u{2700}-\u{27bf}]/gu;
    return text.replace(emojiRegex, '');
  }

  // 格式化标题
  static formatTitle(title: string, maxLength: number = 50): string {
    return this.truncate(title.trim(), maxLength);
  }

  // 格式化描述
  static formatDescription(description: string, maxLength: number = 100): string {
    const cleaned = this.stripHtml(description);
    return this.truncate(cleaned.trim(), maxLength);
  }
}

// URL格式化工具
export class UrlFormatter {
  // 获取域名
  static getDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch {
      return '';
    }
  }

  // 获取路径
  static getPath(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.pathname;
    } catch {
      return '';
    }
  }

  // 构建URL
  static buildUrl(base: string, params: Record<string, any>): string {
    try {
      const url = new URL(base);
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      });
      return url.toString();
    } catch {
      return base;
    }
  }

  // 验证URL
  static isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  // 规范化URL
  static normalizeUrl(url: string): string {
    if (!url) return '';

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    try {
      const urlObj = new URL(url);
      return urlObj.toString();
    } catch {
      return url;
    }
  }
}
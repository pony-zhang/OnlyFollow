import type { ContentItem, DOMReplacement } from "../types";

// DOM操作工具
export class DOMUtils {
  // 等待元素出现
  static waitForElement(
    selector: string,
    timeout: number = 10000,
    parent: Element | Document = document,
  ): Promise<Element | null> {
    return new Promise((resolve) => {
      const element = parent.querySelector(selector);
      if (element) {
        resolve(element);
        return;
      }

      const observer = new MutationObserver((mutations) => {
        const element = parent.querySelector(selector);
        if (element) {
          observer.disconnect();
          resolve(element);
        }
      });

      observer.observe(parent, {
        childList: true,
        subtree: true,
      });

      // 超时处理
      setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, timeout);
    });
  }

  // 等待多个元素出现
  static waitForElements(
    selector: string,
    count: number = 1,
    timeout: number = 10000,
    parent: Element | Document = document,
  ): Promise<Element[]> {
    return new Promise((resolve) => {
      const elements = Array.from(parent.querySelectorAll(selector));
      if (elements.length >= count) {
        resolve(elements.slice(0, count));
        return;
      }

      const observer = new MutationObserver((mutations) => {
        const allElements = Array.from(parent.querySelectorAll(selector));
        if (allElements.length >= count) {
          observer.disconnect();
          resolve(allElements.slice(0, count));
        }
      });

      observer.observe(parent, {
        childList: true,
        subtree: true,
      });

      // 超时处理
      setTimeout(() => {
        observer.disconnect();
        resolve(Array.from(parent.querySelectorAll(selector)));
      }, timeout);
    });
  }

  // 安全地设置元素属性
  static setAttributes(
    element: Element,
    attributes: Record<string, string>,
  ): void {
    Object.entries(attributes).forEach(([key, value]) => {
      if (value) {
        element.setAttribute(key, value);
      }
    });
  }

  // 安全地设置元素样式
  static setStyles(element: Element, styles: Record<string, string>): void {
    const htmlElement = element as HTMLElement;
    Object.entries(styles).forEach(([property, value]) => {
      if (value) {
        htmlElement.style.setProperty(property, value);
      }
    });
  }

  // 创建元素
  static createElement(
    tagName: string,
    attributes?: Record<string, string>,
    styles?: Record<string, string>,
    innerHTML?: string,
  ): HTMLElement {
    const element = document.createElement(tagName);

    if (attributes) {
      this.setAttributes(element, attributes);
    }

    if (styles) {
      this.setStyles(element, styles);
    }

    if (innerHTML) {
      element.innerHTML = innerHTML;
    }

    return element;
  }

  // 移除元素
  static removeElement(element: Element): void {
    if (element && element.parentNode) {
      element.parentNode.removeChild(element);
    }
  }

  // 替换元素内容
  static replaceContent(element: Element, newContent: string | Node): void {
    element.innerHTML = "";
    if (typeof newContent === "string") {
      element.innerHTML = newContent;
    } else {
      element.appendChild(newContent);
    }
  }

  // 添加事件监听器
  static addEventListener(
    element: Element,
    event: string,
    handler: EventListener,
    options?: AddEventListenerOptions,
  ): void {
    element.addEventListener(event, handler, options);
  }

  // 移除事件监听器
  static removeEventListener(
    element: Element,
    event: string,
    handler: EventListener,
  ): void {
    element.removeEventListener(event, handler);
  }

  // 检查元素是否可见
  static isVisible(element: Element): boolean {
    const style = window.getComputedStyle(element);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.opacity !== "0" &&
      element.hasChildNodes()
    );
  }

  // 获取元素的绝对位置
  static getElementPosition(element: Element): { x: number; y: number } {
    const rect = element.getBoundingClientRect();
    return {
      x: rect.left + window.scrollX,
      y: rect.top + window.scrollY,
    };
  }

  // 滚动到元素
  static scrollToElement(
    element: Element,
    behavior: ScrollBehavior = "smooth",
  ): void {
    element.scrollIntoView({ behavior, block: "center" });
  }

  // 监听DOM变化
  static observeChanges(
    callback: () => void,
    target: Element | Document = document,
    options: MutationObserverInit = { childList: true, subtree: true },
  ): MutationObserver {
    const observer = new MutationObserver(callback);
    observer.observe(target, options);
    return observer;
  }

  // 查找父级元素
  static findParent(
    element: Element,
    predicate: (parent: Element) => boolean,
    maxDepth: number = 10,
  ): Element | null {
    let current = element.parentElement;
    let depth = 0;

    while (current && depth < maxDepth) {
      if (predicate(current)) {
        return current;
      }
      current = current.parentElement;
      depth++;
    }

    return null;
  }

  // 查找子级元素
  static findChildren(
    parent: Element,
    predicate: (child: Element) => boolean,
  ): Element[] {
    const children = Array.from(parent.children);
    return children.filter(predicate);
  }
}

// 内容替换工具
export class ContentReplacer {
  // 替换文本内容
  static replaceText(element: Element, newText: string): void {
    if (element.textContent !== undefined) {
      element.textContent = newText;
    }
  }

  // 替换链接
  static replaceLink(element: Element, newUrl: string, newText?: string): void {
    if (element instanceof HTMLAnchorElement) {
      element.href = newUrl;
      if (newText) {
        element.textContent = newText;
      }
    }
  }

  // 替换图片
  static replaceImage(element: Element, newSrc: string, newAlt?: string): void {
    if (element instanceof HTMLImageElement) {
      element.src = newSrc;
      if (newAlt) {
        element.alt = newAlt;
      }
    }
  }

  // 批量替换内容
  static async replaceContent(
    replacements: DOMReplacement[],
    contentItems: ContentItem[],
  ): Promise<void> {
    for (let i = 0; i < replacements.length && i < contentItems.length; i++) {
      const replacement = replacements[i];
      const content = contentItems[i];

      try {
        const elements = document.querySelectorAll(replacement.selector);
        if (elements.length > 0) {
          const element = elements[i % elements.length];
          replacement.replacement(element, content);
        }
      } catch (error) {
        console.error("替换内容失败:", error);
      }
    }
  }

  // 创建内容卡片
  static createContentCard(
    content: ContentItem,
    platform: string,
  ): HTMLElement {
    const card = DOMUtils.createElement("div", {
      class: `onlyfollow-content-card onlyfollow-${platform}`,
    });

    // 缩略图
    if (content.thumbnail) {
      const thumbnail = DOMUtils.createElement("img", {
        class: "onlyfollow-thumbnail",
        src: content.thumbnail,
        alt: content.title,
      });
      card.appendChild(thumbnail);
    }

    // 内容信息
    const info = DOMUtils.createElement("div", {
      class: "onlyfollow-info",
    });

    // 标题
    const title = DOMUtils.createElement("a", {
      class: "onlyfollow-title",
      href: content.url,
      target: "_blank",
    });
    title.textContent = content.title;
    info.appendChild(title);

    // 作者
    const author = DOMUtils.createElement("div", {
      class: "onlyfollow-author",
    });
    author.textContent = content.author.displayName;
    info.appendChild(author);

    // 发布时间
    const publishedAt = DOMUtils.createElement("div", {
      class: "onlyfollow-published-at",
    });
    publishedAt.textContent = new Date(
      content.publishedAt,
    ).toLocaleDateString();
    info.appendChild(publishedAt);

    // 指标数据
    if (content.metrics) {
      const metrics = DOMUtils.createElement("div", {
        class: "onlyfollow-metrics",
      });

      if (content.metrics.views) {
        const views = DOMUtils.createElement("span", {
          class: "onlyfollow-views",
        });
        views.textContent = this.formatNumber(content.metrics.views);
        metrics.appendChild(views);
      }

      if (content.metrics.likes) {
        const likes = DOMUtils.createElement("span", {
          class: "onlyfollow-likes",
        });
        likes.textContent = this.formatNumber(content.metrics.likes);
        metrics.appendChild(likes);
      }

      info.appendChild(metrics);
    }

    card.appendChild(info);

    return card;
  }

  // 格式化数字
  private static formatNumber(num: number): string {
    if (num >= 10000) {
      return (num / 10000).toFixed(1) + "万";
    }
    return num.toString();
  }
}

// 页面检测工具
export class PageDetector {
  // 检测页面类型
  static detectPageType(): string {
    const url = window.location.href;
    const hostname = window.location.hostname;

    // Bilibili
    if (hostname.includes("bilibili.com")) {
      if (url.includes("/video/")) return "bilibili_video";
      if (url.includes("/space/")) return "bilibili_space";
      return "bilibili_home";
    }

    // YouTube
    if (hostname.includes("youtube.com")) {
      if (url.includes("/watch")) return "youtube_watch";
      if (
        url.includes("/channel/") ||
        url.includes("/c/") ||
        url.includes("/@")
      )
        return "youtube_channel";
      if (url.includes("/results")) return "youtube_search";
      return "youtube_home";
    }

    // Twitter/X
    if (hostname.includes("twitter.com") || hostname.includes("x.com")) {
      if (url.includes("/status/")) return "twitter_tweet";
      if (url.includes("/home")) return "twitter_home";
      return "twitter_general";
    }

    // Instagram
    if (hostname.includes("instagram.com")) {
      if (url.includes("/p/")) return "instagram_post";
      if (url.includes("/reel/")) return "instagram_reel";
      return "instagram_home";
    }

    return "unknown";
  }

  // 检测是否为支持的平台
  static isSupportedPlatform(): boolean {
    return this.detectPageType() !== "unknown";
  }

  // 等待页面加载完成
  static waitForPageLoad(): Promise<void> {
    return new Promise((resolve) => {
      if (document.readyState === "complete") {
        resolve();
        return;
      }

      const handleLoad = () => {
        window.removeEventListener("load", handleLoad);
        resolve();
      };

      window.addEventListener("load", handleLoad);
    });
  }
}

/**
 * 资源文件处理工具
 */

import { promises as fs } from "fs";
import { join, basename, dirname } from "path";
import { AssetConfig } from "../config";
import { logger } from "./logger";

export class AssetProcessor {
  private processedAssets = new Set<string>();

  async processAssets(assets: AssetConfig[]): Promise<void> {
    logger.log("📁 开始处理静态资源...", "info");

    for (let i = 0; i < assets.length; i++) {
      const asset = assets[i];
      logger.progress(i + 1, assets.length, `处理 ${asset.from}`);
      await this.processAsset(asset);
    }

    logger.log(`✅ 静态资源处理完成，共处理 ${assets.length} 个资源`, "success");
  }

  private async processAsset(asset: AssetConfig): Promise<void> {
    try {
      switch (asset.type) {
        case "file":
          await this.copyFile(asset);
          break;
        case "directory":
          await this.copyDirectory(asset);
          break;
        case "glob":
          await this.copyGlob(asset);
          break;
      }
    } catch (error) {
      logger.addError(`处理资源失败: ${asset.from} -> ${asset.to}`, error as Error);
    }
  }

  private async copyFile(asset: AssetConfig): Promise<void> {
    const fromPath = asset.from;
    const toPath = asset.to;

    // 确保目标目录存在
    await this.ensureDirectory(dirname(toPath));

    // 检查是否已处理（用于增量构建）
    if (this.processedAssets.has(fromPath)) {
      return;
    }

    let content: string | Uint8Array;

    // 读取源文件
    if (fromPath.endsWith(".png") || fromPath.endsWith(".jpg") || fromPath.endsWith(".jpeg") || fromPath.endsWith(".gif") || fromPath.endsWith(".ico")) {
      // 二进制文件
      content = await fs.readFile(fromPath);
    } else {
      // 文本文件
      content = await fs.readFile(fromPath, "utf-8");
    }

    // 应用转换（如果有）
    if (asset.transform) {
      content = asset.transform(content);
    }

    // 写入目标文件
    if (typeof content === "string") {
      await fs.writeFile(toPath, content, "utf-8");
    } else {
      await fs.writeFile(toPath, content);
    }

    // 记录文件大小
    const stats = await fs.stat(fromPath);
    logger.addFile(basename(fromPath), toPath, stats.size);
    this.processedAssets.add(fromPath);
  }

  private async copyDirectory(asset: AssetConfig): Promise<void> {
    const fromPath = asset.from;
    const toPath = asset.to;

    // 确保目标目录存在
    await this.ensureDirectory(toPath);

    // 递归复制目录
    await this.copyDirectoryRecursive(fromPath, toPath);
  }

  private async copyDirectoryRecursive(source: string, target: string): Promise<void> {
    const entries = await fs.readdir(source, { withFileTypes: true });

    await this.ensureDirectory(target);

    for (const entry of entries) {
      const sourcePath = join(source, entry.name);
      const targetPath = join(target, entry.name);

      if (entry.isDirectory()) {
        await this.copyDirectoryRecursive(sourcePath, targetPath);
      } else {
        await this.copyFile({
          from: sourcePath,
          to: targetPath,
          type: "file",
        });
      }
    }
  }

  private async copyGlob(asset: AssetConfig): Promise<void> {
    // 简单的 glob 实现（可以替换为更强大的库）
    const globPattern = asset.from;
    const targetDir = asset.to;

    await this.ensureDirectory(targetDir);

    // 这里可以实现更复杂的 glob 匹配逻辑
    // 为了简单起见，暂时只支持基本的 * 通配符
    if (globPattern.includes("*")) {
      logger.addWarning(`Glob 模式暂未完全支持: ${globPattern}`);
    }
  }

  private async ensureDirectory(dirPath: string): Promise<void> {
    try {
      await fs.access(dirPath);
    } catch {
      await fs.mkdir(dirPath, { recursive: true });
    }
  }

  reset(): void {
    this.processedAssets.clear();
  }
}

export const assetProcessor = new AssetProcessor();
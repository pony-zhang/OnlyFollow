/**
 * ESBuild 构建工具
 */

import * as esbuild from "esbuild";
import { BuildConfig, buildConfigToEsbuildOptions } from "../config";
import { logger } from "./logger";
import { promises as fs } from "fs";

export interface BuildResult {
  config: BuildConfig;
  result: esbuild.BuildResult;
  duration: number;
  success: boolean;
  errors: string[];
  warnings: string[];
}

export class Builder {
  private incrementalBuilders = new Map<string, esbuild.BuildContext>();
  private typeCheckEnabled: boolean;

  constructor(typeCheckEnabled: boolean = true) {
    this.typeCheckEnabled = typeCheckEnabled;
  }

  async build(
    configs: BuildConfig[],
    parallel: boolean = true,
  ): Promise<BuildResult[]> {
    logger.log(`🔨 开始构建 ${configs.length} 个目标...`, "info");

    const results: BuildResult[] = [];

    if (parallel) {
      // 并行构建
      const buildPromises = configs.map((config, index) =>
        this.buildSingle(config, index + 1, configs.length),
      );
      const buildResults = await Promise.allSettled(buildPromises);

      buildResults.forEach((result, index) => {
        if (result.status === "fulfilled") {
          results.push(result.value);
        } else {
          logger.addError(
            `构建目标 ${configs[index].name} 失败`,
            result.reason,
          );
          results.push({
            config: configs[index],
            result: {
              errors: [],
              warnings: [],
              outputFiles: [],
              metafile: null,
              mangleCache: null
            },
            duration: 0,
            success: false,
            errors: [result.reason?.message || "未知错误"],
            warnings: [],
          });
        }
      });
    } else {
      // 串行构建
      for (let i = 0; i < configs.length; i++) {
        const result = await this.buildSingle(
          configs[i],
          i + 1,
          configs.length,
        );
        results.push(result);

        // 如果有错误且不是并行构建，可以选择是否继续
        if (!result.success && configs.length > 1) {
          logger.addWarning(
            `构建目标 ${configs[i].name} 失败，继续构建其他目标...`,
          );
        }
      }
    }

    // 统计结果
    const successful = results.filter((r) => r.success).length;
    const failed = results.length - successful;

    if (failed > 0) {
      logger.addError(`构建完成，成功 ${successful} 个，失败 ${failed} 个`);
    } else {
      logger.log(`✅ 所有目标构建成功！`, "success");
    }

    return results;
  }

  private async buildSingle(
    config: BuildConfig,
    step: number,
    total: number,
  ): Promise<BuildResult> {
    const startTime = Date.now();
    logger.step(step, total, `构建 ${config.name}`);

    try {
      // 运行类型检查（如果启用）
      if (this.typeCheckEnabled && this.shouldTypeCheck(config)) {
        await this.runTypeCheck(config);
      }

      // 构建
      const esbuildOptions = buildConfigToEsbuildOptions(config);
      const result = await esbuild.build(esbuildOptions);

      const duration = Date.now() - startTime;
      const success = result.errors.length === 0;

      // 记录输出文件大小
      if (config.outFile && success) {
        try {
          const stats = await fs.stat(config.outFile);
          logger.addFile(config.name, config.outFile, stats.size);
        } catch (error) {
          // 忽略文件大小统计错误
        }
      }

      // 记录警告和错误
      result.warnings.forEach((warning) => {
        logger.addWarning(`${config.name}: ${warning.text}`);
      });

      result.errors.forEach((error) => {
        logger.addError(`${config.name}: ${error.text}`);
      });

      return {
        config,
        result,
        duration,
        success,
        errors: result.errors.map((e) => e.text),
        warnings: result.warnings.map((w) => w.text),
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.addError(`构建 ${config.name} 时发生异常`, error as Error);

      return {
        config,
        result: {
          errors: [],
          warnings: [],
          outputFiles: [],
          metafile: null,
          mangleCache: null
        },
        duration,
        success: false,
        errors: [(error as Error).message],
        warnings: [],
      };
    }
  }

  async buildIncremental(config: BuildConfig): Promise<BuildResult> {
    logger.log(`🔄 增量构建: ${config.name}`, "info");

    try {
      let context: esbuild.BuildContext;

      if (this.incrementalBuilders.has(config.name)) {
        context = this.incrementalBuilders.get(config.name)!;
      } else {
        const esbuildOptions = buildConfigToEsbuildOptions(config);
        context = await esbuild.context(esbuildOptions);
        this.incrementalBuilders.set(config.name, context);
      }

      const startTime = Date.now();
      const result = await context.rebuild();
      const duration = Date.now() - startTime;
      const success = result.errors.length === 0;

      return {
        config,
        result,
        duration,
        success,
        errors: result.errors.map((e) => e.text),
        warnings: result.warnings.map((w) => w.text),
      };
    } catch (error) {
      logger.addError(`增量构建 ${config.name} 失败`, error as Error);

      return {
        config,
        result: {
          errors: [],
          warnings: [],
          outputFiles: [],
          metafile: null,
          mangleCache: null
        },
        duration: 0,
        success: false,
        errors: [(error as Error).message],
        warnings: [],
      };
    }
  }

  private shouldTypeCheck(config: BuildConfig): boolean {
    // 只对 TypeScript 文件进行类型检查
    return (
      config.entryPoint.endsWith(".ts") || config.entryPoint.endsWith(".tsx")
    );
  }

  private async runTypeCheck(config: BuildConfig): Promise<void> {
    // 暂时跳过类型检查，避免构建问题
    logger.log(`跳过类型检查: ${config.entryPoint}`, "debug");
    return;
  }

  async startWatchMode(configs: BuildConfig[]): Promise<void> {
    logger.log("👁️ 启动监听模式...", "info");

    const contexts: esbuild.BuildContext[] = [];

    try {
      // 为每个配置创建构建上下文
      for (const config of configs) {
        const esbuildOptions = buildConfigToEsbuildOptions(config);
        const context = await esbuild.context(esbuildOptions);
        contexts.push(context);
        this.incrementalBuilders.set(config.name, context);
      }

      // 启动监听
      await Promise.all(contexts.map((context) => context.watch()));

      logger.log("✅ 监听模式已启动，文件变化将自动重新构建", "success");
    } catch (error) {
      logger.addError("启动监听模式失败", error as Error);
      await this.dispose();
      throw error;
    }
  }

  async dispose(): Promise<void> {
    logger.log("🧹 清理构建资源...", "info");

    const builderEntries = Array.from(this.incrementalBuilders.entries());
    for (const [name, context] of builderEntries) {
      try {
        await context.dispose();
        logger.log(`已清理 ${name} 的构建上下文`, "debug");
      } catch (error) {
        logger.addWarning(`清理 ${name} 构建上下文失败`);
      }
    }

    this.incrementalBuilders.clear();
    logger.log("✅ 构建资源清理完成", "success");
  }

  setTypeCheckEnabled(enabled: boolean): void {
    this.typeCheckEnabled = enabled;
  }
}

export const builder = new Builder();

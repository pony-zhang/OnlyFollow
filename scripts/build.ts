#!/usr/bin/env bun

/**
 * 优化的构建脚本
 */

import { program } from "commander";
import { createProjectConfig, BuildEnvironment } from "./config";
import { builder } from "./utils/builder";
import { assetProcessor } from "./utils/assets";
import { logger } from "./utils/logger";
import { promises as fs } from "fs";

export interface BuildOptions {
  mode: "development" | "production";
  watch?: boolean;
  analyze?: boolean;
  typecheck?: boolean;
  parallel?: boolean;
  clean?: boolean;
}

async function cleanOutputDir(outputDir: string): Promise<void> {
  try {
    await fs.access(outputDir);
    await fs.rm(outputDir, { recursive: true });
    logger.log(`🗑️ 已清理输出目录: ${outputDir}`, "info");
  } catch {
    // 目录不存在，无需清理
  }
}

async function ensureOutputDir(outputDir: string): Promise<void> {
  try {
    await fs.access(outputDir);
  } catch {
    await fs.mkdir(outputDir, { recursive: true });
    logger.log(`📁 创建输出目录: ${outputDir}`, "info");
  }
}

export async function buildProject(options: BuildOptions): Promise<void> {
  const startTime = Date.now();
  logger.reset();
  assetProcessor.reset();

  logger.start();

  try {
    // 创建项目配置
    const environment: BuildEnvironment = {
      mode: options.mode,
      watch: options.watch,
      analyze: options.analyze,
      incremental: true, // 默认启用增量构建
    };

    const projectConfig = createProjectConfig(environment);

    // 清理输出目录
    if (options.clean) {
      await cleanOutputDir(projectConfig.outputDir);
    }

    // 确保输出目录存在
    await ensureOutputDir(projectConfig.outputDir);

    // 设置类型检查
    builder.setTypeCheckEnabled(options.typecheck ?? true);

    // 构建代码
    const buildResults = await builder.build(
      projectConfig.entryPoints,
      options.parallel !== false, // 默认并行构建
    );

    // 检查是否有构建错误
    const hasErrors = buildResults.some((result) => !result.success);
    if (hasErrors) {
      logger.addError("存在构建错误，构建失败");
      process.exit(1);
    }

    // 处理静态资源
    await assetProcessor.processAssets(projectConfig.assets);

    // 构建分析
    if (options.analyze) {
      printBuildAnalysis(buildResults, Date.now() - startTime);
    }

    logger.end();

    // 监听模式（暂时简化实现）
    if (options.watch) {
      logger.log("👁️ 监听文件变化中... (按 Ctrl+C 退出)", "info");
      logger.log("⚠️ 文件监听模式正在开发中，当前只执行一次构建", "warning");

      // 保持进程运行，等待用户手动退出
      await new Promise(() => {}); // 永远不resolve，等待信号中断
    }
  } catch (error) {
    logger.addError("构建过程中发生异常", error as Error);
    logger.end();
    await builder.dispose();
    process.exit(1);
  }
}

function printBuildAnalysis(results: any[], totalTime: number): void {
  logger.log("\n📊 构建分析报告", "info");
  logger.log("=".repeat(50), "info");

  const totalCodeSize = results.reduce((sum, result) => {
    if (result.success && result.config.outFile) {
      try {
        // 这里应该读取实际文件大小
        return sum + 0; // 占位符
      } catch {
        return sum;
      }
    }
    return sum;
  }, 0);

  logger.log(`总构建时间: ${totalTime}ms`, "info");
  logger.log(`构建目标数量: ${results.length}`, "info");
  logger.log(`代码总大小: ${formatSize(totalCodeSize)}`, "info");

  logger.log("\n构建目标详情:", "info");
  results.forEach((result, index) => {
    const status = result.success ? "✅" : "❌";
    logger.log(
      `  ${status} ${result.config.name} (${result.duration}ms)`,
      result.success ? "success" : "error",
    );

    if (result.warnings.length > 0) {
      logger.log(`    ⚠️ 警告: ${result.warnings.length}`, "warning");
    }

    if (result.errors.length > 0) {
      logger.log(`    ❌ 错误: ${result.errors.length}`, "error");
    }
  });
}

function formatSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

function setupAssetWatch(assets: any[]): void {
  // 这里可以实现文件监听逻辑
  // 当静态资源文件发生变化时，重新复制相应的文件
  logger.log("📁 监听静态资源变化...", "info");
}

// 处理程序退出信号
process.on("SIGINT", async () => {
  logger.log("\n🛑 接收到退出信号，正在清理资源...", "warning");
  await builder.dispose();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  logger.log("\n🛑 接收到终止信号，正在清理资源...", "warning");
  await builder.dispose();
  process.exit(0);
});

// 命令行接口
program
  .name("build")
  .description("OnlyFollow Chrome 扩展构建工具")
  .version("1.0.0");

program
  .command("build")
  .description("构建项目")
  .option(
    "-m, --mode <mode>",
    "构建模式 (development|production)",
    "production",
  )
  .option("-w, --watch", "启用文件监听模式")
  .option("-a, --analyze", "显示构建分析报告")
  .option("--no-typecheck", "禁用类型检查")
  .option("--no-parallel", "禁用并行构建")
  .option("-c, --clean", "构建前清理输出目录")
  .action(async (options: BuildOptions) => {
    await buildProject(options);
  });

program
  .command("dev")
  .description(
    "开发模式构建（等同于 build --mode development --watch --no-clean",
  )
  .option("--no-typecheck", "禁用类型检查")
  .option("--no-parallel", "禁用并行构建")
  .action(async (options: Partial<BuildOptions>) => {
    await buildProject({
      mode: "development",
      watch: true,
      clean: false,
      analyze: false,
      ...options,
    });
  });

program
  .command("prod")
  .description("生产模式构建（等同于 build --mode production --clean")
  .option("-a, --analyze", "显示构建分析报告")
  .action(async (options: Partial<BuildOptions>) => {
    await buildProject({
      mode: "production",
      watch: false,
      clean: true,
      parallel: true,
      typecheck: true,
      ...options,
    });
  });

// 解析命令行参数
program.parse();

// 如果没有提供命令，默认执行生产构建
if (!process.argv.slice(2).length) {
  buildProject({
    mode: "production",
    watch: false,
    clean: false,
    parallel: true,
    typecheck: true,
  });
}

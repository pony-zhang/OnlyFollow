/**
 * 构建日志工具
 */

// 使用 ANSI 颜色码，因为 Bun 的 colors 可能不可用
const colors = {
  blue: (text: string) => `\x1b[34m${text}\x1b[0m`,
  green: (text: string) => `\x1b[32m${text}\x1b[0m`,
  yellow: (text: string) => `\x1b[33m${text}\x1b[0m`,
  red: (text: string) => `\x1b[31m${text}\x1b[0m`,
  gray: (text: string) => `\x1b[90m${text}\x1b[0m`,
  cyan: (text: string) => `\x1b[36m${text}\x1b[0m`,
};

export type LogLevel = "info" | "success" | "warning" | "error" | "debug";

export interface BuildStats {
  startTime: number;
  endTime: number;
  duration: number;
  files: Array<{
    name: string;
    size: number;
    path: string;
  }>;
  totalSize: number;
  errors: number;
  warnings: number;
}

export class BuildLogger {
  private stats: Partial<BuildStats> = {
    files: [],
    errors: 0,
    warnings: 0,
  };

  start(): void {
    this.stats.startTime = Date.now();
    this.log("🚀 开始构建...", "info");
  }

  end(): void {
    this.stats.endTime = Date.now();
    this.stats.duration = this.stats.endTime - (this.stats.startTime || 0);
    this.stats.totalSize =
      this.stats.files?.reduce((sum, file) => sum + file.size, 0) || 0;

    this.log(`✅ 构建完成！耗时: ${this.stats.duration}ms`, "success");
    this.log(`📦 构建统计:`, "info");
    this.log(`  - 文件数量: ${this.stats.files?.length || 0}`, "info");
    this.log(`  - 总大小: ${this.formatSize(this.stats.totalSize)}`, "info");
    this.log(
      `  - 错误数量: ${this.stats.errors}`,
      this.stats.errors > 0 ? "error" : "success",
    );
    this.log(
      `  - 警告数量: ${this.stats.warnings}`,
      this.stats.warnings > 0 ? "warning" : "success",
    );

    if (this.stats.files && this.stats.files.length > 0) {
      this.log("\n📄 文件详情:", "info");
      this.stats.files.forEach((file) => {
        this.log(`  - ${file.name}: ${this.formatSize(file.size)}`, "info");
      });
    }
  }

  addFile(name: string, path: string, size: number): void {
    if (!this.stats.files) this.stats.files = [];
    this.stats.files.push({ name, path, size });
  }

  addError(message: string, error?: Error): void {
    this.stats.errors = (this.stats.errors || 0) + 1;
    this.log(`❌ ${message}`, "error");
    if (error) {
      console.error(error);
    }
  }

  addWarning(message: string): void {
    this.stats.warnings = (this.stats.warnings || 0) + 1;
    this.log(`⚠️ ${message}`, "warning");
  }

  log(message: string, level: LogLevel = "info"): void {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = `[${timestamp}]`;

    switch (level) {
      case "info":
        console.log(`${colors.blue(prefix)} ${message}`);
        break;
      case "success":
        console.log(`${colors.green(prefix)} ${message}`);
        break;
      case "warning":
        console.log(`${colors.yellow(prefix)} ${message}`);
        break;
      case "error":
        console.log(`${colors.red(prefix)} ${message}`);
        break;
      case "debug":
        console.log(`${colors.gray(prefix)} ${message}`);
        break;
    }
  }

  step(step: number, total: number, message: string): void {
    const progress = `[${step}/${total}]`;
    console.log(`${colors.cyan(progress)} ${colors.blue(message)}`);
  }

  progress(current: number, total: number, message: string): void {
    const percentage = Math.round((current / total) * 100);
    const progressBar = this.createProgressBar(percentage);
    console.log(`${progressBar} ${percentage}% ${message}`);
  }

  private createProgressBar(percentage: number, width: number = 20): string {
    const filled = Math.round((percentage / 100) * width);
    const empty = width - filled;
    const filledBar = "█".repeat(filled);
    const emptyBar = "░".repeat(empty);
    return `[${colors.green(filledBar)}${colors.gray(emptyBar)}]`;
  }

  private formatSize(bytes: number): string {
    const units = ["B", "KB", "MB", "GB"];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  getStats(): BuildStats {
    return {
      startTime: this.stats.startTime || 0,
      endTime: this.stats.endTime || 0,
      duration: this.stats.duration || 0,
      files: this.stats.files || [],
      totalSize: this.stats.totalSize || 0,
      errors: this.stats.errors || 0,
      warnings: this.stats.warnings || 0,
    };
  }

  reset(): void {
    this.stats = {
      files: [],
      errors: 0,
      warnings: 0,
    };
  }
}

// 创建默认日志实例
export const logger = new BuildLogger();

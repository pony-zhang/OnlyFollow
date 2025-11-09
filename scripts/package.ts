#!/usr/bin/env bun

/**
 * Chrome Extension 打包脚本
 */

import { build } from './build.js';
import { readdir, writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { createReadStream } from 'fs';
import { createGzip } from 'zlib';

interface PackageConfig {
  outputDir: string;
  distDir: string;
  packageName: string;
  version: string;
}

const config: PackageConfig = {
  outputDir: 'release',
  distDir: 'dist',
  packageName: 'onlyfocus',
  version: process.env.npm_package_version || '1.0.0'
};

/**
 * 检查 dist 目录是否存在且包含必要文件
 */
async function validateDistDir(): Promise<void> {
  try {
    const files = await readdir(config.distDir);
    const requiredFiles = ['manifest.json', 'content.js', 'background.js', 'popup.html'];

    for (const file of requiredFiles) {
      if (!files.includes(file)) {
        throw new Error(`Missing required file: ${file}`);
      }
    }

    console.log('✅ 构建文件验证通过');
  } catch (error) {
    console.error('❌ 构建文件验证失败:', error);
    throw error;
  }
}

/**
 * 创建版本信息文件
 */
async function createVersionInfo(): Promise<void> {
  const versionInfo = {
    name: config.packageName,
    version: config.version,
    buildTime: new Date().toISOString(),
    gitHash: await getGitHash(),
    buildEnvironment: process.env.NODE_ENV || 'production'
  };

  await writeFile(
    join(config.distDir, 'version.json'),
    JSON.stringify(versionInfo, null, 2)
  );

  console.log('✅ 版本信息文件已创建');
}

/**
 * 获取当前 Git 提交哈希
 */
async function getGitHash(): Promise<string> {
  try {
    const process = Bun.spawn(['git', 'rev-parse', '--short', 'HEAD']);
    const hash = await new Response(process.stdout).text();
    return hash.trim();
  } catch {
    return 'unknown';
  }
}

/**
 * 创建 ZIP 包
 */
async function createZipPackage(): Promise<string> {
  const zipFileName = `${config.packageName}-v${config.version}.zip`;
  const zipPath = join(config.outputDir, zipFileName);

  // 确保输出目录存在
  await ensureDir(config.outputDir);

  console.log(`📦 正在创建 ZIP 包: ${zipPath}`);

  // 使用相对路径执行 zip 命令
  const result = await Bun.$`cd ${config.distDir} && zip -r ../${config.outputDir}/${zipFileName} .`.quiet();

  if (result.exitCode !== 0) {
    const stderr = result.stderr.toString();
    const stdout = result.stdout.toString();
    throw new Error(`ZIP 创建失败 (退出码: ${result.exitCode})\n标准输出: ${stdout}\n错误输出: ${stderr}`);
  }

  // 验证 ZIP 文件是否创建成功
  const zipFile = Bun.file(zipPath);
  if (!await zipFile.exists()) {
    throw new Error('ZIP 文件创建失败');
  }

  console.log('✅ ZIP 包创建成功！');

  // 显示包大小
  const stats = await Bun.file(zipPath).text();
  const sizeInBytes = Bun.file(zipPath).size;
  console.log(`📊 包大小: ${(sizeInBytes / 1024 / 1024).toFixed(2)} MB`);

  return zipPath;
}

/**
 * 创建 CRX 包（可选，用于开发者模式）
 */
async function createCrxPackage(): Promise<string> {
  const crxFileName = `${config.packageName}-v${config.version}.crx`;
  const crxPath = join(config.outputDir, crxFileName);

  console.log('⚠️  CRX 创建功能需要 Chrome 浏览器或特殊工具');
  console.log('💡 建议直接上传 ZIP 包到 Chrome Web Store');

  return crxPath;
}

/**
 * 生成包信息报告
 */
async function generatePackageReport(zipPath: string): Promise<void> {
  const sizeInBytes = Bun.file(zipPath).size;
  const report = {
    packageName: config.packageName,
    version: config.version,
    packagePath: zipPath,
    packageSize: `${(sizeInBytes / 1024 / 1024).toFixed(2)} MB`,
    buildTime: new Date().toISOString(),
    filesIncluded: await countFiles(config.distDir)
  };

  console.log('\n📊 打包报告:');
  console.log('=' .repeat(50));
  Object.entries(report).forEach(([key, value]) => {
    console.log(`${key.padEnd(15)}: ${value}`);
  });
  console.log('='.repeat(50));

  // 保存报告到文件
  const reportPath = join(config.outputDir, `package-report-v${config.version}.json`);
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 详细报告已保存到: ${reportPath}`);
}

/**
 * 获取目录下所有文件
 */
async function getAllFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await getAllFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * 统计文件数量
 */
async function countFiles(dir: string): Promise<number> {
  const files = await getAllFiles(dir);
  return files.length;
}

/**
 * 确保目录存在
 */
async function ensureDir(dir: string): Promise<void> {
  try {
    await Bun.spawn(['mkdir', '-p', dir]).exited;
  } catch {
    // 目录已存在或创建失败，继续执行
  }
}

/**
 * 清理旧的包文件
 */
async function cleanOldPackages(): Promise<void> {
  try {
    await ensureDir(config.outputDir);
    const files = await readdir(config.outputDir);

    for (const file of files) {
      if (file.startsWith(config.packageName) && (file.endsWith('.zip') || file.endsWith('.crx'))) {
        const filePath = join(config.outputDir, file);
        await unlink(filePath);
        console.log(`🗑️  已删除旧包: ${file}`);
      }
    }
  } catch (error) {
    console.log('⚠️  清理旧包时出错:', error);
  }
}

/**
 * 主打包函数
 */
async function packageExtension(): Promise<void> {
  try {
    console.log('🚀 开始打包 Chrome 扩展...');
    console.log(`📦 包名: ${config.packageName}`);
    console.log(`🏷️  版本: ${config.version}`);

    // 1. 清理旧包
    await cleanOldPackages();

    // 2. 执行构建
    console.log('\n🔨 执行构建...');
    await build();

    // 3. 验证构建文件
    console.log('\n✅ 验证构建文件...');
    await validateDistDir();

    // 4. 创建版本信息
    console.log('\n📝 创建版本信息...');
    await createVersionInfo();

    // 5. 创建 ZIP 包
    console.log('\n📦 创建 ZIP 包...');
    const zipPath = await createZipPackage();

    // 6. 生成报告
    console.log('\n📊 生成打包报告...');
    await generatePackageReport(zipPath);

    console.log('\n🎉 打包完成！');
    console.log(`📁 包文件位置: ${zipPath}`);
    console.log('\n💡 下一步:');
    console.log('   1. 将 ZIP 包上传到 Chrome Web Store');
    console.log('   2. 填写商店信息和截图');
    console.log('   3. 提交审核');

  } catch (error) {
    console.error('\n❌ 打包失败:', error);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (import.meta.main) {
  packageExtension();
}

export { packageExtension };
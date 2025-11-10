#!/usr/bin/env bun

/**
 * 简化的构建脚本
 */

import * as esbuild from "esbuild";

async function build() {
  try {
    console.log("开始构建...");

    // 构建内容脚本 - 使用IIFE，因为content script不支持ES模块
    await esbuild.build({
      entryPoints: ["content/index.ts"],
      bundle: true,
      target: "chrome100",
      format: "iife",
      outfile: "dist/content.js",
      platform: "browser",
      external: ["chrome"],
      globalName: "OnlyFollowContent",
      banner: {
        js: "// Chrome extension content script\nglobalThis.chrome = chrome;\n",
      },
    });

    // 构建后台脚本 - 使用ES模块
    await esbuild.build({
      entryPoints: ["background/background.ts"],
      bundle: true,
      target: "chrome100",
      format: "esm",
      outfile: "dist/background.js",
      platform: "browser",
      external: ["chrome"],
      banner: {
        js: "// Chrome extension background script\n",
      },
    });

    // 构建弹窗 - 使用ES模块，包含React
    await esbuild.build({
      entryPoints: ["popup/popup.tsx"],
      bundle: true,
      target: "chrome100",
      format: "esm",
      outfile: "dist/popup.js",
      platform: "browser",
      external: ["chrome"],
      define: {
        "process.env.NODE_ENV": '"production"',
      },
      banner: {
        js: "// OnlyFollow popup\n",
      },
    });

    // 构建选项页面 - 使用ES模块，包含React
    await esbuild.build({
      entryPoints: ["options/options.tsx"],
      bundle: true,
      target: "chrome100",
      format: "esm",
      outfile: "dist/options.js",
      platform: "browser",
      external: ["chrome"],
      define: {
        "process.env.NODE_ENV": '"production"',
      },
      banner: {
        js: "// OnlyFollow options page\n",
      },
    });

    // 构建仪表板 - 使用ES模块，包含React
    await esbuild.build({
      entryPoints: ["dashboard/dashboard.tsx"],
      bundle: true,
      target: "chrome100",
      format: "esm",
      outfile: "dist/dashboard.js",
      platform: "browser",
      external: ["chrome"],
      define: {
        "process.env.NODE_ENV": '"production"',
      },
      banner: {
        js: "// OnlyFollow dashboard\n",
      },
    });

    // 复制HTML文件
    await Bun.write(
      "dist/popup.html",
      await Bun.file("popup/popup.html").text(),
    );
    await Bun.write(
      "dist/options.html",
      await Bun.file("options/options.html").text(),
    );
    await Bun.write(
      "dist/dashboard.html",
      await Bun.file("dashboard/dashboard.html").text(),
    );
    await Bun.write(
      "dist/manifest.json",
      await Bun.file("manifest.json").text(),
    );

    // 复制CSS文件
    await Bun.write("dist/popup.css", await Bun.file("popup/popup.css").text());
    await Bun.write(
      "dist/options.css",
      await Bun.file("options/options.css").text(),
    );
    await Bun.write(
      "dist/dashboard.css",
      await Bun.file("dashboard/dashboard.css").text(),
    );

    // 复制图标文件
    await Bun.write(
      "dist/assets/icons/icon16.png",
      await Bun.file("assets/icons/icon16.png").text(),
    );
    await Bun.write(
      "dist/assets/icons/icon32.png",
      await Bun.file("assets/icons/icon32.png").text(),
    );
    await Bun.write(
      "dist/assets/icons/icon48.png",
      await Bun.file("assets/icons/icon48.png").text(),
    );
    await Bun.write(
      "dist/assets/icons/icon128.png",
      await Bun.file("assets/icons/icon128.png").text(),
    );

    console.log("构建完成！");
  } catch (error) {
    console.error("构建失败:", error);
    process.exit(1);
  }
}

// 导出构建函数以供其他模块使用
export { build };

// 如果直接运行此脚本，执行构建
if (import.meta.main) {
  build();
}

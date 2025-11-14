/**
 * 构建配置文件
 */

import type { BuildOptions } from "esbuild";

export interface BuildConfig {
  name: string;
  entryPoint: string;
  outFile: string;
  format: "iife" | "esm" | "cjs";
  platform?: "browser" | "node";
  target?: string[];
  external?: string[];
  globalName?: string;
  banner?: string;
  footer?: string;
  define?: Record<string, string>;
  minify?: boolean;
  sourcemap?: boolean;
  jsx?: "transform" | "preserve";
  jsxFactory?: string;
  jsxFragment?: string;
  splitting?: boolean;
  treeShaking?: boolean;
}

export interface AssetConfig {
  from: string;
  to: string;
  type: "file" | "directory" | "glob";
  transform?: (content: string | Uint8Array) => string | Uint8Array;
}

export interface BuildEnvironment {
  mode: "development" | "production";
  watch?: boolean;
  analyze?: boolean;
  incremental?: boolean;
}

export interface ProjectConfig {
  entryPoints: BuildConfig[];
  assets: AssetConfig[];
  outputDir: string;
  environment: BuildEnvironment;
}

// 默认构建配置
export const defaultBuildConfig: BuildConfig[] = [
  {
    name: "content",
    entryPoint: "src/content/index.ts",
    outFile: "dist/content.js",
    format: "iife",
    platform: "browser",
    target: ["chrome100"],
    external: ["chrome"],
    globalName: "OnlyFollowContent",
    banner: "// Chrome extension content script\nglobalThis.chrome = chrome;\n",
    minify: false,
    sourcemap: false,
    treeShaking: true,
  },
  {
    name: "background",
    entryPoint: "src/background/background.ts",
    outFile: "dist/background.js",
    format: "esm",
    platform: "browser",
    target: ["chrome100"],
    external: ["chrome"],
    banner: "// Chrome extension background script\n",
    minify: false,
    sourcemap: false,
    treeShaking: true,
  },
  {
    name: "popup",
    entryPoint: "src/pages/popup/popup.tsx",
    outFile: "dist/popup.js",
    format: "esm",
    platform: "browser",
    target: ["chrome100"],
    external: ["chrome"],
    jsx: "automatic",
    banner: "// OnlyFollow popup\n",
    minify: false,
    sourcemap: false,
    treeShaking: true,
  },
  {
    name: "options",
    entryPoint: "src/pages/options/options.tsx",
    outFile: "dist/options.js",
    format: "esm",
    platform: "browser",
    target: ["chrome100"],
    external: ["chrome"],
    jsx: "automatic",
    banner: "// OnlyFollow options page\n",
    minify: false,
    sourcemap: false,
    treeShaking: true,
  },
  {
    name: "dashboard",
    entryPoint: "src/pages/dashboard/dashboard.tsx",
    outFile: "dist/dashboard.js",
    format: "esm",
    platform: "browser",
    target: ["chrome100"],
    external: ["chrome"],
    jsx: "automatic",
    banner: "// OnlyFollow dashboard\n",
    minify: false,
    sourcemap: false,
    treeShaking: true,
  },
];

// 静态资源配置
export const defaultAssetConfig: AssetConfig[] = [
  // HTML 文件
  { from: "src/pages/popup/popup.html", to: "dist/popup.html", type: "file" },
  { from: "src/pages/options/options.html", to: "dist/options.html", type: "file" },
  { from: "src/pages/dashboard/dashboard.html", to: "dist/dashboard.html", type: "file" },

  // manifest 文件
  { from: "public/manifest.json", to: "dist/manifest.json", type: "file" },

  // CSS 文件
  { from: "src/pages/popup/popup.css", to: "dist/popup.css", type: "file" },
  { from: "src/pages/options/options.css", to: "dist/options.css", type: "file" },
  { from: "src/pages/dashboard/dashboard.css", to: "dist/dashboard.css", type: "file" },

  // 图标文件
  { from: "public/icons", to: "dist/assets/icons", type: "directory" },

  // 全局样式
  { from: "src/styles", to: "dist/styles", type: "directory" },
];

// 环境特定配置
export const environmentConfigs = {
  development: {
    mode: "development" as const,
    minify: false,
    sourcemap: "external" as const,
    define: {
      "process.env.NODE_ENV": '"development"',
      "process.env.DEBUG": "true",
    },
  },
  production: {
    mode: "production" as const,
    minify: true,
    sourcemap: false,
    define: {
      "process.env.NODE_ENV": '"production"',
      "process.env.DEBUG": "false",
    },
  },
};

export function createProjectConfig(
  environment: BuildEnvironment,
  customBuilds: BuildConfig[] = [],
  customAssets: AssetConfig[] = []
): ProjectConfig {
  const envConfig = environmentConfigs[environment.mode];

  const entryPoints = [
    ...defaultBuildConfig.map(build => ({
      ...build,
      ...envConfig,
      define: {
        ...build.define,
        ...envConfig.define,
      },
    })),
    ...customBuilds,
  ];

  return {
    entryPoints,
    assets: [...defaultAssetConfig, ...customAssets],
    outputDir: "dist",
    environment,
  };
}

// 工具函数：将 BuildConfig 转换为 esbuild BuildOptions
export function buildConfigToEsbuildOptions(config: BuildConfig): BuildOptions {
  return {
    entryPoints: [config.entryPoint],
    bundle: true,
    target: config.target || ["chrome100"],
    format: config.format,
    platform: config.platform || "browser",
    outfile: config.outFile,
    external: config.external,
    globalName: config.globalName,
    banner: config.banner ? { js: config.banner } : undefined,
    footer: config.footer ? { js: config.footer } : undefined,
    define: config.define,
    minify: config.minify,
    sourcemap: config.sourcemap,
    jsx: config.jsx,
    jsxFactory: config.jsxFactory,
    jsxFragment: config.jsxFragment,
    splitting: config.splitting,
    treeShaking: config.treeShaking,
    plugins: [], // 可以添加插件
  };
}
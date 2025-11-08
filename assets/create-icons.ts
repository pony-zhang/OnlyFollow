#!/usr/bin/env bun

/**
 * 创建简单的SVG图标文件
 */

const createIcon = (size: number) => {
  const yOffset = size/2 + size/8;
  const fontSize = size/4;
  const radius = size * 0.2;

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" rx="${radius}" fill="#1a73e8"/>
  <text x="${size/2}" y="${yOffset}" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="bold" text-anchor="middle" fill="white">OF</text>
</svg>`;
};

// 创建不同尺寸的图标
const sizes = [16, 32, 48, 128];

sizes.forEach(size => {
  const svg = createIcon(size);
  Bun.write(`assets/icons/icon${size}.png`, svg);
  console.log(`Created icon${size}.png`);
});

// 创建PNG版本 (这里用SVG代替，实际开发中需要转换为PNG)
console.log('图标文件创建完成！');
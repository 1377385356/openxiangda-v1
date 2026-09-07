/**
 * mime-types.mjs - MIME 类型映射
 *
 * 提供文件扩展名到 MIME 类型的映射，支持 JS/CSS/JSON/HTML、
 * 图片、字体和其他常见静态资源类型。
 */

import path from "node:path";

/** @type {Record<string, string>} 扩展名 → MIME 类型映射表 */
const MIME_MAP = {
  // 脚本 & 样式
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".html": "text/html",
  // 图片
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".avif": "image/avif",
  // 字体
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
  // 其他
  ".map": "application/json",
};

/**
 * 根据文件路径获取对应的 MIME 类型
 * @param {string} file - 文件路径
 * @returns {string} MIME 类型
 */
export function getContentType(file) {
  const ext = path.extname(file).toLowerCase();
  return MIME_MAP[ext] || "application/octet-stream";
}

/**
 * 判断文件名是否包含 content hash（如 logo-abc123.png）
 * 匹配模式：name-[8+位hex hash].ext
 * @param {string} file - 文件名或路径
 * @returns {boolean}
 */
export function hasContentHash(file) {
  const basename = path.basename(file);
  return /\-[a-f0-9]{8,}\.[^.]+$/.test(basename);
}

/**
 * 根据文件特征返回合适的 Cache-Control 头
 * - 带 content hash 的资源 → 长期缓存 + immutable
 * - 其他文件 → 长期缓存（依赖 buildId 路径做版本隔离）
 * @param {string} file - 文件路径
 * @returns {string} Cache-Control 头值
 */
export function getCacheControl(file) {
  if (hasContentHash(file)) {
    return "public, max-age=31536000, immutable";
  }
  // 入口文件依赖 buildId 路径做版本隔离，同样可以长期缓存
  return "public, max-age=31536000";
}

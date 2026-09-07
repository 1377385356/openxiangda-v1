/**
 * progress.mjs - 上传进度报告工具
 *
 * 提供文件上传进度跟踪，包括已完成数量、文件总大小、耗时统计。
 */

import fs from "node:fs";

/**
 * 创建进度跟踪器
 * @param {number} total - 总文件数
 * @returns {{ tick: (file: string, localPath: string) => void, summary: () => void }}
 */
export function createProgressTracker(total) {
  let completed = 0;
  let totalBytes = 0;
  const startTime = Date.now();

  return {
    /**
     * 标记一个文件上传完成
     * @param {string} ossKey - OSS 对象键（用于日志）
     * @param {string} localPath - 本地文件路径（用于计算大小）
     */
    tick(ossKey, localPath) {
      completed += 1;
      try {
        const stat = fs.statSync(localPath);
        totalBytes += stat.size;
      } catch {
        // 忽略 stat 失败
      }
      const pct = Math.round((completed / total) * 100);
      console.log(`  ✓ [${completed}/${total} ${pct}%] ${ossKey}`);
    },

    /**
     * 标记一个文件上传失败
     * @param {string} ossKey - OSS 对象键
     * @param {Error} error - 错误对象
     */
    fail(ossKey, error) {
      completed += 1;
      const pct = Math.round((completed / total) * 100);
      console.error(`  ✗ [${completed}/${total} ${pct}%] ${ossKey}: ${error.message}`);
    },

    /**
     * 打印上传汇总信息
     */
    summary() {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const sizeMB = (totalBytes / (1024 * 1024)).toFixed(2);
      console.log(`\n📊 上传统计: ${total} 个文件, ${sizeMB} MB, 耗时 ${elapsed}s`);
    },
  };
}

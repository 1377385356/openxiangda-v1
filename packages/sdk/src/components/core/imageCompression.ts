import type { ImageCompressionConfig, ImageCompressionVariantConfig } from '../types';

export type ImageVariantKind = 'thumb' | 'preview';

export interface CompressedImageVariant {
  kind: ImageVariantKind;
  file: File;
  width: number;
  height: number;
  contentType: string;
  quality?: number;
}

type DrawableSource = CanvasImageSource & {
  width?: number;
  height?: number;
  naturalWidth?: number;
  naturalHeight?: number;
  close?: () => void;
};

const DEFAULT_THUMB: Required<ImageCompressionVariantConfig> = {
  maxWidth: 320,
  maxHeight: 320,
  quality: 0.72,
  format: 'source',
};

const DEFAULT_PREVIEW: Required<ImageCompressionVariantConfig> = {
  maxWidth: 1280,
  maxHeight: 1280,
  quality: 0.82,
  format: 'source',
};

const COMPRESSIBLE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'bmp']);

export function shouldCreateImageVariants(file: File, config?: ImageCompressionConfig) {
  if (!config || config.enabled === false) return false;
  if (!isCompressibleImageFile(file)) return false;
  if (config.skipBelowBytes && file.size <= config.skipBelowBytes) return false;
  return true;
}

export async function createCompressedImageVariants(
  file: File,
  config?: ImageCompressionConfig,
): Promise<CompressedImageVariant[]> {
  if (!shouldCreateImageVariants(file, config)) return [];

  const variantConfigs: Array<[ImageVariantKind, ImageCompressionVariantConfig]> = [];
  if (config?.thumb !== false) {
    variantConfigs.push(['thumb', { ...DEFAULT_THUMB, ...(config?.thumb || {}) }]);
  }
  if (config?.preview !== false) {
    variantConfigs.push(['preview', { ...DEFAULT_PREVIEW, ...(config?.preview || {}) }]);
  }
  if (variantConfigs.length === 0) return [];

  const source = await loadImageSource(file);
  if (!source) return [];

  try {
    const sourceWidth = Math.max(1, source.naturalWidth || source.width || 0);
    const sourceHeight = Math.max(1, source.naturalHeight || source.height || 0);
    if (!sourceWidth || !sourceHeight) return [];

    const results: CompressedImageVariant[] = [];
    for (const [kind, variantConfig] of variantConfigs) {
      const normalized = normalizeVariantConfig(kind, variantConfig);
      const target = getTargetSize(sourceWidth, sourceHeight, normalized);
      const mimeType = resolveOutputMimeType(file, normalized.format);
      const blob = await drawCompressedBlob(
        source,
        target.width,
        target.height,
        mimeType,
        normalized.quality,
      );
      if (!blob || blob.size >= file.size) continue;

      const outputFile = new File([blob], buildVariantFileName(file.name, kind, mimeType), {
        type: blob.type || mimeType,
        lastModified: Date.now(),
      });
      results.push({
        kind,
        file: outputFile,
        width: target.width,
        height: target.height,
        contentType: outputFile.type || mimeType,
        quality: normalized.quality,
      });
    }
    return results;
  } finally {
    source.close?.();
  }
}

function isCompressibleImageFile(file: File) {
  const contentType = String(file.type || '').toLowerCase();
  if (contentType === 'image/svg+xml' || contentType === 'image/gif') return false;
  if (contentType.startsWith('image/')) {
    return ['image/jpeg', 'image/png', 'image/webp', 'image/bmp'].includes(contentType);
  }
  const extension = getExtension(file.name);
  return COMPRESSIBLE_EXTENSIONS.has(extension);
}

async function loadImageSource(file: File): Promise<DrawableSource | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      // Fall through to HTMLImageElement decoding below.
    }
  }
  if (typeof Image === 'undefined' || typeof URL === 'undefined') return null;
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = objectUrl;
    if (typeof image.decode === 'function') {
      await image.decode();
    } else {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('图片解码失败'));
      });
    }
    return image;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function normalizeVariantConfig(
  kind: ImageVariantKind,
  config: ImageCompressionVariantConfig,
): Required<ImageCompressionVariantConfig> {
  const fallback = kind === 'thumb' ? DEFAULT_THUMB : DEFAULT_PREVIEW;
  const maxWidth = Number(config.maxWidth || fallback.maxWidth);
  const maxHeight = Number(config.maxHeight || fallback.maxHeight);
  const quality = Number(config.quality ?? fallback.quality);
  return {
    maxWidth: Number.isFinite(maxWidth) && maxWidth > 0 ? maxWidth : fallback.maxWidth,
    maxHeight: Number.isFinite(maxHeight) && maxHeight > 0 ? maxHeight : fallback.maxHeight,
    quality:
      Number.isFinite(quality) && quality > 0 && quality <= 1 ? quality : fallback.quality,
    format: config.format || fallback.format,
  };
}

function getTargetSize(
  sourceWidth: number,
  sourceHeight: number,
  config: Required<ImageCompressionVariantConfig>,
) {
  const scale = Math.min(1, config.maxWidth / sourceWidth, config.maxHeight / sourceHeight);
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  };
}

function drawCompressedBlob(
  source: DrawableSource,
  width: number,
  height: number,
  mimeType: string,
  quality: number,
) {
  if (typeof document === 'undefined') return Promise.resolve(null);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context || typeof canvas.toBlob !== 'function') return Promise.resolve(null);
  context.drawImage(source, 0, 0, width, height);
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, mimeType, mimeType === 'image/png' ? undefined : quality);
  });
}

function resolveOutputMimeType(file: File, format?: ImageCompressionVariantConfig['format']) {
  if (format && format !== 'source') {
    return format === 'jpeg' ? 'image/jpeg' : `image/${format}`;
  }
  const sourceType = String(file.type || '').toLowerCase();
  if (['image/jpeg', 'image/png', 'image/webp'].includes(sourceType)) return sourceType;
  const extension = getExtension(file.name);
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  return 'image/jpeg';
}

function buildVariantFileName(fileName: string, kind: ImageVariantKind, mimeType: string) {
  const extension = extensionFromMimeType(mimeType);
  const baseName = String(fileName || 'image')
    .replace(/\.[^.]*$/, '')
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `${baseName || 'image'}.${kind}.${extension}`;
}

function extensionFromMimeType(mimeType: string) {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}

function getExtension(fileName: string) {
  return (
    String(fileName || '')
      .split('.')
      .pop()
      ?.toLowerCase() || ''
  );
}

import type { AttachmentItem, FormRuntimeApi } from '../types';
import { getAttachmentItemIdentity, getFileExtension } from '../fields/shared/fieldFormat';
import type {
  FilePreviewCapability,
  FilePreviewMetadata,
  PreparedFilePreview,
} from './types';

const IMAGE_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'gif',
  'bmp',
  'webp',
  'svg',
  'avif',
  'ico',
  'tif',
  'tiff',
  'heic',
  'heif',
]);
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'ogg', 'ogv', 'mov', 'm4v']);
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac']);
const DIRECT_XLSX_MAX_BYTES = 10 * 1024 * 1024;
const DIRECT_DOCX_MAX_BYTES = 20 * 1024 * 1024;
const DIRECT_HEIC_MAX_BYTES = 30 * 1024 * 1024;
const TEXT_EXTENSIONS = new Set([
  'txt',
  'csv',
  'tsv',
  'json',
  'xml',
  'log',
  'md',
  'markdown',
  'yaml',
  'yml',
  'ini',
  'conf',
  'properties',
  'sql',
  'js',
  'jsx',
  'ts',
  'tsx',
  'css',
  'scss',
  'less',
  'html',
  'htm',
  'java',
  'py',
  'go',
  'rs',
  'sh',
  'bash',
  'c',
  'cc',
  'cpp',
  'h',
  'hpp',
  'cs',
  'php',
  'rb',
  'vue',
]);

export const unwrapFilePreviewPayload = (payload: any) =>
  payload?.data ?? payload?.result ?? payload;

const getBinaryResponseMessage = (response: any): string =>
  String(
    response?.message ||
      response?.error ||
      response?.errorMessage ||
      response?.data?.message ||
      response?.data?.error ||
      response?.result?.message ||
      '',
  ).trim();

export const normalizePreviewBlobResponse = (response: unknown): Blob => {
  const payload = response as any;
  const candidates = [
    response,
    payload?.blob,
    payload?.data,
    payload?.data?.blob,
    payload?.result,
    payload?.result?.blob,
  ];
  const blob = candidates.find(
    candidate => typeof Blob !== 'undefined' && candidate instanceof Blob,
  );
  if (blob) return blob;

  throw new Error(getBinaryResponseMessage(payload) || '文件内容响应不是二进制数据');
};

const isZipBytes = (bytes: Uint8Array) =>
  bytes.length >= 4 &&
  bytes[0] === 0x50 &&
  bytes[1] === 0x4b &&
  ((bytes[2] === 0x03 && bytes[3] === 0x04) ||
    (bytes[2] === 0x05 && bytes[3] === 0x06) ||
    (bytes[2] === 0x07 && bytes[3] === 0x08));

const decodeBase64ZipBlob = async (blob: Blob): Promise<Blob> => {
  const prefix = (await blob.slice(0, 96).text())
    .replace(/^\uFEFF/, '')
    .replace(/\s+/g, '');
  if (!prefix.startsWith('UEsDB')) return blob;
  if (blob.size > 32 * 1024 * 1024) {
    throw new Error('Base64 文件超过浏览器兼容解码上限');
  }

  const base64 = (await blob.text()).replace(/^\uFEFF/, '').replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw new Error('文件内容是无效的 Base64 二进制数据');
  }

  let binary = '';
  try {
    binary = globalThis.atob(base64);
  } catch {
    throw new Error('文件内容是无效的 Base64 二进制数据');
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  if (!isZipBytes(bytes)) {
    throw new Error('Base64 文件解码后不是有效的 Office 文档');
  }
  if (
    globalThis.btoa(binary).replace(/=+$/, '') !==
    base64.replace(/=+$/, '')
  ) {
    throw new Error('文件内容是无效的 Base64 二进制数据');
  }
  return new Blob([bytes], { type: blob.type || 'application/zip' });
};

export const normalizePreviewBlobContent = async (
  response: unknown,
): Promise<Blob> => {
  const blob = normalizePreviewBlobResponse(response);
  if (String(blob.type || '').toLowerCase().includes('application/json')) {
    const payload = await blob
      .text()
      .then(value => JSON.parse(value))
      .catch(() => null);
    if (payload) {
      throw new Error(getBinaryResponseMessage(payload) || '文件内容请求失败');
    }
  }
  return decodeBase64ZipBlob(blob);
};

export const isDirectStorageItem = (item: AttachmentItem) =>
  item.provider === 'oss' ||
  item.uploadProvider === 'oss' ||
  item.uploadProvider === 'builtin-oss' ||
  Boolean(item.storageCode);

export const getPreviewItemKey = (item: AttachmentItem, index = 0) =>
  getAttachmentItemIdentity(item) || item.id || item.uid || `${item.name || 'file'}-${index}`;

export const getPreviewSourceUrl = (item: AttachmentItem) =>
  item.previewUrl || item.publicUrl || item.url || '';

const inferExtensionFromContentType = (contentType: string) => {
  if (contentType.includes('wordprocessingml')) return 'docx';
  if (contentType.includes('spreadsheetml')) return 'xlsx';
  if (contentType.includes('pdf')) return 'pdf';
  if (contentType.includes('heic')) return 'heic';
  if (contentType.includes('heif')) return 'heif';
  if (contentType.includes('tiff')) return 'tiff';
  if (contentType.includes('csv')) return 'csv';
  return '';
};

const downloadOnly = (extension: string, unsupportedReason: string): FilePreviewCapability => ({
  extension,
  previewType: 'download',
  renderMode: 'download',
  previewSurface: 'download',
  previewProvider: 'none',
  canPreview: false,
  canDownload: true,
  unsupportedReason,
});

export const resolveLocalPreviewCapability = (
  item: AttachmentItem,
): FilePreviewCapability => {
  const contentType = String(item.contentType || item.mimeType || '').toLowerCase();
  const extension =
    getFileExtension(item.name || item.originalName || item.objectName || '') ||
    inferExtensionFromContentType(contentType);
  const size = Number(item.size || 0);

  if (IMAGE_EXTENSIONS.has(extension) || contentType.startsWith('image/')) {
    if (
      ['heic', 'heif'].includes(extension) &&
      size > 0 &&
      size > DIRECT_HEIC_MAX_BYTES
    ) {
      return downloadOnly(extension, 'HEIC 图片超过 30MB 浏览器转换上限');
    }
    const platformTranscode =
      ['tif', 'tiff'].includes(extension) &&
      Boolean(item.objectName) &&
      !isDirectStorageItem(item);
    return {
      extension,
      previewType: 'image',
      renderMode: ['heic', 'heif'].includes(extension)
        ? 'image-heic'
        : platformTranscode
          ? 'image-transcode'
          : ['tif', 'tiff'].includes(extension)
            ? 'download'
          : 'inline',
      previewSurface: 'media',
      previewProvider: platformTranscode ? 'platform' : 'browser',
      canPreview: platformTranscode || !['tif', 'tiff'].includes(extension),
      canDownload: true,
      unsupportedReason: ['tif', 'tiff'].includes(extension)
        ? '直连 TIFF 文件需要平台文件服务转换后才能预览'
        : undefined,
    };
  }
  if (VIDEO_EXTENSIONS.has(extension) || contentType.startsWith('video/')) {
    return {
      extension,
      previewType: 'video',
      renderMode: 'inline',
      previewSurface: 'media',
      previewProvider: 'browser',
      canPreview: true,
      canDownload: true,
    };
  }
  if (AUDIO_EXTENSIONS.has(extension) || contentType.startsWith('audio/')) {
    return {
      extension,
      previewType: 'audio',
      renderMode: 'inline',
      previewSurface: 'media',
      previewProvider: 'browser',
      canPreview: true,
      canDownload: true,
    };
  }
  if (extension === 'pdf' || contentType.includes('pdf')) {
    return {
      extension: extension || 'pdf',
      previewType: 'pdf',
      renderMode: 'pdfjs',
      previewSurface: 'document',
      previewProvider: 'browser',
      canPreview: true,
      canDownload: true,
    };
  }
  if (extension === 'docx') {
    if (size > 0 && size > DIRECT_DOCX_MAX_BYTES) {
      return downloadOnly(extension, 'Word 文件超过 20MB 浏览器预览上限');
    }
    return {
      extension,
      previewType: 'office',
      renderMode: 'docx-html',
      previewSurface: 'document',
      previewProvider: 'browser',
      canPreview: true,
      canDownload: true,
    };
  }
  if (extension === 'xlsx') {
    if (size > 0 && size > DIRECT_XLSX_MAX_BYTES) {
      return downloadOnly(extension, 'Excel 文件超过 10MB 浏览器预览上限');
    }
    return {
      extension,
      previewType: 'spreadsheet',
      renderMode: 'excel-client',
      previewSurface: 'document',
      previewProvider: 'browser',
      canPreview: true,
      canDownload: true,
    };
  }
  if (TEXT_EXTENSIONS.has(extension) || contentType.startsWith('text/')) {
    return {
      extension,
      previewType: 'text',
      renderMode: 'text-client',
      previewSurface: 'document',
      previewProvider: 'browser',
      canPreview: true,
      canDownload: true,
    };
  }
  return downloadOnly(extension, '当前文件类型没有可用的在线预览器');
};

const getTicketObject = (ticket: any): FilePreviewMetadata =>
  typeof ticket === 'string' ? { previewUrl: ticket } : ticket || {};

export const prepareFilePreview = async (options: {
  item: AttachmentItem;
  api: FormRuntimeApi;
  appType?: string;
  bucketName: string;
}): Promise<PreparedFilePreview> => {
  const { item, api, appType, bucketName } = options;
  const direct = isDirectStorageItem(item) || !item.objectName;
  if (direct) {
    const capability = resolveLocalPreviewCapability(item);
    return {
      item,
      direct: true,
      metadata: {
        ...capability,
        fileName: item.name,
        size: item.size,
        contentType: item.contentType || item.mimeType,
        previewUrl: getPreviewSourceUrl(item),
        downloadUrl: item.downloadUrl || item.publicUrl || item.url,
      },
    };
  }

  const ticketResult = getTicketObject(
    await api.createFileAccessTicket(
      item.bucketName || bucketName,
      item.objectName!,
      item.name,
      'preview',
      { appType: item.appType || appType },
    ),
  );
  const localCapability = resolveLocalPreviewCapability(item);
  const ticket = String(ticketResult.ticket || '').trim();
  let metadata: FilePreviewMetadata = {};
  if (ticketResult.metadataUrl || ticket) {
    const response = await api.request({
      url:
        ticketResult.metadataUrl ||
        `/file/access-ticket/${encodeURIComponent(ticket)}`,
      method: 'get',
    });
    metadata = unwrapFilePreviewPayload(response) as FilePreviewMetadata;
  }

  return {
    item,
    direct: false,
    metadata: {
      ...localCapability,
      ...ticketResult,
      ...metadata,
      ticket: metadata.ticket || ticketResult.ticket,
      fileName: metadata.fileName || ticketResult.fileName || item.name,
      size: metadata.size ?? item.size,
      contentType:
        metadata.contentType || ticketResult.contentType || item.contentType || item.mimeType,
      previewUrl: ticketResult.previewUrl || metadata.previewUrl || getPreviewSourceUrl(item),
      downloadUrl:
        ticketResult.downloadUrl ||
        metadata.downloadUrl ||
        item.downloadUrl ||
        item.publicUrl ||
        item.url,
    },
  };
};

export const loadPreviewBlob = async (
  request: FormRuntimeApi['request'],
  url: string,
): Promise<Blob> => {
  const response = await request({ url, method: 'get', responseType: 'blob' });
  return normalizePreviewBlobContent(response);
};

export const convertHeicPreview = async (
  request: FormRuntimeApi['request'],
  url: string,
) => {
  const source = await loadPreviewBlob(request, url);
  const module = await import('heic2any');
  const converted = await module.default({
    blob: source,
    toType: 'image/jpeg',
    quality: 0.92,
  });
  const blob = Array.isArray(converted) ? converted[0] : converted;
  if (!(blob instanceof Blob)) {
    throw new Error('HEIC 图片转换失败');
  }
  return URL.createObjectURL(blob);
};

import type { AttachmentItem, FormRuntimeApi } from '../types';

export type FilePreviewType =
  | 'image'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'spreadsheet'
  | 'text'
  | 'office'
  | 'download';

export type FilePreviewRenderMode =
  | 'inline'
  | 'image-transcode'
  | 'image-heic'
  | 'pdfjs'
  | 'excel-basic'
  | 'excel-client'
  | 'text'
  | 'text-client'
  | 'docx-html'
  | 'onlyoffice'
  | 'office-text'
  | 'download';

export type FilePreviewSurface = 'media' | 'document' | 'download';
export type FilePreviewProvider =
  | 'browser'
  | 'platform'
  | 'onlyoffice'
  | 'none';

export interface FilePreviewCapability {
  key?: string;
  extension?: string;
  previewType?: FilePreviewType;
  renderMode?: FilePreviewRenderMode;
  previewSurface?: FilePreviewSurface;
  previewProvider?: FilePreviewProvider;
  canPreview?: boolean;
  canDownload?: boolean;
  unsupportedReason?: string;
}

export interface FilePreviewMetadata extends FilePreviewCapability {
  capabilityVersion?: number;
  ticket?: string;
  appType?: string;
  fileName?: string;
  bucketName?: string;
  objectName?: string;
  size?: number;
  contentType?: string;
  downloadUrl?: string;
  previewUrl?: string;
  previewPageUrl?: string;
  metadataUrl?: string;
  imagePreviewUrl?: string;
  excelPreviewUrl?: string;
  textPreviewUrl?: string;
  officeTextPreviewUrl?: string;
  onlyofficeConfigUrl?: string;
  onlyofficeEnabled?: boolean;
  expiresIn?: number;
}

export interface PreparedFilePreview {
  item: AttachmentItem;
  metadata: FilePreviewMetadata;
  direct: boolean;
}

export type FilePreviewRequest = FormRuntimeApi['request'];

export interface FilePreviewCapabilityBatch {
  capabilityVersion?: number;
  onlyofficeEnabled?: boolean;
  items?: FilePreviewCapability[];
}

export interface PreviewImageItem {
  key: string;
  src: string;
  name: string;
  revokeOnClose?: boolean;
}

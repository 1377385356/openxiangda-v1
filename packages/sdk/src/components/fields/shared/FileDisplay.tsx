import React from 'react';
import {
  AudioOutlined,
  CloseOutlined,
  DownloadOutlined,
  EyeOutlined,
  FileExcelOutlined,
  FileImageOutlined,
  FileOutlined,
  FilePdfOutlined,
  FilePptOutlined,
  FileTextOutlined,
  FileUnknownOutlined,
  FileWordOutlined,
  FileZipOutlined,
  PaperClipOutlined,
  PlusOutlined,
  UploadOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import type { AttachmentItem } from '../../types';
import { formatFileSize, getFileCategory, getFileExtension } from './fieldFormat';

export { PaperClipOutlined, PlusOutlined, UploadOutlined };

export function FileTypeIcon({
  item,
  className,
}: {
  item: Pick<AttachmentItem, 'name' | 'contentType'>;
  className?: string;
}) {
  const category = getFileCategory(item.name, item.contentType);
  const extension = getFileExtension(item.name);
  const icon =
    category === 'image' ? (
      <FileImageOutlined />
    ) : category === 'video' ? (
      <VideoCameraOutlined />
    ) : category === 'audio' ? (
      <AudioOutlined />
    ) : category === 'pdf' ? (
      <FilePdfOutlined />
    ) : category === 'excel' ? (
      <FileExcelOutlined />
    ) : category === 'word' ? (
      <FileWordOutlined />
    ) : category === 'ppt' ? (
      <FilePptOutlined />
    ) : category === 'archive' ? (
      <FileZipOutlined />
    ) : category === 'text' || category === 'code' ? (
      <FileTextOutlined />
    ) : extension ? (
      <FileOutlined />
    ) : (
      <FileUnknownOutlined />
    );

  return (
    <span className={`sy-file-icon sy-file-icon-${category} ${className || ''}`} aria-hidden="true">
      {icon}
      {category !== 'image' && extension ? <span>{extension.toUpperCase()}</span> : null}
    </span>
  );
}

export function FileActionButton({
  type,
  disabled,
  onClick,
  testId,
}: {
  type: 'preview' | 'download' | 'remove';
  disabled?: boolean;
  onClick?: () => void;
  testId?: string;
}) {
  const label = type === 'preview' ? '预览' : type === 'download' ? '下载' : '删除';
  const icon =
    type === 'preview' ? (
      <EyeOutlined />
    ) : type === 'download' ? (
      <DownloadOutlined />
    ) : (
      <CloseOutlined />
    );

  return (
    <button
      type="button"
      className={`sy-file-action sy-file-action-${type}`}
      disabled={disabled}
      onClick={onClick}
      data-testid={testId}
      aria-label={label}
      title={label}
    >
      {icon}
      <span className="sy-sr-only">{label}</span>
    </button>
  );
}

export function FileStatusText({
  item,
  showFileSize = true,
  showFileTypeBadge = true,
}: {
  item: AttachmentItem;
  showFileSize?: boolean;
  showFileTypeBadge?: boolean;
}) {
  const extension = getFileExtension(item.name);
  const text =
    item.status === 'uploading'
      ? `上传中 ${Math.round(item.percent ?? 0)}%`
      : item.status === 'error'
        ? item.error || '上传失败'
        : [
            showFileTypeBadge && extension ? extension.toUpperCase() : '',
            showFileSize ? formatFileSize(item.size) : '',
          ]
            .filter(Boolean)
            .join(' · ') || '已上传';

  return <span className="sy-file-sub">{text}</span>;
}

import React from 'react';
import type { AttachmentFieldProps, AttachmentItem } from '../../types';
import { useFormContext } from '../../core/FormContext';
import { useDeviceDetect } from '../../hooks/useDeviceDetect';
import { FileActionButton, FileStatusText, FileTypeIcon } from '../shared/FileDisplay';
import { useFilePreviewController } from '../../file-preview';

const getTicketUrl = (ticket: any, fallback?: string) =>
  typeof ticket === 'string'
    ? ticket
    : ticket?.previewUrl || ticket?.downloadUrl || ticket?.relayUrl || ticket?.url || fallback;

const isDirectStorageItem = (item: AttachmentItem) =>
  item.provider === 'oss' ||
  item.uploadProvider === 'oss' ||
  item.uploadProvider === 'builtin-oss' ||
  Boolean(item.storageCode);

export function AttachmentFieldReadonly({
  fieldId,
  readonlyClassName,
  bucketName = 'attachments',
  showPreview = true,
  showDownload = true,
  showFileSize = true,
  showFileTypeBadge = false,
}: AttachmentFieldProps) {
  const { formData, api, config } = useFormContext();
  const { isMobile } = useDeviceDetect();
  const value = (formData[fieldId] as AttachmentItem[] | undefined) ?? [];
  const preview = useFilePreviewController({
    items: value,
    api,
    appType: config.appType,
    bucketName,
    enabled: showPreview,
    requireServerCapability: true,
  });

  if (value.length === 0) {
    return (
      <div
        className={readonlyClassName || 'sy-field-readonly-value'}
        data-testid={`attachmentfield-readonly-${fieldId}`}
      >
        --
      </div>
    );
  }

  const downloadFile = async (item: AttachmentItem) => {
    let url = item.downloadUrl || item.url;
    if (isDirectStorageItem(item)) {
      url = item.downloadUrl || item.publicUrl || item.url;
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    if (item.objectName) {
      const ticket = await api.createDownloadTicket(
        item.bucketName || bucketName,
        item.objectName,
        item.name,
      );
      url = getTicketUrl(ticket, url);
    }
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  const rootClassName = [
    readonlyClassName || 'sy-field-readonly-value',
    'sy-readonly-files',
    'sy-readonly-attachments',
    isMobile ? 'is-mobile' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={rootClassName} data-testid={`attachmentfield-readonly-${fieldId}`}>
      <div className="sy-file-list">
        {value.map((item, index) => {
          const itemKey = item.id || item.uid || `${fieldId}-readonly-attachment-${String(index)}`;
          const canAct = item.status !== 'uploading' && item.status !== 'error';
          return (
            <div
              key={`${itemKey}-${index}`}
              className="sy-file-item"
              data-testid={`attachmentfield-readonly-item-${itemKey}`}
            >
              <FileTypeIcon item={item} />
              <div className="sy-file-meta">
                <a
                  className="sy-file-name"
                  href={item.downloadUrl || item.url || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={item.name}
                  onClick={(event) => {
                    if (!item.objectName || isDirectStorageItem(item)) return;
                    event.preventDefault();
                    void downloadFile(item);
                  }}
                >
                  {item.name}
                </a>
                <FileStatusText
                  item={item}
                  showFileSize={showFileSize}
                  showFileTypeBadge={showFileTypeBadge}
                />
              </div>
              <div className="sy-file-actions">
                {showPreview && preview.canPreview(item) && (
                  <FileActionButton
                    type="preview"
                    disabled={!canAct || preview.isOpening(item)}
                    onClick={() => {
                      void preview.openPreview(item);
                    }}
                  />
                )}
                {showDownload && (
                  <FileActionButton
                    type="download"
                    disabled={!canAct}
                    onClick={() => {
                      void downloadFile(item);
                    }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
      {preview.previewHost}
    </div>
  );
}

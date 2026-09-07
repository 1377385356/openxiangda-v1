import React from 'react';
import type { ImageFieldProps, AttachmentItem } from '../../types';
import { useFormContext } from '../../core/FormContext';
import { useDeviceDetect } from '../../hooks/useDeviceDetect';
import { FileActionButton } from '../shared/FileDisplay';
import { formatFileSize } from '../shared/fieldFormat';
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

function ImageThumbContent({ item, testId }: { item: AttachmentItem; testId?: string }) {
  const [imageFailed, setImageFailed] = React.useState(false);
  const src = item.thumbUrl || item.previewUrl || item.url;

  React.useEffect(() => {
    setImageFailed(false);
  }, [src]);

  if (src && !imageFailed) {
    return (
      <>
        <img src={src} alt={item.name} data-testid={testId} onError={() => setImageFailed(true)} />
        {item.status === 'uploading' && (
          <span className="sy-image-state">{Math.round(item.percent ?? 0)}%</span>
        )}
      </>
    );
  }

  return (
    <span className="sy-image-state" data-testid={testId}>
      {item.status === 'uploading'
        ? `${Math.round(item.percent ?? 0)}%`
        : item.status === 'error'
          ? item.error || '上传失败'
          : item.name || '图片'}
    </span>
  );
}

export function ImageFieldReadonly({
  fieldId,
  readonlyClassName,
  bucketName = 'images',
  showPreviewIcon = true,
  showDownloadIcon = true,
}: ImageFieldProps) {
  const { formData, api, config } = useFormContext();
  const { isMobile } = useDeviceDetect();
  const value = (formData[fieldId] as AttachmentItem[] | undefined) ?? [];
  const preview = useFilePreviewController({
    items: value,
    api,
    appType: config.appType,
    bucketName,
    enabled: showPreviewIcon,
    requireServerCapability: false,
  });

  if (value.length === 0) {
    return (
      <div
        className={readonlyClassName || 'sy-field-readonly-value'}
        data-testid={`imagefield-readonly-${fieldId}`}
      >
        --
      </div>
    );
  }

  const downloadImage = async (item: AttachmentItem) => {
    let url = item.downloadUrl || item.publicUrl || item.url || item.previewUrl;
    if (isDirectStorageItem(item)) {
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
    'sy-image-field',
    'sy-readonly-files',
    'sy-readonly-images',
    isMobile ? 'is-mobile' : '',
  ]
    .filter(Boolean)
    .join(' ');

  if (isMobile) {
    return (
      <div className={rootClassName} data-testid={`imagefield-readonly-${fieldId}`}>
        <div className="sy-mobile-image-grid" data-testid={`imagefield-readonly-grid-${fieldId}`}>
          {value.map((item, index) => {
            const itemKey = item.id || item.uid || `${fieldId}-readonly-image-${String(index)}`;
            const canAct = item.status !== 'uploading' && item.status !== 'error';
            return (
              <div className="sy-mobile-image-card" key={`${itemKey}-${index}`}>
                <div className="sy-mobile-image-thumb">
                  <button
                    type="button"
                    className="sy-image-preview"
                    disabled={
                      (!canAct && !(item.thumbUrl || item.previewUrl || item.url)) ||
                      !showPreviewIcon ||
                      !preview.canPreview(item)
                    }
                    data-testid={`imagefield-readonly-image-action-${itemKey}`}
                    onClick={() => {
                      void preview.openPreview(item);
                    }}
                  >
                    <ImageThumbContent item={item} testId={`imagefield-readonly-img-${itemKey}`} />
                  </button>
                </div>
                <div className="sy-mobile-image-name" title={item.name}>
                  {item.name}
                </div>
              </div>
            );
          })}
        </div>
        {preview.previewHost}
      </div>
    );
  }

  return (
    <div className={rootClassName} data-testid={`imagefield-readonly-${fieldId}`}>
      <div className="sy-file-list sy-image-file-list">
        {value.map((item, index) => {
          const itemKey = item.id || item.uid || `${fieldId}-readonly-image-${String(index)}`;
          const canAct = item.status !== 'uploading' && item.status !== 'error';
          return (
            <div
              key={`${itemKey}-${index}`}
              className="sy-file-item sy-image-file-item"
              data-testid={`imagefield-readonly-item-${itemKey}`}
            >
              <button
                type="button"
                className="sy-image-file-thumb"
                disabled={
                  (!canAct && !(item.thumbUrl || item.previewUrl || item.url)) ||
                  !showPreviewIcon ||
                  !preview.canPreview(item)
                }
                data-testid={`imagefield-readonly-image-action-${itemKey}`}
                onClick={() => {
                  void preview.openPreview(item);
                }}
              >
                <ImageThumbContent item={item} testId={`imagefield-readonly-img-${itemKey}`} />
              </button>
              <div className="sy-file-meta">
                <span className="sy-file-name" title={item.name}>
                  {item.name}
                  {item.size ? (
                    <span className="sy-file-size-inline">({formatFileSize(item.size)})</span>
                  ) : null}
                </span>
              </div>
              <div className="sy-file-actions">
                {showPreviewIcon && preview.canPreview(item) && (
                  <FileActionButton
                    type="preview"
                    disabled={!canAct || preview.isOpening(item)}
                    onClick={() => {
                      void preview.openPreview(item);
                    }}
                  />
                )}
                {showDownloadIcon && (
                  <FileActionButton
                    type="download"
                    disabled={!canAct}
                    onClick={() => {
                      void downloadImage(item);
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

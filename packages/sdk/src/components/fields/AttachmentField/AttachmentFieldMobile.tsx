import React from 'react';
import type { AttachmentFieldProps, AttachmentItem } from '../../types';
import { useFormContext } from '../../core/FormContext';
import {
  FileActionButton,
  FileStatusText,
  FileTypeIcon,
  UploadOutlined,
} from '../shared/FileDisplay';
import {
  createUid,
  dedupeAttachmentItems,
  getAttachmentItemIdentity,
  getFileExtension,
  normalizeAttachmentItem,
} from '../shared/fieldFormat';
import { useFilePreviewController } from '../../file-preview';

const createLocalItem = (file: File): AttachmentItem => {
  const uid = createUid('attachment');
  return {
    id: uid,
    uid,
    url: typeof URL !== 'undefined' && URL.createObjectURL ? URL.createObjectURL(file) : '',
    name: file.name,
    status: 'uploading',
    size: file.size,
    percent: 0,
    contentType: file.type,
    mimeType: file.type,
    extension: getFileExtension(file.name),
  };
};

export function AttachmentFieldMobile({
  fieldId,
  behavior,
  maxCount,
  accept,
  maxSize,
  bucketName = 'attachments',
  uploadProvider,
  storageCode,
  multiple = true,
  allowedTypes,
  showPreview = true,
  showDownload = true,
  showFileSize = true,
  showFileTypeBadge = true,
  imageCompression,
  onChange,
}: AttachmentFieldProps) {
  const { formData, setFieldValue, api, config } = useFormContext();
  const value = React.useMemo(
    () =>
      dedupeAttachmentItems(
        Array.isArray(formData[fieldId]) ? (formData[fieldId] as AttachmentItem[]) : [],
      ),
    [fieldId, formData],
  );
  const valueRef = React.useRef(value);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const disabled = behavior === 'DISABLED';
  const fieldUploadProvider =
    uploadProvider || (storageCode ? 'oss' : config.defaultUploadProvider || 'platform');
  const publicFormUploadContext = {
    appType: config.appType,
    formUuid: config.formUuid,
    fieldId,
    uploadPurpose: 'attachment' as const,
  };
  const fieldUploadOptions =
    fieldUploadProvider === 'builtin-oss'
      ? {
          ...publicFormUploadContext,
          uploadProvider: 'builtin-oss' as const,
          storageScope: 'platform' as const,
          ...(imageCompression && imageCompression.enabled !== false ? { imageCompression } : {}),
        }
      : fieldUploadProvider === 'oss'
      ? {
          ...publicFormUploadContext,
          uploadProvider: 'oss' as const,
          storageCode,
          ...(imageCompression && imageCompression.enabled !== false ? { imageCompression } : {}),
        }
      : {
          ...publicFormUploadContext,
          ...(imageCompression && imageCompression.enabled !== false ? { imageCompression } : {}),
        };
  const getItemUploadOptions = (item: AttachmentItem) =>
    item.storageScope === 'platform' || item.uploadProvider === 'builtin-oss'
      ? {
          uploadProvider: 'builtin-oss' as const,
          storageScope: 'platform' as const,
          appType: item.appType || config.appType,
        }
      : item.provider === 'oss' || item.storageCode
      ? {
          uploadProvider: 'oss' as const,
          storageCode: item.storageCode || storageCode,
          appType: item.appType || config.appType,
        }
      : undefined;
  const isDirectStorageItem = (item: AttachmentItem) =>
    item.provider === 'oss' ||
    item.uploadProvider === 'oss' ||
    item.uploadProvider === 'builtin-oss' ||
    Boolean(item.storageCode);
  const preview = useFilePreviewController({
    items: value,
    api,
    appType: config.appType,
    bucketName,
    enabled: showPreview,
    requireServerCapability: true,
  });

  React.useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const setValue = (items: AttachmentItem[]) => {
    const nextItems = dedupeAttachmentItems(items).slice(0, maxCount ?? Infinity);
    valueRef.current = nextItems;
    setFieldValue(fieldId, nextItems);
    onChange?.(nextItems);
  };

  const replaceItem = (target: AttachmentItem, nextItem: AttachmentItem) => {
    const targetKeys = new Set(
      [target.id, target.uid, target.objectName, getAttachmentItemIdentity(target)].filter(Boolean),
    );
    let replaced = false;
    const nextItems = valueRef.current.map((item) => {
      const currentKeys = [item.id, item.uid, item.objectName, getAttachmentItemIdentity(item)];
      if (currentKeys.some((key) => key && targetKeys.has(key))) {
        replaced = true;
        return nextItem;
      }
      return item;
    });
    if (!replaced) nextItems.push(nextItem);
    setValue(nextItems);
  };

  const validateFile = (file: File) => {
    if (maxCount && valueRef.current.length >= maxCount) return false;
    if (maxSize && file.size / 1024 / 1024 > maxSize) return false;
    const ext = getFileExtension(file.name);
    if (allowedTypes?.length && ext && !allowedTypes.includes(ext)) return false;
    return true;
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []).filter(validateFile);
    event.target.value = '';
    if (!files.length) return;

    const localItems = files.map(createLocalItem);
    setValue(multiple ? [...valueRef.current, ...localItems] : localItems.slice(0, 1));

    files.forEach((file, index) => {
      const localItem = localItems[index];
      const handleProgress = (percent: number) => {
        replaceItem(localItem, { ...localItem, percent, status: 'uploading' });
      };
      const uploadPromise = fieldUploadOptions
        ? api.uploadFile(file, bucketName, handleProgress, fieldUploadOptions)
        : api.uploadFile(file, bucketName, handleProgress);
      uploadPromise
        .then((uploaded) => {
          replaceItem(
            localItem,
            normalizeAttachmentItem(
              {
                ...uploaded,
                status: 'done',
                percent: 100,
                extension: uploaded.extension || getFileExtension(uploaded.name || localItem.name),
              },
              localItem,
            ),
          );
        })
        .catch((error: any) => {
          replaceItem(localItem, {
            ...localItem,
            status: 'error',
            error: error?.message || '上传失败',
          });
        });
    });
  };

  const handleRemove = (item: AttachmentItem) => {
    const itemKey = item.uid || item.id || item.objectName;
    const next = valueRef.current.filter(
      (current) =>
        current.id !== itemKey && current.uid !== itemKey && current.objectName !== itemKey,
    );
    setValue(next);
    const options = getItemUploadOptions(item);
    const objects = [
      { objectName: item.objectName, bucketName: item.bucketName },
      item.variants?.thumb,
      item.variants?.preview,
    ];
    const seen = new Set<string>();
    objects.forEach((object) => {
      const objectName = object?.objectName;
      if (!objectName || seen.has(objectName)) return;
      seen.add(objectName);
      const deletePromise = options
        ? api.deleteFile(objectName, object.bucketName || item.bucketName || bucketName, options)
        : api.deleteFile(objectName, object.bucketName || item.bucketName || bucketName);
      deletePromise.catch(() => undefined);
    });
  };

  const resolveDownloadUrl = async (item: AttachmentItem) => {
    if (isDirectStorageItem(item)) {
      return item.downloadUrl || item.publicUrl || item.url || '';
    }
    if (item.objectName) {
      const ticket = await api.createDownloadTicket(
        item.bucketName || bucketName,
        item.objectName,
        item.name,
      );
      return typeof ticket === 'string'
        ? ticket
        : ticket?.downloadUrl || ticket?.relayUrl || ticket?.url || '';
    }
    return item.downloadUrl || item.url || '';
  };

  const openUrl = (url: string) => {
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="sy-attachment-field" data-testid={`attachmentfield-mobile-${fieldId}`}>
      {(!maxCount || value.length < maxCount) && (
        <button
          type="button"
          className={`sy-mobile-upload-button ${disabled ? 'is-disabled' : ''}`}
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          data-testid={`attachmentfield-upload-btn-${fieldId}`}
        >
          <UploadOutlined />
          上传文件
        </button>
      )}
      <input
        ref={inputRef}
        className="sy-mobile-hidden-input"
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        style={{ display: 'none' }}
        aria-hidden="true"
        onChange={handleFileSelect}
        data-testid={`attachmentfield-file-input-${fieldId}`}
      />
      {value.length > 0 && (
        <div className="sy-file-list" data-testid={`attachmentfield-list-${fieldId}`}>
          {value.map((item, index) => {
            const itemKey =
              getAttachmentItemIdentity(item) || `${fieldId}-attachment-${String(index)}`;
            return (
              <div
                className="sy-file-item"
                key={`${itemKey}-${index}`}
                data-testid={`attachmentfield-item-${itemKey}`}
              >
                <FileTypeIcon item={item} />
                <div className="sy-file-meta">
                  <span className="sy-file-name" title={item.name}>
                    {item.name}
                  </span>
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
                      disabled={item.status !== 'done' || preview.isOpening(item)}
                      onClick={() => {
                        void preview.openPreview(item);
                      }}
                    />
                  )}
                  {showDownload && (
                    <FileActionButton
                      type="download"
                      disabled={item.status !== 'done'}
                      onClick={async () => openUrl(await resolveDownloadUrl(item))}
                    />
                  )}
                  <FileActionButton
                    type="remove"
                    disabled={disabled}
                    onClick={() => handleRemove(item)}
                    testId={`attachmentfield-remove-${itemKey}`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
      {preview.previewHost}
    </div>
  );
}

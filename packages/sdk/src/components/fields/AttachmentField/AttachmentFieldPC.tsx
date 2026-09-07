import React from 'react';
import { Upload } from 'antd';
import type { AttachmentFieldProps, AttachmentItem } from '../../types';
import { useFormContext } from '../../core/FormContext';
import {
  FileActionButton,
  FileStatusText,
  FileTypeIcon,
  PaperClipOutlined,
} from '../shared/FileDisplay';
import {
  createUid,
  dedupeAttachmentItems,
  getAttachmentItemIdentity,
  getFileExtension,
  normalizeAttachmentItem,
} from '../shared/fieldFormat';
import { collectTransferFiles } from '../shared/fileTransfer';
import { useFilePreviewController } from '../../file-preview';

const createLocalItem = (file: File & { uid?: string }): AttachmentItem => {
  const uid = file.uid || createUid('attachment');
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

export function AttachmentFieldPC({
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

  const handleRemove = (file: any) => {
    const fileKey = String(file.uid || file.id || file.objectName || '');
    const removed = valueRef.current.find(
      (item) => item.id === fileKey || item.uid === fileKey || item.objectName === fileKey,
    );
    const newValue = valueRef.current.filter(
      (item) => item.id !== fileKey && item.uid !== fileKey && item.objectName !== fileKey,
    );
    setValue(newValue);
    if (removed) {
      const options = getItemUploadOptions(removed);
      const objects = [
        { objectName: removed.objectName, bucketName: removed.bucketName },
        removed.variants?.thumb,
        removed.variants?.preview,
      ];
      const seen = new Set<string>();
      objects.forEach((object) => {
        const objectName = object?.objectName;
        if (!objectName || seen.has(objectName)) return;
        seen.add(objectName);
        const deletePromise = options
          ? api.deleteFile(
              objectName,
              object.bucketName || removed.bucketName || bucketName,
              options,
            )
          : api.deleteFile(objectName, object.bucketName || removed.bucketName || bucketName);
        deletePromise.catch(() => undefined);
      });
    }
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

  const handleDownload = async (item: AttachmentItem) => {
    const url = await resolveDownloadUrl(item);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  const beforeUpload = (file: any) => {
    if (maxCount && valueRef.current.length >= maxCount) {
      return false;
    }
    if (maxSize && file.size / 1024 / 1024 > maxSize) {
      return false;
    }
    const ext = String(file.name || '')
      .split('.')
      .pop()
      ?.toLowerCase();
    if (allowedTypes?.length && ext && !allowedTypes.includes(ext)) {
      return false;
    }
    return true;
  };

  const uploadAttachmentFile = async (
    currentFile: File & { uid?: string },
    callbacks?: {
      onProgress?: (event: { percent: number }) => void;
      onSuccess?: (item: AttachmentItem) => void;
      onError?: (error: Error) => void;
    },
  ) => {
    const localItem = createLocalItem(currentFile);
    const currentValue = valueRef.current.filter(
      (item) => item.id !== localItem.id && item.uid !== localItem.uid,
    );
    const nextValue = multiple ? [...currentValue, localItem] : [localItem];
    setValue(nextValue);
    try {
      const handleProgress = (percent: number) => {
        callbacks?.onProgress?.({ percent });
        replaceItem(localItem, { ...localItem, percent, status: 'uploading' });
      };
      const uploaded = fieldUploadOptions
        ? await api.uploadFile(currentFile, bucketName, handleProgress, fieldUploadOptions)
        : await api.uploadFile(currentFile, bucketName, handleProgress);
      const completed = normalizeAttachmentItem(
        {
          ...uploaded,
          status: 'done',
          percent: 100,
          extension: uploaded.extension || getFileExtension(uploaded.name || localItem.name),
        },
        localItem,
      );
      replaceItem(localItem, completed);
      callbacks?.onSuccess?.(completed);
    } catch (error: any) {
      const failed = {
        ...localItem,
        status: 'error' as const,
        error: error?.message || '上传失败',
      };
      replaceItem(localItem, failed);
      callbacks?.onError?.(error);
    }
  };

  const customRequest = async ({ file, onProgress, onSuccess, onError }: any) => {
    await uploadAttachmentFile(file as File & { uid?: string }, { onProgress, onSuccess, onError });
  };

  const uploadTransferFiles = (files: File[]) => {
    files.forEach((file) => {
      if (beforeUpload(file) === false) return;
      void uploadAttachmentFile(file as File & { uid?: string });
    });
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const files = collectTransferFiles(event.clipboardData?.files, event.clipboardData?.items);
    if (!files.length) return;
    event.preventDefault();
    uploadTransferFiles(files);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    if (disabled) return;
    event.preventDefault();
    const files = collectTransferFiles(event.dataTransfer?.files, event.dataTransfer?.items);
    uploadTransferFiles(files);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (disabled) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  };

  return (
    <div className="sy-attachment-field" data-testid={`attachmentfield-enhanced-${fieldId}`}>
      <div className="sy-upload-inline sy-attachment-upload-inline">
        <Upload
          data-testid={`attachmentfield-input-${fieldId}`}
          fileList={[]}
          customRequest={customRequest}
          accept={accept}
          maxCount={maxCount}
          multiple={multiple}
          disabled={disabled}
          showUploadList={false}
          onRemove={handleRemove}
          beforeUpload={beforeUpload}
        >
          <button
            type="button"
            className="sy-upload-button"
            disabled={disabled}
            data-testid={`attachmentfield-upload-btn-${fieldId}`}
          >
            <PaperClipOutlined />
            上传文件
          </button>
        </Upload>
        <div
          className={`sy-upload-paste-zone${disabled ? ' is-disabled' : ''}`}
          tabIndex={disabled ? -1 : 0}
          aria-label="拖拽或点击后粘贴图片"
          data-testid={`attachmentfield-paste-zone-${fieldId}`}
          onPaste={handlePaste}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        >
          <span>拖拽或点击后粘贴图片</span>
        </div>
      </div>
      {value.length > 0 && (
        <div className="sy-file-list" data-testid={`attachmentfield-rich-list-${fieldId}`}>
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
                      onClick={() => handleDownload(item)}
                    />
                  )}
                  <FileActionButton
                    type="remove"
                    disabled={disabled}
                    onClick={() => handleRemove({ uid: item.uid || item.id })}
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

import React from 'react';
import { Upload } from 'antd';
import type { ImageFieldProps, AttachmentItem } from '../../types';
import { useFormContext } from '../../core/FormContext';
import { FileActionButton, UploadOutlined } from '../shared/FileDisplay';
import {
  createUid,
  dedupeAttachmentItems,
  formatFileSize,
  getAttachmentItemIdentity,
  getFileExtension,
  normalizeAttachmentItem,
} from '../shared/fieldFormat';
import { collectTransferFiles } from '../shared/fileTransfer';
import { useFilePreviewController } from '../../file-preview';

const createLocalItem = (file: File & { uid?: string }): AttachmentItem => {
  const uid = file.uid || createUid('image');
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

function ImageThumbContent({ item }: { item: AttachmentItem }) {
  const [imageFailed, setImageFailed] = React.useState(false);
  const src = item.thumbUrl || item.previewUrl || item.url;

  React.useEffect(() => {
    setImageFailed(false);
  }, [src]);

  if (src && !imageFailed) {
    return (
      <>
        <img src={src} alt={item.name} onError={() => setImageFailed(true)} />
        {item.status === 'uploading' && (
          <span className="sy-image-state">{Math.round(item.percent ?? 0)}%</span>
        )}
      </>
    );
  }

  return (
    <span className="sy-image-state">
      {item.status === 'uploading'
        ? `${Math.round(item.percent ?? 0)}%`
        : item.status === 'error'
          ? item.error || '上传失败'
          : item.name || '图片'}
    </span>
  );
}

export function ImageFieldPC({
  fieldId,
  behavior,
  maxCount,
  accept,
  bucketName = 'images',
  uploadProvider,
  storageCode,
  multiple = true,
  maxSize,
  showPreviewIcon = true,
  showRemoveIcon = true,
  showDownloadIcon = true,
  imageCompression,
  onChange,
}: ImageFieldProps) {
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
    uploadPurpose: 'image' as const,
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
  const isDirectStorageItem = (item?: AttachmentItem) =>
    Boolean(
      item &&
        (item.provider === 'oss' ||
          item.uploadProvider === 'oss' ||
          item.uploadProvider === 'builtin-oss' ||
          item.storageCode),
    );
  const preview = useFilePreviewController({
    items: value,
    api,
    appType: config.appType,
    bucketName,
    enabled: showPreviewIcon,
    requireServerCapability: false,
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

  const handleDownload = async (item: AttachmentItem) => {
    let url = item.downloadUrl || item.publicUrl || item.url;
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
      url =
        typeof ticket === 'string'
          ? ticket
          : ticket?.downloadUrl || ticket?.relayUrl || ticket?.url || '';
    }
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  const beforeUpload = (file: File) => {
    if (maxCount && valueRef.current.length >= maxCount) {
      return false;
    }
    if (
      !String(file.type || '').startsWith('image/') &&
      !/\.(png|jpe?g|gif|bmp|svg|webp|avif|ico|heic|heif|tiff?)$/i.test(file.name)
    ) {
      return false;
    }
    if (maxSize && file.size / 1024 / 1024 > maxSize) {
      return false;
    }
    return true;
  };

  const uploadImageFile = async (
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
      const hasImageVariants = Boolean(
        uploaded.thumbUrl || uploaded.variants?.thumb || uploaded.variants?.preview,
      );
      const completed = normalizeAttachmentItem(
        {
          ...uploaded,
          url: hasImageVariants
            ? uploaded.url || localItem.url
            : uploaded.previewUrl || uploaded.url || localItem.url,
          thumbUrl: uploaded.thumbUrl || uploaded.variants?.thumb?.url,
          previewUrl:
            uploaded.previewUrl || uploaded.variants?.preview?.url || uploaded.url || localItem.url,
          status: 'done',
          percent: 100,
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
    await uploadImageFile(file as File & { uid?: string }, { onProgress, onSuccess, onError });
  };

  const uploadTransferFiles = (files: File[]) => {
    files.forEach((file) => {
      if (beforeUpload(file) === false) return;
      void uploadImageFile(file as File & { uid?: string });
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

  const canUpload = !maxCount || value.length < maxCount;

  return (
    <div className="sy-image-field" data-testid={`imagefield-enhanced-${fieldId}`}>
      {canUpload && (
        <div className="sy-upload-inline sy-image-upload-inline">
          <Upload
            data-testid={`imagefield-input-${fieldId}`}
            fileList={[]}
            customRequest={customRequest}
            accept={accept ?? 'image/*'}
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
              data-testid={`imagefield-upload-btn-${fieldId}`}
            >
              <UploadOutlined />
              图片上传
            </button>
          </Upload>
          <div
            className={`sy-upload-paste-zone${disabled ? ' is-disabled' : ''}`}
            tabIndex={disabled ? -1 : 0}
            aria-label="拖拽或Ctrl+V粘贴图片"
            data-testid={`imagefield-paste-zone-${fieldId}`}
            onPaste={handlePaste}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
          >
            拖拽或Ctrl+V粘贴图片
          </div>
        </div>
      )}
      {value.length > 0 && (
        <div
          className="sy-file-list sy-image-file-list"
          data-testid={`imagefield-rich-grid-${fieldId}`}
        >
          {value.map((item, index) => {
            const itemKey = getAttachmentItemIdentity(item) || `${fieldId}-image-${String(index)}`;
            const canAct = item.status !== 'uploading' && item.status !== 'error';
            return (
              <div
                key={`${itemKey}-${index}`}
                className="sy-file-item sy-image-file-item"
                data-testid={`imagefield-thumb-${itemKey}`}
              >
                <button
                  type="button"
                  className="sy-image-file-thumb"
                  disabled={
                    (!canAct && !(item.thumbUrl || item.previewUrl || item.url)) ||
                    !showPreviewIcon ||
                    !preview.canPreview(item)
                  }
                  onClick={() => {
                    void preview.openPreview(item);
                  }}
                >
                  <ImageThumbContent item={item} />
                </button>
                <div className="sy-file-meta">
                  <span className="sy-file-name" title={item.name}>
                    {item.name}
                  </span>
                  <span className="sy-file-sub">
                    {item.status === 'uploading'
                      ? `上传中 ${Math.round(item.percent ?? 0)}%`
                      : item.status === 'error'
                        ? item.error || '上传失败'
                        : formatFileSize(item.size)}
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
                      onClick={() => handleDownload(item)}
                    />
                  )}
                  {showRemoveIcon && (
                    <FileActionButton
                      type="remove"
                      disabled={disabled}
                      onClick={() => handleRemove({ uid: item.uid || item.id })}
                      testId={`remove-btn-${itemKey}`}
                    />
                  )}
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

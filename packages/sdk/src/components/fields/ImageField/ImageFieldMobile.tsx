import React from 'react';
import type { ImageFieldProps, AttachmentItem } from '../../types';
import { useFormContext } from '../../core/FormContext';
import { FileActionButton, PlusOutlined } from '../shared/FileDisplay';
import {
  createUid,
  dedupeAttachmentItems,
  getAttachmentItemIdentity,
  getFileExtension,
  normalizeAttachmentItem,
} from '../shared/fieldFormat';
import { useFilePreviewController } from '../../file-preview';

const createLocalItem = (file: File): AttachmentItem => {
  const uid = createUid('image');
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

export function ImageFieldMobile({
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
  const inputRef = React.useRef<HTMLInputElement | null>(null);
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

  const validateFile = (file: File) => {
    if (maxCount && valueRef.current.length >= maxCount) return false;
    const isImage =
      String(file.type || '').startsWith('image/') ||
      /\.(png|jpe?g|gif|bmp|svg|webp|avif|ico|heic|heif|tiff?)$/i.test(file.name);
    if (!isImage) return false;
    if (maxSize && file.size / 1024 / 1024 > maxSize) return false;
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
          const hasImageVariants = Boolean(
            uploaded.thumbUrl || uploaded.variants?.thumb || uploaded.variants?.preview,
          );
          replaceItem(
            localItem,
            normalizeAttachmentItem(
              {
                ...uploaded,
                url: hasImageVariants
                  ? uploaded.url || localItem.url
                  : uploaded.previewUrl || uploaded.url || localItem.url,
                thumbUrl: uploaded.thumbUrl || uploaded.variants?.thumb?.url,
                previewUrl:
                  uploaded.previewUrl ||
                  uploaded.variants?.preview?.url ||
                  uploaded.url ||
                  localItem.url,
                status: 'done',
                percent: 100,
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

  return (
    <div className="sy-image-field" data-testid={`imagefield-mobile-${fieldId}`}>
      <input
        ref={inputRef}
        className="sy-mobile-hidden-input"
        type="file"
        accept={accept ?? 'image/*'}
        multiple={multiple}
        disabled={disabled}
        style={{ display: 'none' }}
        aria-hidden="true"
        onChange={handleFileSelect}
        data-testid={`imagefield-file-input-${fieldId}`}
      />
      <div className="sy-mobile-image-grid" data-testid={`imagefield-grid-${fieldId}`}>
        {value.map((item, index) => {
          const itemKey = getAttachmentItemIdentity(item) || `${fieldId}-image-${String(index)}`;
          const canAct = item.status !== 'uploading' && item.status !== 'error';
          return (
            <div
              key={`${itemKey}-${index}`}
              className="sy-mobile-image-card"
              data-testid={`imagefield-thumb-${itemKey}`}
            >
              <div className="sy-mobile-image-thumb">
                <button
                  type="button"
                  className="sy-image-preview"
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
                {showRemoveIcon && (
                  <FileActionButton
                    type="remove"
                    disabled={disabled}
                    onClick={() => handleRemove(item)}
                    testId={`imagefield-remove-${itemKey}`}
                  />
                )}
              </div>
              <div className="sy-mobile-image-name" title={item.name}>
                {item.name}
              </div>
            </div>
          );
        })}
        {(!maxCount || value.length < maxCount) && (
          <button
            type="button"
            className="sy-mobile-image-upload-tile"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            data-testid={`imagefield-upload-btn-${fieldId}`}
          >
            <PlusOutlined />
            <span>图片上传</span>
          </button>
        )}
      </div>
      {preview.previewHost}
    </div>
  );
}

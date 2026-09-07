import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Image, Modal, Spin, Typography } from 'antd';
import { CloseOutlined, DownloadOutlined } from '@ant-design/icons';
import type { AttachmentItem, FormRuntimeApi } from '../types';
import {
  convertHeicPreview,
  getPreviewItemKey,
  isDirectStorageItem,
  prepareFilePreview,
  resolveLocalPreviewCapability,
  unwrapFilePreviewPayload,
} from './capabilities';
import {
  FilePreviewContent,
  formatPreviewFileSize,
  resolvePreviewServiceUrl,
} from './FilePreviewContent';
import type {
  FilePreviewCapability,
  FilePreviewCapabilityBatch,
  PreparedFilePreview,
  PreviewImageItem,
} from './types';

interface UseFilePreviewOptions {
  items: AttachmentItem[];
  api: FormRuntimeApi;
  appType?: string;
  bucketName: string;
  enabled?: boolean;
  requireServerCapability?: boolean;
}

interface ImagePreviewState {
  open: boolean;
  current: number;
  items: PreviewImageItem[];
}

const canActOnItem = (item: AttachmentItem) =>
  item.status !== 'uploading' && item.status !== 'error';

const revokeImageItems = (items: PreviewImageItem[]) => {
  items.forEach(item => {
    if (item.revokeOnClose && item.src.startsWith('blob:')) {
      URL.revokeObjectURL?.(item.src);
    }
  });
};

const buildCapabilityMap = (
  items: AttachmentItem[],
  requireServerCapability: boolean,
) => {
  const result: Record<string, FilePreviewCapability> = {};
  items.forEach((item, index) => {
    const key = getPreviewItemKey(item, index);
    const local = resolveLocalPreviewCapability(item);
    result[key] =
      requireServerCapability && item.objectName && !isDirectStorageItem(item)
        ? { ...local, canPreview: false }
        : local;
  });
  return result;
};

export const useFilePreviewController = ({
  items,
  api,
  appType,
  bucketName,
  enabled = true,
  requireServerCapability = true,
}: UseFilePreviewOptions) => {
  const itemSignature = useMemo(
    () =>
      items
        .map((item, index) =>
          [
            getPreviewItemKey(item, index),
            item.name,
            item.objectName,
            item.contentType,
            item.size,
            item.status,
          ].join(':'),
        )
        .join('|'),
    [items],
  );
  const [capabilities, setCapabilities] = useState<Record<string, FilePreviewCapability>>(
    () => buildCapabilityMap(items, requireServerCapability),
  );
  const [openingKey, setOpeningKey] = useState('');
  const [dialogPreview, setDialogPreview] = useState<PreparedFilePreview | null>(null);
  const [imagePreview, setImagePreview] = useState<ImagePreviewState>({
    open: false,
    current: 0,
    items: [],
  });

  useEffect(() => {
    let disposed = false;
    const initial = buildCapabilityMap(items, requireServerCapability);
    setCapabilities(initial);
    if (!enabled || !requireServerCapability) return () => {
      disposed = true;
    };

    const protectedItems = items
      .map((item, index) => ({ item, key: getPreviewItemKey(item, index) }))
      .filter(
        ({ item }) =>
          canActOnItem(item) && Boolean(item.objectName) && !isDirectStorageItem(item),
      );
    if (!protectedItems.length) return () => {
      disposed = true;
    };

    api
      .request({
        url: '/file/preview-capabilities',
        method: 'post',
        data: {
          files: protectedItems.map(({ item, key }) => ({
            key,
            fileName: item.name,
            objectName: item.objectName,
            contentType: item.contentType || item.mimeType,
            size: item.size,
          })),
        },
      })
      .then(response => {
        if (disposed) return;
        const payload = unwrapFilePreviewPayload(response) as FilePreviewCapabilityBatch;
        const next = { ...initial };
        (payload?.items || []).forEach(capability => {
          if (capability.key) next[capability.key] = capability;
        });
        setCapabilities(next);
      })
      .catch(() => {
        if (disposed) return;
        const fallback = { ...initial };
        protectedItems.forEach(({ item, key }) => {
          fallback[key] = resolveLocalPreviewCapability(item);
        });
        setCapabilities(fallback);
      });

    return () => {
      disposed = true;
    };
    // itemSignature captures the fields that affect capability without depending on array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, enabled, itemSignature, requireServerCapability]);

  const getCapability = useCallback(
    (item: AttachmentItem) => {
      const index = items.indexOf(item);
      return capabilities[getPreviewItemKey(item, Math.max(index, 0))];
    },
    [capabilities, items],
  );

  const canPreview = useCallback(
    (item: AttachmentItem) =>
      enabled && canActOnItem(item) && getCapability(item)?.canPreview === true,
    [enabled, getCapability],
  );

  const closeImagePreview = useCallback(() => {
    setImagePreview(current => {
      revokeImageItems(current.items);
      return { open: false, current: 0, items: [] };
    });
  }, []);

  useEffect(
    () => () => revokeImageItems(imagePreview.items),
    [imagePreview.items],
  );

  const resolvePreparedImageItem = useCallback(
    async (prepared: PreparedFilePreview, index: number): Promise<PreviewImageItem> => {
      const item = prepared.item;
      const metadata = prepared.metadata;
      let src = resolvePreviewServiceUrl(
        metadata.renderMode === 'image-transcode'
          ? metadata.imagePreviewUrl
          : metadata.previewUrl,
      );
      let revokeOnClose = false;
      if (metadata.renderMode === 'image-heic') {
        src = await convertHeicPreview(api.request, src);
        revokeOnClose = true;
      }
      if (!src) throw new Error(`${item.name || '图片'}没有可用的预览地址`);
      return {
        key: getPreviewItemKey(item, index),
        src,
        name: metadata.fileName || item.name,
        revokeOnClose,
      };
    },
    [api],
  );

  const prepareImageItem = useCallback(
    async (item: AttachmentItem, index: number): Promise<PreviewImageItem> => {
      const prepared = await prepareFilePreview({ item, api, appType, bucketName });
      return resolvePreparedImageItem(prepared, index);
    },
    [api, appType, bucketName, resolvePreparedImageItem],
  );

  const openPreview = useCallback(
    async (item: AttachmentItem) => {
      const itemIndex = Math.max(items.indexOf(item), 0);
      const key = getPreviewItemKey(item, itemIndex);
      setOpeningKey(key);
      try {
        const prepared = await prepareFilePreview({ item, api, appType, bucketName });
        if (prepared.metadata.canPreview === false || prepared.metadata.renderMode === 'download') {
          setDialogPreview(prepared);
          return;
        }

        if (prepared.metadata.previewType === 'image') {
          const galleryCandidates = items
            .map((candidate, index) => ({ candidate, index }))
            .filter(({ candidate }) => {
              const capability = getCapability(candidate) || resolveLocalPreviewCapability(candidate);
              return canActOnItem(candidate) && capability.canPreview && capability.previewType === 'image';
            });
          const results = await Promise.allSettled(
            galleryCandidates.map(({ candidate, index }) =>
              candidate === item
                ? resolvePreparedImageItem(prepared, index)
                : prepareImageItem(candidate, index),
            ),
          );
          const gallery = results.flatMap(result =>
            result.status === 'fulfilled' ? [result.value] : [],
          );
          if (!gallery.length || !gallery.some(image => image.key === key)) {
            const fallback = await resolvePreparedImageItem(prepared, itemIndex);
            gallery.push(fallback);
          }
          const current = Math.max(0, gallery.findIndex(image => image.key === key));
          closeImagePreview();
          setImagePreview({ open: true, current, items: gallery });
          return;
        }

        setDialogPreview(prepared);
      } catch (error: any) {
        setDialogPreview({
          item,
          direct: isDirectStorageItem(item),
          metadata: {
            ...resolveLocalPreviewCapability(item),
            fileName: item.name,
            size: item.size,
            renderMode: 'download',
            canPreview: false,
            unsupportedReason: error?.message || '文件预览加载失败',
            downloadUrl: item.downloadUrl || item.publicUrl || item.url,
          },
        });
      } finally {
        setOpeningKey('');
      }
    },
    [
      api,
      appType,
      bucketName,
      closeImagePreview,
      getCapability,
      items,
      prepareImageItem,
      resolvePreparedImageItem,
    ],
  );

  const downloadItem = useCallback(
    async (item: AttachmentItem, prepared?: PreparedFilePreview | null) => {
      let url = prepared?.metadata.downloadUrl || item.downloadUrl || item.publicUrl || item.url;
      if (!isDirectStorageItem(item) && item.objectName && !prepared?.metadata.downloadUrl) {
        const ticket = await api.createDownloadTicket(
          item.bucketName || bucketName,
          item.objectName,
          item.name,
        );
        url =
          typeof ticket === 'string'
            ? ticket
            : ticket?.downloadUrl || ticket?.relayUrl || ticket?.url || url;
      }
      const resolvedUrl = resolvePreviewServiceUrl(url);
      if (resolvedUrl && typeof window !== 'undefined') window.location.assign(resolvedUrl);
    },
    [api, bucketName],
  );

  const previewHost = imagePreview.open || dialogPreview ? (
    <>
      <Image.PreviewGroup
        items={imagePreview.items.map(item => ({ src: item.src, alt: item.name }))}
        preview={{
          open: imagePreview.open,
          current: imagePreview.current,
          onChange: current => setImagePreview(value => ({ ...value, current })),
          onOpenChange: open => {
            if (!open) closeImagePreview();
          },
          countRender: (current, total) => `${current}/${total}`,
        }}
      >
        <span aria-hidden="true" style={{ display: 'none' }} />
      </Image.PreviewGroup>
      <FilePreviewDialog
        preview={dialogPreview}
        request={api.request}
        onClose={() => setDialogPreview(null)}
        onDownload={() => {
          if (dialogPreview) void downloadItem(dialogPreview.item, dialogPreview);
        }}
      />
    </>
  ) : null;

  return {
    canPreview,
    getCapability,
    openPreview,
    openingKey,
    isOpening: (item: AttachmentItem) => {
      const index = Math.max(items.indexOf(item), 0);
      return openingKey === getPreviewItemKey(item, index);
    },
    downloadItem,
    previewHost,
  };
};

const FilePreviewDialog = ({
  preview,
  request,
  onClose,
  onDownload,
}: {
  preview: PreparedFilePreview | null;
  request: FormRuntimeApi['request'];
  onClose: () => void;
  onDownload: () => void;
}) => {
  const metadata = preview?.metadata;
  const title = metadata?.fileName || preview?.item.name || '附件预览';
  return (
    <Modal
      open={Boolean(preview)}
      title={
        <div style={{ minWidth: 0, paddingRight: 16 }}>
          <Typography.Text strong ellipsis style={{ display: 'block' }}>
            {title}
          </Typography.Text>
          {metadata ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {(metadata.extension || 'FILE').toUpperCase()} · {formatPreviewFileSize(metadata.size)}
            </Typography.Text>
          ) : null}
        </div>
      }
      width="min(96vw, 1440px)"
      centered
      destroyOnHidden
      mask={{ closable: false }}
      closeIcon={<CloseOutlined />}
      onCancel={onClose}
      styles={{
        body: {
          height: 'min(78vh, 900px)',
          minHeight: 360,
          padding: 0,
          overflow: 'hidden',
          border: '1px solid #e5e7eb',
        },
      }}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={onClose}>关闭</Button>
          {metadata?.canDownload !== false ? (
            <Button type="primary" icon={<DownloadOutlined />} onClick={onDownload}>
              下载
            </Button>
          ) : null}
        </div>
      }
    >
      {preview && metadata ? (
        <FilePreviewContent
          metadata={metadata}
          request={request}
          onDownload={onDownload}
        />
      ) : (
        <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}>
          <Spin description="正在准备预览..." />
        </div>
      )}
    </Modal>
  );
};

export const FilePreviewCapabilityError = ({ message }: { message: string }) => (
  <Alert type="warning" showIcon title={message} />
);

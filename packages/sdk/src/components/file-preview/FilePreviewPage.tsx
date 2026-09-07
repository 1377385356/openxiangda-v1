import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Empty, Spin, Tag, Tooltip, Typography } from 'antd';
import {
  ArrowLeftOutlined,
  DownloadOutlined,
  FileOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { unwrapFilePreviewPayload } from './capabilities';
import {
  FilePreviewContent,
  formatPreviewFileSize,
  resolvePreviewServiceUrl,
} from './FilePreviewContent';
import type { FilePreviewMetadata, FilePreviewRequest } from './types';

export interface FilePreviewPageProps {
  ticket: string;
  request: FilePreviewRequest;
  servicePrefix?: string;
}

export const FilePreviewPage = ({
  ticket,
  request,
  servicePrefix = '/service',
}: FilePreviewPageProps) => {
  const [metadata, setMetadata] = useState<FilePreviewMetadata | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let disposed = false;
    setMetadata(null);
    setError('');
    if (!ticket) return () => {
      disposed = true;
    };
    setLoading(true);
    request({
      url: `/file/access-ticket/${encodeURIComponent(ticket)}`,
      method: 'get',
    })
      .then(response => {
        if (!disposed) {
          setMetadata(unwrapFilePreviewPayload(response) as FilePreviewMetadata);
        }
      })
      .catch((currentError: any) => {
        if (!disposed) setError(currentError?.message || '文件预览信息加载失败');
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, [reloadKey, request, ticket]);

  const downloadUrl = resolvePreviewServiceUrl(metadata?.downloadUrl, servicePrefix);
  const handleDownload = useCallback(() => {
    if (downloadUrl && typeof window !== 'undefined') window.location.assign(downloadUrl);
  }, [downloadUrl]);

  const renderContent = () => {
    if (!ticket) {
      return (
        <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}>
          <Empty description="缺少文件访问票据" />
        </div>
      );
    }
    if (loading && !metadata) {
      return (
        <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}>
          <Spin description="正在加载文件信息..." />
        </div>
      );
    }
    if (error) {
      return (
        <div style={{ padding: 24 }}>
          <Alert
            type="error"
            showIcon
            title={error}
            action={
              <Button
                icon={<ReloadOutlined />}
                onClick={() => setReloadKey(value => value + 1)}
              >
                重试
              </Button>
            }
          />
        </div>
      );
    }
    if (!metadata) {
      return (
        <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}>
          <Empty description="未获取到文件信息" />
        </div>
      );
    }
    return (
      <FilePreviewContent
        metadata={{ ...metadata, ticket: metadata.ticket || ticket }}
        request={request}
        servicePrefix={servicePrefix}
        onDownload={downloadUrl ? handleDownload : undefined}
      />
    );
  };

  return (
    <div
      data-testid="openxiangda-file-preview-page"
      style={{
        minHeight: '100vh',
        height: '100vh',
        display: 'grid',
        gridTemplateRows: '64px minmax(0, 1fr)',
        background: '#eef1f4',
        color: '#1f2328',
      }}
    >
      <header
        style={{
          minWidth: 0,
          padding: '0 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          background: '#fff',
          borderBottom: '1px solid #dfe3e8',
        }}
      >
        <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Tooltip title="返回">
            <Button
              type="text"
              shape="circle"
              icon={<ArrowLeftOutlined />}
              aria-label="返回"
              onClick={() => {
                if (window.history.length > 1) window.history.back();
                else window.close();
              }}
            />
          </Tooltip>
          <FileOutlined style={{ color: '#59636e', fontSize: 20 }} />
          <div style={{ minWidth: 0 }}>
            <Typography.Text
              strong
              style={{
                display: 'block',
                maxWidth: '56vw',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {metadata?.fileName || '附件预览'}
            </Typography.Text>
            {metadata ? (
              <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                {formatPreviewFileSize(metadata.size)}
              </Typography.Text>
            ) : null}
          </div>
          {metadata?.extension ? (
            <Tag style={{ marginInlineEnd: 0 }}>{metadata.extension.toUpperCase()}</Tag>
          ) : null}
        </div>
        <div style={{ display: 'flex', flexShrink: 0, gap: 8 }}>
          <Tooltip title="刷新">
            <Button
              icon={<ReloadOutlined />}
              aria-label="刷新"
              onClick={() => setReloadKey(value => value + 1)}
            />
          </Tooltip>
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            disabled={!downloadUrl}
            onClick={handleDownload}
          >
            下载
          </Button>
        </div>
      </header>
      <main style={{ minHeight: 0, overflow: 'hidden', padding: 12 }}>
        <div
          style={{
            height: '100%',
            minHeight: 0,
            overflow: 'hidden',
            background: '#fff',
            border: '1px solid #dfe3e8',
          }}
        >
          {renderContent()}
        </div>
      </main>
    </div>
  );
};

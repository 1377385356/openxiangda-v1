import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Empty, Image, Spin, Table, Tabs, Typography } from 'antd';
import { DownloadOutlined, FileOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  convertHeicPreview,
  loadPreviewBlob,
  unwrapFilePreviewPayload,
} from './capabilities';
import type { FilePreviewMetadata, FilePreviewRequest } from './types';

export const formatPreviewFileSize = (size?: number) => {
  const value = Number(size || 0);
  if (!value) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(
    units.length - 1,
    Math.floor(Math.log(value) / Math.log(1024)),
  );
  return `${(value / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

export const resolvePreviewServiceUrl = (url?: string, servicePrefix = '/service') => {
  const value = String(url || '').trim();
  if (!value) return '';
  if (/^(https?:)?\/\//i.test(value) || /^(blob|data):/i.test(value)) return value;
  if (value === servicePrefix || value.startsWith(`${servicePrefix}/`)) return value;
  if (value.startsWith('/file/')) {
    return `${servicePrefix.replace(/\/+$/, '')}${value}`;
  }
  return value;
};

const toColumnName = (index: number) => {
  let value = index + 1;
  let name = '';
  while (value > 0) {
    const mod = (value - 1) % 26;
    name = String.fromCharCode(65 + mod) + name;
    value = Math.floor((value - mod) / 26);
  }
  return name;
};

const buildRowsTable = (rows: any[] = []) => {
  const maxColumns = rows.reduce(
    (count, row) => Math.max(count, Array.isArray(row) ? row.length : 0),
    0,
  );
  const columns: any[] = [
    {
      title: '#',
      dataIndex: '__row',
      key: '__row',
      width: 58,
      fixed: 'left',
      render: (value: number) => (
        <Typography.Text type="secondary">{value}</Typography.Text>
      ),
    },
    ...Array.from({ length: maxColumns }).map((_, index) => ({
      title: toColumnName(index),
      dataIndex: `col_${index}`,
      key: `col_${index}`,
      width: 168,
      render: (value: any) => (
        <Typography.Text ellipsis={{ tooltip: String(value ?? '') }}>
          {String(value ?? '')}
        </Typography.Text>
      ),
    })),
  ];
  const dataSource = rows.map((row, rowIndex) => {
    const record: Record<string, any> = { key: rowIndex, __row: rowIndex + 1 };
    (Array.isArray(row) ? row : []).forEach((value, colIndex) => {
      record[`col_${colIndex}`] = value;
    });
    return record;
  });
  return { columns, dataSource };
};

const CenteredState = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      minHeight: 280,
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    }}
  >
    {children}
  </div>
);

const PayloadPreview = ({
  request,
  url,
  mode,
}: {
  request: FilePreviewRequest;
  url: string;
  mode: 'excel' | 'text';
}) => {
  const [payload, setPayload] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let disposed = false;
    setPayload(null);
    setError('');
    if (!url) return () => {
      disposed = true;
    };
    setLoading(true);
    request({ url, method: 'get' })
      .then(response => {
        if (!disposed) setPayload(unwrapFilePreviewPayload(response));
      })
      .catch((currentError: any) => {
        if (!disposed) setError(currentError?.message || '文件预览内容加载失败');
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, [reloadKey, request, url]);

  if (loading) {
    return (
      <CenteredState>
        <Spin description={mode === 'excel' ? '正在解析工作簿...' : '正在读取文本...'} />
      </CenteredState>
    );
  }
  if (error) {
    return (
      <CenteredState>
        <Alert
          type="error"
          showIcon
          title={error}
          action={
            <Button icon={<ReloadOutlined />} onClick={() => setReloadKey(value => value + 1)}>
              重试
            </Button>
          }
        />
      </CenteredState>
    );
  }

  if (mode === 'excel') {
    const sheets = Array.isArray(payload?.sheets) ? payload.sheets : [];
    if (!sheets.length) {
      return (
        <CenteredState>
          <Empty description="暂无可预览的工作表" />
        </CenteredState>
      );
    }
    return (
      <Tabs
        style={{ height: '100%', padding: '0 16px' }}
        items={sheets.map((sheet: any) => {
          const table = buildRowsTable(sheet.rows || []);
          return {
            key: String(sheet.id || sheet.name),
            label: sheet.name || 'Sheet',
            children: (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {sheet.truncatedRows || sheet.truncatedColumns ? (
                  <Alert
                    type="info"
                    showIcon
                    title={`工作表较大，仅展示前 ${payload.maxRows || 200} 行、${
                      payload.maxColumns || 60
                    } 列。`}
                  />
                ) : null}
                <Table
                  bordered
                  size="small"
                  pagination={false}
                  scroll={{ x: 'max-content', y: 'min(66vh, 680px)' }}
                  columns={table.columns}
                  dataSource={table.dataSource}
                />
              </div>
            ),
          };
        })}
      />
    );
  }

  const text = String(payload?.text || '');
  return (
    <div style={{ height: '100%', overflow: 'auto', background: '#fff' }}>
      {payload?.truncated ? (
        <Alert
          type="info"
          showIcon
          banner
          title="文件较大，仅展示前部内容；完整内容请下载查看。"
        />
      ) : null}
      <pre
        style={{
          minHeight: 280,
          margin: 0,
          padding: 20,
          color: '#1f2328',
          background: '#fff',
          fontSize: 13,
          lineHeight: 1.7,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
        }}
      >
        {text || '暂无文本内容'}
      </pre>
    </div>
  );
};

const ClientTextPreview = ({
  request,
  url,
}: {
  request: FilePreviewRequest;
  url: string;
}) => {
  const [payload, setPayload] = useState<{ text: string; truncated: boolean } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let disposed = false;
    let textLimit = 1024 * 1024;
    loadPreviewBlob(request, url)
      .then(async blob => {
        const slice = blob.size > textLimit ? blob.slice(0, textLimit) : blob;
        const text = await slice.text();
        if (!disposed) setPayload({ text, truncated: blob.size > textLimit });
      })
      .catch((currentError: any) => {
        if (!disposed) setError(currentError?.message || '文本读取失败');
      });
    return () => {
      disposed = true;
      textLimit = 0;
    };
  }, [request, url]);

  if (error) return <CenteredState><Alert type="error" showIcon title={error} /></CenteredState>;
  if (!payload) return <CenteredState><Spin description="正在读取文本..." /></CenteredState>;
  return (
    <div style={{ height: '100%', overflow: 'auto', background: '#fff' }}>
      {payload.truncated ? (
        <Alert type="info" showIcon banner title="文件较大，仅展示前部内容。" />
      ) : null}
      <pre
        style={{
          margin: 0,
          padding: 20,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          fontSize: 13,
          lineHeight: 1.7,
        }}
      >
        {payload.text || '暂无文本内容'}
      </pre>
    </div>
  );
};

const DocxPreview = ({ request, url }: { request: FilePreviewRequest; url: string }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let disposed = false;
    const container = containerRef.current;
    if (!container || !url) return () => {
      disposed = true;
    };
    container.innerHTML = '';
    setLoading(true);
    setError('');
    (async () => {
      try {
        const blob = await loadPreviewBlob(request, url);
        const { renderAsync } = await import('docx-preview');
        if (disposed || !containerRef.current) return;
        await renderAsync(blob, containerRef.current, containerRef.current, {
          className: 'sy-docx-preview',
          inWrapper: true,
          breakPages: true,
          ignoreLastRenderedPageBreak: false,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true,
          useBase64URL: false,
        });
      } catch (currentError: any) {
        if (!disposed) setError(currentError?.message || 'Word 文档解析失败');
      } finally {
        if (!disposed) setLoading(false);
      }
    })();
    return () => {
      disposed = true;
      if (container) container.innerHTML = '';
    };
  }, [request, url]);

  return (
    <div
      style={{
        minHeight: 360,
        height: '100%',
        overflow: 'auto',
        position: 'relative',
        background: '#e9edf2',
      }}
    >
      {loading ? (
        <CenteredState>
          <Spin description="正在还原 Word 版式..." />
        </CenteredState>
      ) : null}
      {error ? (
        <div style={{ padding: 20 }}>
          <Alert type="error" showIcon title={error} />
        </div>
      ) : null}
      <div ref={containerRef} style={{ display: loading || error ? 'none' : 'block' }} />
    </div>
  );
};

const HeicImagePreview = ({
  request,
  url,
  fileName,
}: {
  request: FilePreviewRequest;
  url: string;
  fileName?: string;
}) => {
  const [src, setSrc] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let disposed = false;
    let objectUrl = '';
    convertHeicPreview(request, url)
      .then(result => {
        objectUrl = result;
        if (!disposed) setSrc(result);
      })
      .catch((currentError: any) => {
        if (!disposed) setError(currentError?.message || 'HEIC 图片转换失败');
      });
    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL?.(objectUrl);
    };
  }, [request, url]);

  if (error) return <CenteredState><Alert type="error" showIcon title={error} /></CenteredState>;
  if (!src) return <CenteredState><Spin description="正在转换 HEIC 图片..." /></CenteredState>;
  return (
    <div style={{ minHeight: 320, textAlign: 'center', padding: 20, background: '#f3f5f7' }}>
      <Image
        src={src}
        alt={fileName || 'HEIC 图片预览'}
        style={{ maxWidth: '100%', maxHeight: '72vh', objectFit: 'contain' }}
      />
    </div>
  );
};

const ClientSpreadsheetPreview = ({
  request,
  url,
}: {
  request: FilePreviewRequest;
  url: string;
}) => {
  const [payload, setPayload] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        const blob = await loadPreviewBlob(request, url);
        const XLSX = await import('xlsx');
        const workbook = XLSX.read(await blob.arrayBuffer(), {
          cellDates: true,
          dense: true,
        });
        const maxRows = 500;
        const maxColumns = 100;
        const sheets = workbook.SheetNames.map((name, index) => {
          const allRows = XLSX.utils.sheet_to_json<any[]>(workbook.Sheets[name], {
            header: 1,
            defval: '',
            raw: false,
          });
          const columnCount = allRows.reduce(
            (count, row) => Math.max(count, Array.isArray(row) ? row.length : 0),
            0,
          );
          return {
            id: index,
            name,
            rows: allRows.slice(0, maxRows).map(row =>
              (Array.isArray(row) ? row : []).slice(0, maxColumns),
            ),
            truncatedRows: allRows.length > maxRows,
            truncatedColumns: columnCount > maxColumns,
          };
        });
        if (!disposed) setPayload({ sheets, maxRows, maxColumns });
      } catch (currentError: any) {
        if (!disposed) setError(currentError?.message || 'Excel 文件解析失败');
      }
    })();
    return () => {
      disposed = true;
    };
  }, [request, url]);

  if (error) return <CenteredState><Alert type="error" showIcon title={error} /></CenteredState>;
  if (!payload) return <CenteredState><Spin description="正在解析工作簿..." /></CenteredState>;
  return <PayloadPreviewFromValue payload={payload} />;
};

const PayloadPreviewFromValue = ({ payload }: { payload: any }) => {
  const sheets = Array.isArray(payload?.sheets) ? payload.sheets : [];
  if (!sheets.length) return <CenteredState><Empty description="暂无可预览的工作表" /></CenteredState>;
  return (
    <Tabs
      style={{ height: '100%', padding: '0 16px' }}
      items={sheets.map((sheet: any) => {
        const table = buildRowsTable(sheet.rows || []);
        return {
          key: String(sheet.id ?? sheet.name),
          label: sheet.name || 'Sheet',
          children: (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {sheet.truncatedRows || sheet.truncatedColumns ? (
                <Alert
                  type="info"
                  showIcon
                  title={`工作表较大，仅展示前 ${payload.maxRows} 行、${payload.maxColumns} 列。`}
                />
              ) : null}
              <Table
                bordered
                size="small"
                pagination={false}
                scroll={{ x: 'max-content', y: 'min(66vh, 680px)' }}
                columns={table.columns}
                dataSource={table.dataSource}
              />
            </div>
          ),
        };
      })}
    />
  );
};

const scriptPromises = new Map<string, Promise<void>>();

const loadScriptOnce = (src: string) => {
  const existingPromise = scriptPromises.get(src);
  if (existingPromise) return existingPromise;
  const promise = new Promise<void>((resolve, reject) => {
    if (!src || typeof document === 'undefined') {
      reject(new Error('ONLYOFFICE 脚本地址不可用'));
      return;
    }
    const existed = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null;
    if (existed?.dataset.loaded === 'true') {
      resolve();
      return;
    }
    const script = existed || document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = () => reject(new Error('ONLYOFFICE 脚本加载失败'));
    if (!existed) document.body.appendChild(script);
  });
  scriptPromises.set(src, promise);
  promise.catch(() => scriptPromises.delete(src));
  return promise;
};

const OnlyOfficePreview = ({
  request,
  configUrl,
  ticket,
}: {
  request: FilePreviewRequest;
  configUrl: string;
  ticket?: string;
}) => {
  const editorId = useMemo(
    () => `openxiangda-onlyoffice-${String(ticket || 'editor').replace(/[^a-zA-Z0-9_-]/g, '')}`,
    [ticket],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let disposed = false;
    let editor: any;
    setLoading(true);
    setError('');
    (async () => {
      try {
        const response = await request({ url: configUrl, method: 'get' });
        const payload = unwrapFilePreviewPayload(response);
        const scriptUrl = `${String(payload?.documentServerUrl || '').replace(
          /\/+$/,
          '',
        )}/web-apps/apps/api/documents/api.js`;
        await loadScriptOnce(scriptUrl);
        if (!disposed && (window as any).DocsAPI?.DocEditor) {
          editor = new (window as any).DocsAPI.DocEditor(editorId, payload.config);
        }
      } catch (currentError: any) {
        if (!disposed) setError(currentError?.message || 'ONLYOFFICE 预览加载失败');
      } finally {
        if (!disposed) setLoading(false);
      }
    })();
    return () => {
      disposed = true;
      editor?.destroyEditor?.();
    };
  }, [configUrl, editorId, request]);

  return (
    <div style={{ height: '100%', minHeight: 420, position: 'relative', background: '#fff' }}>
      {loading ? <CenteredState><Spin description="正在加载 ONLYOFFICE..." /></CenteredState> : null}
      {error ? <div style={{ padding: 20 }}><Alert type="error" showIcon title={error} /></div> : null}
      <div id={editorId} style={{ height: '100%', minHeight: 420, display: error ? 'none' : 'block' }} />
    </div>
  );
};

export interface FilePreviewContentProps {
  metadata: FilePreviewMetadata;
  request: FilePreviewRequest;
  servicePrefix?: string;
  onDownload?: () => void;
}

export const FilePreviewContent = ({
  metadata,
  request,
  servicePrefix = '/service',
  onDownload,
}: FilePreviewContentProps) => {
  const renderMode = metadata.renderMode || 'download';
  const previewUrl = resolvePreviewServiceUrl(metadata.previewUrl, servicePrefix);
  const imageUrl = resolvePreviewServiceUrl(
    renderMode === 'image-transcode' ? metadata.imagePreviewUrl : metadata.previewUrl,
    servicePrefix,
  );

  if (renderMode === 'inline' && metadata.previewType === 'image') {
    return (
      <div
        style={{
          height: '100%',
          minHeight: 320,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'auto',
          padding: 20,
          background: '#f3f5f7',
        }}
      >
        <Image
          src={imageUrl}
          alt={metadata.fileName || '图片预览'}
          style={{ maxWidth: '100%', maxHeight: '72vh', objectFit: 'contain' }}
        />
      </div>
    );
  }

  if (renderMode === 'image-transcode') {
    return (
      <div style={{ minHeight: 320, textAlign: 'center', padding: 20, background: '#f3f5f7' }}>
        <Image
          src={imageUrl}
          alt={metadata.fileName || '图片预览'}
          style={{ maxWidth: '100%', maxHeight: '72vh', objectFit: 'contain' }}
        />
      </div>
    );
  }

  if (renderMode === 'image-heic') {
    return (
      <HeicImagePreview
        request={request}
        url={previewUrl}
        fileName={metadata.fileName}
      />
    );
  }

  if (renderMode === 'inline' && metadata.previewType === 'video') {
    return (
      <div
        style={{
          height: '100%',
          minHeight: 320,
          display: 'flex',
          alignItems: 'center',
          background: '#080a0d',
        }}
      >
        <video
          controls
          playsInline
          preload="metadata"
          src={previewUrl}
          style={{ width: '100%', maxHeight: '76vh' }}
        >
          当前浏览器不支持视频播放。
        </video>
      </div>
    );
  }

  if (renderMode === 'inline' && metadata.previewType === 'audio') {
    return (
      <CenteredState>
        <audio controls preload="metadata" src={previewUrl} style={{ width: 'min(680px, 100%)' }}>
          当前浏览器不支持音频播放。
        </audio>
      </CenteredState>
    );
  }

  if (renderMode === 'pdfjs') {
    return (
      <iframe
        title={metadata.fileName || 'PDF 预览'}
        src={previewUrl}
        style={{ width: '100%', height: '100%', minHeight: 520, border: 0, background: '#fff' }}
      />
    );
  }

  if (renderMode === 'docx-html') {
    return <DocxPreview request={request} url={previewUrl} />;
  }

  if (renderMode === 'excel-client') {
    return <ClientSpreadsheetPreview request={request} url={previewUrl} />;
  }

  if (renderMode === 'excel-basic') {
    return (
      <PayloadPreview
        request={request}
        url={metadata.excelPreviewUrl || ''}
        mode="excel"
      />
    );
  }

  if (renderMode === 'text-client') {
    return <ClientTextPreview request={request} url={previewUrl} />;
  }

  if (renderMode === 'text' || renderMode === 'office-text') {
    return (
      <PayloadPreview
        request={request}
        url={
          renderMode === 'office-text'
            ? metadata.officeTextPreviewUrl || ''
            : metadata.textPreviewUrl || ''
        }
        mode="text"
      />
    );
  }

  if (renderMode === 'onlyoffice') {
    return (
      <OnlyOfficePreview
        request={request}
        configUrl={
          metadata.onlyofficeConfigUrl ||
          `/file/onlyoffice/config/${encodeURIComponent(metadata.ticket || '')}`
        }
        ticket={metadata.ticket}
      />
    );
  }

  return (
    <CenteredState>
      <Empty
        image={<FileOutlined style={{ fontSize: 52, color: '#8c8c8c' }} />}
        description={
          <div>
            <Typography.Text strong>当前文件无法在线预览</Typography.Text>
            <br />
            <Typography.Text type="secondary">
              {metadata.unsupportedReason || '请下载后使用本地应用打开。'}
            </Typography.Text>
          </div>
        }
      >
        {onDownload ? (
          <Button type="primary" icon={<DownloadOutlined />} onClick={onDownload}>
            下载文件
          </Button>
        ) : null}
      </Empty>
    </CenteredState>
  );
};

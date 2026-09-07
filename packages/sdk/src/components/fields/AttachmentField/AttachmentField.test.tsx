import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import React from 'react';
import { AttachmentField } from './index';
import { FormProvider } from '../../core/FormProvider';
import { useFormContext } from '../../core/FormContext';
import type { FormSchema, FormEngineConfig } from '../../types';

vi.mock('../../core/defaultRegistry', () => ({
  defaultComponentRegistry: {},
}));

globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock-url');

vi.mock('antd', () => ({
  Upload: (props: any) => {
    const {
      children,
      fileList,
      disabled,
      onChange,
      onRemove,
      onPreview,
      customRequest,
      beforeUpload,
      accept,
      showUploadList,
      ...rest
    } = props;
    return React.createElement(
      'div',
      { 'data-testid': rest['data-testid'] },
      children,
      React.createElement('input', {
        type: 'file',
        'data-testid': `upload-input-${rest['data-testid']}`,
        disabled,
        accept,
        onChange: (e: any) => {
          const file = e.target.files?.[0];
          if (file && beforeUpload) {
            const allowed = beforeUpload(file);
            if (!allowed) return;
          }
          if (file) {
            customRequest?.({
              file: Object.assign(file, { uid: file.name }),
              onProgress: vi.fn(),
              onSuccess: vi.fn(),
              onError: vi.fn(),
            });
          }
        },
      }),
      React.createElement(
        'button',
        {
          'data-testid': `trigger-null-list-${rest['data-testid']}`,
          onClick: () => onChange?.({ file: {} }),
        },
        'trigger-null-list',
      ),
      React.createElement(
        'button',
        {
          'data-testid': `trigger-null-props-${rest['data-testid']}`,
          onClick: () =>
            onChange?.({ fileList: [{ uid: undefined, name: undefined, url: undefined }] }),
        },
        'trigger-null-props',
      ),
      React.createElement(
        'button',
        {
          'data-testid': `trigger-custom-success-${rest['data-testid']}`,
          onClick: () =>
            customRequest?.({
              file: Object.assign(
                new File(['content'], 'custom.pdf', { type: 'application/pdf' }),
                {
                  uid: 'custom-uid',
                },
              ),
              onProgress: vi.fn(),
              onSuccess: vi.fn(),
              onError: vi.fn(),
            }),
        },
        'trigger-custom-success',
      ),
      React.createElement(
        'button',
        {
          'data-testid': `trigger-custom-error-${rest['data-testid']}`,
          onClick: () =>
            customRequest?.({
              file: Object.assign(
                new File(['content'], 'failed.pdf', { type: 'application/pdf' }),
                {
                  uid: 'failed-uid',
                },
              ),
              onProgress: vi.fn(),
              onSuccess: vi.fn(),
              onError: vi.fn(),
            }),
        },
        'trigger-custom-error',
      ),
      React.createElement(
        'button',
        {
          'data-testid': `trigger-preview-${rest['data-testid']}`,
          onClick: () => fileList?.[0] && onPreview?.(fileList[0]),
        },
        'trigger-preview',
      ),
      showUploadList !== false &&
        fileList?.map((f: any) =>
          React.createElement(
            'div',
            { key: f.uid, 'data-testid': `file-item-${f.uid}` },
            React.createElement('span', null, f.name),
            React.createElement(
              'button',
              {
                'data-testid': `remove-btn-${f.uid}`,
                onClick: () => onRemove?.(f),
                disabled,
              },
              'remove',
            ),
          ),
        ),
    );
  },
  Button: (props: any) =>
    React.createElement(
      'button',
      { ...props, 'data-testid': props['data-testid'] },
      props.children,
    ),
  Image: Object.assign(
    (props: any) => React.createElement('img', { src: props.src, alt: props.alt }),
    {
      PreviewGroup: ({ items = [], preview, children }: any) =>
        React.createElement(
          React.Fragment,
          null,
          children,
          preview?.open
            ? React.createElement(
                'div',
                { role: 'dialog', 'aria-label': '图片预览', 'data-testid': 'image-preview-dialog' },
                React.createElement('img', {
                  src: items[preview.current || 0]?.src,
                  alt: items[preview.current || 0]?.alt,
                }),
                React.createElement(
                  'button',
                  { onClick: () => preview.onOpenChange?.(false) },
                  '关闭图片预览',
                ),
              )
            : null,
        ),
    },
  ),
  Modal: ({ open, title, children, footer }: any) =>
    open
      ? React.createElement(
          'div',
          { role: 'dialog', 'aria-label': '附件预览', 'data-testid': 'file-preview-dialog' },
          title,
          children,
          footer,
        )
      : null,
  Typography: {
    Text: ({ children }: any) => React.createElement('span', null, children),
  },
  Alert: ({ message }: any) => React.createElement('div', null, message),
  Empty: ({ description, children }: any) =>
    React.createElement('div', null, description, children),
  Spin: ({ tip, description }: any) => React.createElement('div', null, tip || description),
  Table: () => React.createElement('div', null, 'table'),
  Tabs: () => React.createElement('div', null, 'tabs'),
}));

vi.mock('antd-mobile', () => ({}));

const mockIsMobile = vi.fn(() => false);
vi.mock('../../hooks/useDeviceDetect', () => ({
  useDeviceDetect: () => ({ isMobile: mockIsMobile() }),
}));

const createSchema = (overrides?: Partial<FormSchema>): FormSchema => ({
  formMeta: { formUuid: 'test', appType: 'test', title: 'Test' },
  fields: [],
  ...overrides,
});

const createConfig = (overrides?: Partial<FormEngineConfig>): FormEngineConfig => ({
  mode: 'submit',
  formUuid: 'test',
  appType: 'test',
  ...overrides,
});

interface RenderOptions {
  schema?: FormSchema;
  config?: FormEngineConfig;
  initialValues?: Record<string, any>;
}

function renderField(
  props: Partial<React.ComponentProps<typeof AttachmentField>> & { fieldId: string; label: string },
  opts?: RenderOptions,
) {
  const schema =
    opts?.schema ??
    createSchema({
      fields: [{ fieldId: props.fieldId, componentName: 'AttachmentField', label: props.label }],
    });
  const config = opts?.config ?? createConfig();
  const ctxRef: { current: ReturnType<typeof useFormContext> | null } = { current: null };

  const Capture = () => {
    ctxRef.current = useFormContext();
    return null;
  };

  const result = render(
    React.createElement(
      FormProvider,
      { schema, config, initialValues: opts?.initialValues, children: null },
      React.createElement(AttachmentField, props as any),
      React.createElement(Capture),
    ),
  );
  return { ...result, ctxRef };
}

beforeEach(() => {
  mockIsMobile.mockReturnValue(false);
});
afterEach(() => {
  vi.clearAllMocks();
});

describe('AttachmentField - NORMAL 态', () => {
  it('正常渲染 PC 端上传组件', () => {
    renderField({ fieldId: 'files', label: '附件' });
    expect(screen.getByText('附件')).toBeInTheDocument();
    expect(screen.getByTestId('attachmentfield-upload-btn-files')).toBeInTheDocument();
    expect(screen.getByTestId('attachmentfield-paste-zone-files')).toHaveClass(
      'sy-upload-paste-zone',
    );
  });

  it('上传文件触发值变更', async () => {
    const onChange = vi.fn();
    const { ctxRef } = renderField({ fieldId: 'files', label: '附件', onChange });
    const input = screen.getByTestId('upload-input-attachmentfield-input-files');
    const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
      await Promise.resolve();
    });
    expect(onChange).toHaveBeenCalled();
    expect(ctxRef.current!.formData.files).toBeDefined();
  });

  it('删除文件', () => {
    const onChange = vi.fn();
    const initialFiles = [{ url: 'http://a.com/1.pdf', name: '1.pdf', id: 'f1' }];
    const { ctxRef } = renderField(
      { fieldId: 'files', label: '附件', onChange },
      { initialValues: { files: initialFiles } },
    );
    const removeBtn = screen.getByTestId('attachmentfield-remove-f1');
    fireEvent.click(removeBtn);
    expect(ctxRef.current!.formData.files).toEqual([]);
  });

  it('maxSize 限制超大文件', () => {
    const onChange = vi.fn();
    renderField({ fieldId: 'files', label: '附件', maxSize: 1, onChange });
    const input = screen.getByTestId('upload-input-attachmentfield-input-files');
    const bigFile = new File(['x'.repeat(2 * 1024 * 1024)], 'big.pdf', { type: 'application/pdf' });
    Object.defineProperty(bigFile, 'size', { value: 2 * 1024 * 1024 });
    fireEvent.change(input, { target: { files: [bigFile] } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('PC 端使用灰底文件行展示类型、名称、大小和操作', () => {
    const files = [
      {
        id: 'pdf',
        uid: 'pdf',
        name: 'report.pdf',
        status: 'done',
        size: 2048,
        contentType: 'application/pdf',
      },
    ];
    renderField({ fieldId: 'files', label: '附件' }, { initialValues: { files } });

    const pasteZone = screen.getByTestId('attachmentfield-paste-zone-files');
    expect(pasteZone).toHaveTextContent('拖拽或点击后粘贴图片');
    expect(pasteZone).toHaveAttribute('tabindex', '0');
    expect(pasteZone.closest('[data-testid="attachmentfield-input-files"]')).toBeNull();
    expect(
      screen
        .getByTestId('attachmentfield-upload-btn-files')
        .closest('[data-testid="attachmentfield-input-files"]'),
    ).toBeTruthy();
    expect(screen.getByTestId('attachmentfield-rich-list-files')).toHaveClass('sy-file-list');
    expect(screen.getByTestId('attachmentfield-item-pdf')).toHaveClass('sy-file-item');
    expect(screen.getByText('report.pdf')).toHaveClass('sy-file-name');
    expect(screen.getByText('PDF · 2 KB')).toBeInTheDocument();
    expect(screen.getByText('预览')).toBeInTheDocument();
    expect(screen.getByText('下载')).toBeInTheDocument();
  });

  it('handles change with undefined fileList', () => {
    renderField({ fieldId: 'files', label: '附件' });
    fireEvent.click(screen.getByTestId('trigger-null-list-attachmentfield-input-files'));
    // Should not crash - exercises info.fileList ?? []
  });

  it('ignores malformed internal upload change events', () => {
    const onChange = vi.fn();
    renderField({ fieldId: 'files', label: '附件', onChange });
    fireEvent.click(screen.getByTestId('trigger-null-props-attachmentfield-input-files'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('customRequest handles progress, success and upload failure', async () => {
    const uploadFile = vi
      .fn()
      .mockImplementationOnce(async (_file, _bucket, onProgress) => {
        onProgress?.(45);
        return {
          id: 'uploaded-1',
          uid: 'uploaded-1',
          name: 'uploaded.pdf',
          objectName: 'uploaded.pdf',
          bucketName: 'attachments',
          size: 1234,
          contentType: 'application/pdf',
        };
      })
      .mockRejectedValueOnce(new Error('upload failed'));
    const onChange = vi.fn();
    const { ctxRef } = renderField(
      { fieldId: 'files', label: '附件', onChange, maxCount: 1, multiple: false },
      { config: createConfig({ api: { uploadFile } }) },
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('trigger-custom-success-attachmentfield-input-files'));
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(ctxRef.current!.formData.files).toEqual([
        expect.objectContaining({
          id: 'uploaded-1',
          name: 'uploaded.pdf',
          status: 'done',
          percent: 100,
        }),
      ]),
    );
    expect(uploadFile).toHaveBeenCalledWith(
      expect.any(File),
      'attachments',
      expect.any(Function),
      expect.objectContaining({
        appType: 'test',
        formUuid: 'test',
        fieldId: 'files',
        uploadPurpose: 'attachment',
      }),
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('trigger-custom-error-attachmentfield-input-files'));
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(ctxRef.current!.formData.files).toEqual([
        expect.objectContaining({ id: 'failed-uid', status: 'error', error: 'upload failed' }),
      ]),
    );
    expect(onChange).toHaveBeenCalled();
  });

  it('passes OSS upload options to runtime uploadFile', async () => {
    const uploadFile = vi.fn().mockImplementation(async (_file, _bucket, onProgress) => {
      onProgress?.(100);
      return {
        id: 'oss-file',
        uid: 'oss-file',
        provider: 'oss',
        storageCode: 'evaluate_oss',
        name: 'custom.pdf',
        objectName: 'openxiangda/APP_OSS/custom.pdf',
        bucketName: 'evaluate-oss',
        url: 'https://evaluate-oss.oss-cn-hangzhou.aliyuncs.com/openxiangda/APP_OSS/custom.pdf',
        size: 7,
        contentType: 'application/pdf',
      };
    });
    const { ctxRef } = renderField(
      {
        fieldId: 'files',
        label: '附件',
        uploadProvider: 'oss',
        storageCode: 'evaluate_oss',
      },
      { config: createConfig({ appType: 'APP_OSS', api: { uploadFile } }) },
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('trigger-custom-success-attachmentfield-input-files'));
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(ctxRef.current!.formData.files).toEqual([
        expect.objectContaining({
          provider: 'oss',
          storageCode: 'evaluate_oss',
          objectName: 'openxiangda/APP_OSS/custom.pdf',
          status: 'done',
        }),
      ]),
    );
    expect(uploadFile).toHaveBeenCalledWith(
      expect.any(File),
      'attachments',
      expect.any(Function),
      expect.objectContaining({
        uploadProvider: 'oss',
        storageCode: 'evaluate_oss',
        appType: 'APP_OSS',
        formUuid: 'test',
        fieldId: 'files',
        uploadPurpose: 'attachment',
      }),
    );
  });

  it('passes image compression options to runtime uploadFile', async () => {
    const imageCompression = { enabled: true, preview: { maxWidth: 1024, maxHeight: 1024 } };
    const uploadFile = vi.fn().mockImplementation(async (_file, _bucket, onProgress) => {
      onProgress?.(100);
      return {
        id: 'compressed-attachment',
        uid: 'compressed-attachment',
        name: 'custom.pdf',
        url: '/custom.pdf',
        size: 7,
        contentType: 'application/pdf',
      };
    });
    renderField(
      { fieldId: 'files', label: '附件', imageCompression },
      { config: createConfig({ api: { uploadFile } }) },
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('trigger-custom-success-attachmentfield-input-files'));
      await Promise.resolve();
    });

    expect(uploadFile).toHaveBeenCalledWith(
      expect.any(File),
      'attachments',
      expect.any(Function),
      expect.objectContaining({
        imageCompression,
        appType: 'test',
        formUuid: 'test',
        fieldId: 'files',
        uploadPurpose: 'attachment',
      }),
    );
  });

  it('uses direct OSS URLs for preview and download without file tickets', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const createFileAccessTicket = vi.fn();
    const createDownloadTicket = vi.fn();
    const files = [
      {
        id: 'oss-file',
        uid: 'oss-file',
        provider: 'oss',
        storageCode: 'evaluate_oss',
        name: 'report.pdf',
        objectName: 'openxiangda/APP_OSS/report.pdf',
        bucketName: 'evaluate-oss',
        url: 'https://evaluate-oss.oss-cn-hangzhou.aliyuncs.com/openxiangda/APP_OSS/report.pdf',
        previewUrl: 'https://evaluate-oss.oss-cn-hangzhou.aliyuncs.com/openxiangda/APP_OSS/report.pdf',
        downloadUrl: 'https://evaluate-oss.oss-cn-hangzhou.aliyuncs.com/openxiangda/APP_OSS/report.pdf',
        contentType: 'application/pdf',
        status: 'done',
      },
    ];
    renderField(
      { fieldId: 'files', label: '附件' },
      {
        initialValues: { files },
        config: createConfig({ api: { createFileAccessTicket, createDownloadTicket } }),
      },
    );

    fireEvent.click(screen.getByText('预览'));
    expect(await screen.findByRole('dialog', { name: '附件预览' })).toBeInTheDocument();
    expect(
      screen.getByRole('dialog', { name: '附件预览' }).querySelector('iframe'),
    ).toHaveAttribute('src', files[0].previewUrl);
    expect(open).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('关闭'));
    fireEvent.click(screen.getByText('下载'));
    await waitFor(() =>
      expect(open).toHaveBeenCalledWith(
        files[0].downloadUrl,
        '_blank',
        'noopener,noreferrer',
      ),
    );
    expect(createFileAccessTicket).not.toHaveBeenCalled();
    expect(createDownloadTicket).not.toHaveBeenCalled();
  });

  it('PC 端粘贴区域不触发文件选择并支持粘贴上传附件', async () => {
    const uploadFile = vi.fn().mockImplementation(async (file, _bucket, onProgress) => {
      onProgress?.(100);
      return {
        id: 'pasted-file',
        uid: 'pasted-file',
        name: file.name,
        objectName: file.name,
        bucketName: 'attachments',
        size: file.size,
        contentType: file.type,
      };
    });
    const { ctxRef } = renderField(
      { fieldId: 'files', label: '附件' },
      { config: createConfig({ api: { uploadFile } }) },
    );
    const pasteZone = screen.getByTestId('attachmentfield-paste-zone-files');
    const file = new File(['content'], 'pasted.pdf', { type: 'application/pdf' });

    fireEvent.click(pasteZone);
    expect(uploadFile).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.paste(pasteZone, {
        clipboardData: {
          files: [file],
          items: [],
        },
      });
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(uploadFile).toHaveBeenCalledWith(
        file,
        'attachments',
        expect.anything(),
        expect.objectContaining({
          appType: 'test',
          formUuid: 'test',
          fieldId: 'files',
          uploadPurpose: 'attachment',
        }),
      ),
    );
    await waitFor(() =>
      expect(ctxRef.current!.formData.files).toEqual([
        expect.objectContaining({
          id: 'pasted-file',
          name: 'pasted.pdf',
          status: 'done',
          percent: 100,
        }),
      ]),
    );
  });

  it('renders rich file actions with protected preview, download and remote delete', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const createFileAccessTicket = vi
      .fn()
      .mockResolvedValueOnce({
        ticket: 'T 1',
        metadataUrl: '/file/access-ticket/T%201',
        previewUrl: '/service/file/preview-by-ticket/T%201',
      })
      .mockResolvedValueOnce({
        ticket: 'T 2',
        metadataUrl: '/file/access-ticket/T%202',
        previewUrl: '/service/file/preview-by-ticket/T%202',
      });
    const request = vi.fn(async (config: any) => {
      if (config.url === '/file/preview-capabilities') {
        return {
          code: 200,
          data: {
            items: [
              { key: 'img', previewType: 'image', renderMode: 'inline', canPreview: true },
              { key: 'doc', previewType: 'pdf', renderMode: 'pdfjs', canPreview: true },
            ],
          },
        };
      }
      if (config.url === '/file/access-ticket/T%201') {
        return {
          code: 200,
          data: {
            ticket: 'T 1',
            fileName: 'photo.png',
            previewType: 'image',
            renderMode: 'inline',
            canPreview: true,
            previewUrl: '/file/preview-by-ticket/T%201',
          },
        };
      }
      if (config.url === '/file/access-ticket/T%202') {
        return {
          code: 200,
          data: {
            ticket: 'T 2',
            fileName: 'report.pdf',
            previewType: 'pdf',
            renderMode: 'pdfjs',
            canPreview: true,
            previewUrl: '/file/preview-by-ticket/T%202',
          },
        };
      }
      throw new Error(`unexpected request: ${config.url}`);
    });
    const createDownloadTicket = vi.fn().mockResolvedValue('/download-ticket');
    const deleteFile = vi.fn().mockResolvedValue({ success: true });
    const files = [
      {
        id: 'img',
        uid: 'img',
        name: 'photo.png',
        objectName: 'photo.png',
        bucketName: 'private',
        status: 'done',
        size: 2048,
        contentType: 'image/png',
      },
      {
        id: 'doc',
        uid: 'doc',
        name: 'report.pdf',
        objectName: 'report.pdf',
        bucketName: 'private',
        status: 'done',
        size: 4096,
        contentType: 'application/pdf',
      },
      {
        id: 'bad',
        uid: 'bad',
        name: 'bad.zip',
        status: 'error',
        error: '上传失败',
      },
    ];
    const { ctxRef } = renderField(
      { fieldId: 'files', label: '附件', previewPagePath: '/file-preview?embedded=1' },
      {
        initialValues: { files },
        config: createConfig({
          api: { request, createFileAccessTicket, createDownloadTicket, deleteFile },
        }),
      },
    );

    expect(screen.getByText('PNG · 2 KB')).toBeInTheDocument();
    expect(screen.getByText('上传失败')).toBeInTheDocument();

    const previewActions = await screen.findAllByText('预览');
    fireEvent.click(previewActions[0]);
    expect(await screen.findByRole('dialog', { name: '图片预览' })).toBeInTheDocument();
    expect(openSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('关闭图片预览'));
    fireEvent.click((await screen.findAllByText('预览'))[1]);
    expect(await screen.findByRole('dialog', { name: '附件预览' })).toBeInTheDocument();
    expect(
      screen.getByRole('dialog', { name: '附件预览' }).querySelector('iframe'),
    ).toHaveAttribute(
      'src',
      '/service/file/preview-by-ticket/T%202',
    );
    expect(openSpy).not.toHaveBeenCalled();
    expect(createFileAccessTicket).toHaveBeenNthCalledWith(
      1,
      'private',
      'photo.png',
      'photo.png',
      'preview',
      { appType: 'test' },
    );
    expect(createFileAccessTicket).toHaveBeenNthCalledWith(
      2,
      'private',
      'report.pdf',
      'report.pdf',
      'preview',
      { appType: 'test' },
    );

    fireEvent.click(screen.getByText('关闭'));
    fireEvent.click(screen.getAllByText('下载')[0]);
    await waitFor(() =>
      expect(openSpy).toHaveBeenCalledWith('/download-ticket', '_blank', 'noopener,noreferrer'),
    );

    fireEvent.click(screen.getAllByText('删除')[0]);
    expect(ctxRef.current!.formData.files).toHaveLength(2);
    await waitFor(() => expect(deleteFile).toHaveBeenCalledWith('photo.png', 'private'));
  });

  it('uses the inline renderer instead of reopening a final previewPageUrl', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const createFileAccessTicket = vi
      .fn()
      .mockResolvedValueOnce({
        previewPageUrl: '/view/APP_TEST/file-preview?ticket=T%201',
        ticket: 'T 1',
        metadataUrl: '/file/access-ticket/T%201',
        previewUrl: '/service/file/preview-by-ticket/T%201',
      });
    const request = vi.fn(async (config: any) => {
      if (config.url === '/file/preview-capabilities') {
        return {
          code: 200,
          data: {
            items: [{ key: 'pdf', previewType: 'pdf', renderMode: 'pdfjs', canPreview: true }],
          },
        };
      }
      return {
        code: 200,
        data: {
          ticket: 'T 1',
          fileName: 'contract.pdf',
          previewType: 'pdf',
          renderMode: 'pdfjs',
          canPreview: true,
          previewUrl: '/file/preview-by-ticket/T%201',
        },
      };
    });
    const files = [
      {
        id: 'pdf',
        uid: 'pdf',
        name: 'contract.pdf',
        objectName: 'contract.pdf',
        bucketName: 'private',
        status: 'done',
      },
    ];
    renderField(
      { fieldId: 'files', label: '附件' },
      {
        initialValues: { files },
        config: createConfig({
          appType: 'APP_TEST',
          api: { request, createFileAccessTicket },
        }),
      },
    );

    fireEvent.click(await screen.findByText('预览'));
    expect(await screen.findByRole('dialog', { name: '附件预览' })).toBeInTheDocument();
    expect(
      screen.getByRole('dialog', { name: '附件预览' }).querySelector('iframe'),
    ).toHaveAttribute(
      'src',
      '/service/file/preview-by-ticket/T%201',
    );
    expect(openSpy).not.toHaveBeenCalled();
    expect(createFileAccessTicket).toHaveBeenCalledWith(
      'private',
      'contract.pdf',
      'contract.pdf',
      'preview',
      { appType: 'APP_TEST' },
    );
  });

  it('only shows preview after the platform confirms the file is previewable', async () => {
    const request = vi.fn().mockResolvedValue({
      code: 200,
      data: {
        items: [
          {
            key: 'archive',
            previewType: 'download',
            renderMode: 'download',
            canPreview: false,
            unsupportedReason: '当前文件类型没有可用的在线预览器',
          },
        ],
      },
    });
    renderField(
      { fieldId: 'files', label: '附件' },
      {
        initialValues: {
          files: [
            {
              id: 'archive',
              uid: 'archive',
              name: 'archive.zip',
              objectName: 'archive.zip',
              bucketName: 'private',
              status: 'done',
            },
          ],
        },
        config: createConfig({ api: { request } }),
      },
    );

    await waitFor(() => expect(request).toHaveBeenCalled());
    expect(screen.queryByText('预览')).not.toBeInTheDocument();
    expect(screen.getByText('下载')).toBeInTheDocument();
  });

  it('can hide rich preview and metadata actions', () => {
    renderField(
      {
        fieldId: 'files',
        label: '附件',
        showPreview: false,
        showDownload: false,
        showFileSize: false,
        showFileTypeBadge: false,
      },
      {
        initialValues: {
          files: [{ id: 'plain', uid: 'plain', name: 'plain.bin', status: 'done', size: 1 }],
        },
      },
    );

    expect(screen.queryByText('预览')).toBeNull();
    expect(screen.queryByText('下载')).toBeNull();
    expect(screen.getByText('已上传')).toBeInTheDocument();
  });

  it('required 显示 * 标记', () => {
    renderField({ fieldId: 'files', label: '附件', required: true });
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('tips 显示', () => {
    renderField({ fieldId: 'files', label: '附件', tips: '最大10MB' });
    expect(screen.getByText('最大10MB')).toBeInTheDocument();
  });
});

describe('AttachmentField - READONLY 态', () => {
  it('空值显示 "--"', () => {
    renderField({ fieldId: 'files', label: '附件', behavior: 'READONLY' });
    expect(screen.getByTestId('attachmentfield-readonly-files')).toHaveTextContent('--');
  });

  it('显示文件名列表', () => {
    const files = [
      { url: 'http://a.com/1.pdf', name: '报告.pdf', id: 'f1', size: 12800 },
      { url: 'http://a.com/2.doc', name: '文档.doc', id: 'f2', size: 12800 },
    ];
    renderField(
      { fieldId: 'files', label: '附件', behavior: 'READONLY' },
      { initialValues: { files } },
    );
    expect(screen.getByTestId('attachmentfield-readonly-files')).toHaveClass('sy-readonly-files');
    expect(screen.queryByText('打包下载')).toBeNull();
    expect(screen.getByTestId('attachmentfield-readonly-item-f1')).toHaveClass('sy-file-item');
    expect(screen.getByText('报告.pdf')).toBeInTheDocument();
    expect(screen.getByText('文档.doc')).toBeInTheDocument();
    expect(screen.getAllByText('13 KB')).toHaveLength(2);
  });

  it('文件名可点击', () => {
    const files = [{ url: 'http://a.com/1.pdf', name: '报告.pdf', id: 'f1' }];
    renderField(
      { fieldId: 'files', label: '附件', behavior: 'READONLY' },
      { initialValues: { files } },
    );
    const link = screen.getByText('报告.pdf');
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', 'http://a.com/1.pdf');
  });

  it('受保护文件点击时创建下载票据', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const createDownloadTicket = vi.fn().mockResolvedValue({ downloadUrl: '/readonly-ticket' });
    const files = [
      { objectName: 'secret.pdf', bucketName: 'secure', name: 'secret.pdf', id: 'secret' },
    ];
    renderField(
      { fieldId: 'files', label: '附件', behavior: 'READONLY', readonlyClassName: 'custom-ro' },
      {
        initialValues: { files },
        config: createConfig({ api: { createDownloadTicket } }),
      },
    );

    fireEvent.click(screen.getByText('secret.pdf'));
    await waitFor(() =>
      expect(createDownloadTicket).toHaveBeenCalledWith('secure', 'secret.pdf', 'secret.pdf'),
    );
    expect(openSpy).toHaveBeenCalledWith('/readonly-ticket', '_blank', 'noopener,noreferrer');
    expect(screen.getByTestId('attachmentfield-readonly-files')).toHaveClass('custom-ro');
  });

  it('移动端只读附件隐藏打包下载并保留灰底文件行', () => {
    mockIsMobile.mockReturnValue(true);
    const files = [{ url: 'http://a.com/1.docx', name: '报告.docx', id: 'f1', size: 12800 }];
    renderField(
      { fieldId: 'files', label: '附件', behavior: 'READONLY' },
      { initialValues: { files } },
    );

    expect(screen.getByTestId('attachmentfield-readonly-files')).toHaveClass('is-mobile');
    expect(screen.queryByText('打包下载')).toBeNull();
    expect(screen.getByTestId('attachmentfield-readonly-item-f1')).toHaveClass('sy-file-item');
    expect(screen.getByText('报告.docx')).toBeInTheDocument();
  });
});

describe('AttachmentField - HIDDEN 态', () => {
  it('不渲染任何 DOM', () => {
    renderField({ fieldId: 'files', label: '附件', behavior: 'HIDDEN' });
    expect(document.querySelector('[data-field-id="files"]')).not.toBeInTheDocument();
  });
});

describe('AttachmentField - DISABLED 态', () => {
  it('上传按钮禁用', () => {
    renderField({ fieldId: 'files', label: '附件', behavior: 'DISABLED' });
    expect(screen.getByTestId('attachmentfield-upload-btn-files')).toBeDisabled();
    const pasteZone = screen.getByTestId('attachmentfield-paste-zone-files');
    expect(pasteZone).toHaveClass('is-disabled');
    expect(pasteZone).toHaveAttribute('tabindex', '-1');
  });
});

describe('AttachmentField - 数据绑定', () => {
  it('从 FormProvider 接收初始值', () => {
    const files = [{ url: 'http://a.com/1.pdf', name: '1.pdf', id: 'f1' }];
    renderField({ fieldId: 'files', label: '附件' }, { initialValues: { files } });
    expect(screen.getByTestId('attachmentfield-item-f1')).toBeInTheDocument();
  });

  it('外部 setFieldValue 更新', () => {
    const { ctxRef } = renderField({ fieldId: 'files', label: '附件' });
    act(() => {
      ctxRef.current!.setFieldValue('files', [
        { url: 'http://b.com/x.pdf', name: 'x.pdf', id: 'x1' },
      ]);
    });
    expect(screen.getByTestId('attachmentfield-item-x1')).toBeInTheDocument();
  });

  it('defaultValue 在 mount 时设置到 context', () => {
    const def = [{ url: 'http://a.com/d.pdf', name: 'd.pdf', id: 'd1' }];
    const { ctxRef } = renderField({ fieldId: 'files', label: '附件', defaultValue: def });
    expect(ctxRef.current!.formData.files).toEqual(def);
  });

  it('context behavior 覆盖', () => {
    const schema = createSchema({
      fields: [
        { fieldId: 'files', componentName: 'AttachmentField', label: '附件', behavior: 'DISABLED' },
      ],
    });
    renderField({ fieldId: 'files', label: '附件' }, { schema });
    expect(screen.getByTestId('attachmentfield-upload-btn-files')).toBeDisabled();
  });

  it('字段不在 schema 中时默认 NORMAL', () => {
    const schema = createSchema({ fields: [] });
    renderField({ fieldId: 'files', label: '附件' }, { schema });
    expect(screen.getByTestId('attachmentfield-upload-btn-files')).toBeInTheDocument();
  });
});

describe('AttachmentField - 移动端', () => {
  it('isMobile 时渲染移动端组件', () => {
    mockIsMobile.mockReturnValue(true);
    renderField({ fieldId: 'files', label: '附件' });
    expect(screen.getByTestId('attachmentfield-mobile-files')).toBeInTheDocument();
    expect(screen.getByTestId('attachmentfield-file-input-files')).toHaveStyle({
      display: 'none',
    });
    expect(screen.getByTestId('attachmentfield-file-input-files')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });

  it('移动端上传文件', async () => {
    mockIsMobile.mockReturnValue(true);
    const onChange = vi.fn();
    renderField({ fieldId: 'files', label: '附件', onChange });
    const input = screen.getByTestId('attachmentfield-file-input-files');
    const file = new File(['content'], 'mobile.pdf', { type: 'application/pdf' });
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
      await Promise.resolve();
    });
    expect(onChange).toHaveBeenCalled();
  });

  it('移动端删除文件', () => {
    mockIsMobile.mockReturnValue(true);
    const onChange = vi.fn();
    const files = [{ url: 'http://a.com/1.pdf', name: '1.pdf', id: 'f1' }];
    const { ctxRef } = renderField(
      { fieldId: 'files', label: '附件', onChange },
      { initialValues: { files } },
    );
    fireEvent.click(screen.getByTestId('attachmentfield-remove-f1'));
    expect(ctxRef.current!.formData.files).toEqual([]);
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('移动端 files 为 null 时不报错', () => {
    mockIsMobile.mockReturnValue(true);
    renderField({ fieldId: 'files', label: '附件' });
    const input = screen.getByTestId('attachmentfield-file-input-files');
    fireEvent.change(input, { target: { files: null } });
    // Should not crash - exercises if (!files) return
  });

  it('移动端 disabled', () => {
    mockIsMobile.mockReturnValue(true);
    renderField({ fieldId: 'files', label: '附件', behavior: 'DISABLED' });
    expect(screen.getByTestId('attachmentfield-file-input-files')).toBeDisabled();
  });

  it('移动端达到 maxCount 后隐藏上传按钮并保留文件行', () => {
    mockIsMobile.mockReturnValue(true);
    const files = [
      {
        id: 'pdf',
        uid: 'pdf',
        name: 'report.pdf',
        status: 'done',
        size: 2048,
        contentType: 'application/pdf',
      },
    ];
    renderField({ fieldId: 'files', label: '附件', maxCount: 1 }, { initialValues: { files } });

    expect(screen.queryByTestId('attachmentfield-upload-btn-files')).not.toBeInTheDocument();
    expect(screen.getByTestId('attachmentfield-list-files')).toHaveClass('sy-file-list');
    expect(screen.getByTestId('attachmentfield-item-pdf')).toHaveClass('sy-file-item');
    expect(screen.getByText('report.pdf')).toHaveClass('sy-file-name');
    expect(screen.getByText('PDF · 2 KB')).toBeInTheDocument();
  });

  it('移动端处理受保护附件的预览、下载和远端删除', async () => {
    mockIsMobile.mockReturnValue(true);
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const createFileAccessTicket = vi
      .fn()
      .mockResolvedValueOnce({
        ticket: 'T 1',
        metadataUrl: '/file/access-ticket/T%201',
        previewUrl: '/service/file/preview-by-ticket/T%201',
      });
    const request = vi.fn(async (config: any) => {
      if (config.url === '/file/preview-capabilities') {
        return {
          code: 200,
          data: {
            items: [
              { key: 'pdf', previewType: 'pdf', renderMode: 'pdfjs', canPreview: true },
              { key: 'doc', previewType: 'office', renderMode: 'docx-html', canPreview: true },
            ],
          },
        };
      }
      return {
        code: 200,
        data: {
          ticket: 'T 1',
          fileName: 'report.pdf',
          previewType: 'pdf',
          renderMode: 'pdfjs',
          canPreview: true,
          previewUrl: '/file/preview-by-ticket/T%201',
        },
      };
    });
    const createDownloadTicket = vi
      .fn()
      .mockResolvedValueOnce({ relayUrl: '/relay-download' })
      .mockResolvedValueOnce('/string-download');
    const deleteFile = vi.fn().mockResolvedValue({ success: true });
    const files = [
      {
        id: 'pdf',
        uid: 'pdf',
        name: 'report.pdf',
        objectName: 'report.pdf',
        bucketName: 'secure-files',
        status: 'done',
        size: 2048,
        contentType: 'application/pdf',
      },
      {
        id: 'doc',
        uid: 'doc',
        name: 'contract.docx',
        objectName: 'contract.docx',
        bucketName: 'secure-files',
        status: 'done',
        size: 4096,
      },
      {
        id: 'local',
        uid: 'local',
        name: 'local.txt',
        status: 'done',
        previewUrl: '/local-preview',
        downloadUrl: '/local-download',
      },
      {
        id: 'err',
        uid: 'err',
        name: 'err.bin',
        status: 'error',
      },
    ];
    const { ctxRef } = renderField(
      { fieldId: 'files', label: '附件', previewPagePath: '/mobile-preview?embed=1' },
      {
        initialValues: { files },
        config: createConfig({
          api: { request, createFileAccessTicket, createDownloadTicket, deleteFile },
        }),
      },
    );

    expect(screen.getByText('PDF · 2 KB')).toBeInTheDocument();
    expect(screen.getByText('上传失败')).toBeInTheDocument();

    await waitFor(() => expect(screen.getAllByText('预览')).toHaveLength(3));
    fireEvent.click(screen.getAllByText('预览')[0]);
    expect(await screen.findByRole('dialog', { name: '附件预览' })).toBeInTheDocument();
    expect(
      screen.getByRole('dialog', { name: '附件预览' }).querySelector('iframe'),
    ).toHaveAttribute(
      'src',
      '/service/file/preview-by-ticket/T%201',
    );
    expect(openSpy).not.toHaveBeenCalled();
    expect(createFileAccessTicket).toHaveBeenCalledWith(
      'secure-files',
      'report.pdf',
      'report.pdf',
      'preview',
      { appType: 'test' },
    );
    fireEvent.click(screen.getByText('关闭'));

    fireEvent.click(screen.getAllByText('下载')[0]);
    await waitFor(() =>
      expect(openSpy).toHaveBeenCalledWith('/relay-download', '_blank', 'noopener,noreferrer'),
    );
    fireEvent.click(screen.getAllByText('下载')[1]);
    await waitFor(() =>
      expect(openSpy).toHaveBeenCalledWith('/string-download', '_blank', 'noopener,noreferrer'),
    );
    fireEvent.click(screen.getAllByText('下载')[2]);
    await waitFor(() =>
      expect(openSpy).toHaveBeenCalledWith('/local-download', '_blank', 'noopener,noreferrer'),
    );

    fireEvent.click(screen.getByTestId('attachmentfield-remove-pdf'));
    expect(ctxRef.current!.formData.files).toHaveLength(3);
    await waitFor(() => expect(deleteFile).toHaveBeenCalledWith('report.pdf', 'secure-files'));
  });

  it('移动端上传覆盖进度、扩展名回填、失败和过滤规则', async () => {
    mockIsMobile.mockReturnValue(true);
    const uploadFile = vi
      .fn()
      .mockImplementationOnce(async (_file, _bucket, onProgress) => {
        onProgress?.(55);
        return {
          objectName: 'mobile.pdf',
          bucketName: 'attachments',
          name: 'mobile.pdf',
          size: 333,
        };
      })
      .mockRejectedValueOnce(new Error('mobile attachment failed'));
    const onChange = vi.fn();
    const { ctxRef } = renderField(
      {
        fieldId: 'files',
        label: '附件',
        onChange,
        multiple: false,
        allowedTypes: ['pdf'],
        maxSize: 1,
      },
      { config: createConfig({ api: { uploadFile } }) },
    );
    const input = screen.getByTestId('attachmentfield-file-input-files');

    await act(async () => {
      fireEvent.change(input, {
        target: { files: [new File(['content'], 'ignore.txt', { type: 'text/plain' })] },
      });
      await Promise.resolve();
    });
    expect(uploadFile).not.toHaveBeenCalled();

    const bigFile = new File(['content'], 'big.pdf', { type: 'application/pdf' });
    Object.defineProperty(bigFile, 'size', { value: 2 * 1024 * 1024 });
    await act(async () => {
      fireEvent.change(input, { target: { files: [bigFile] } });
      await Promise.resolve();
    });
    expect(uploadFile).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.change(input, {
        target: { files: [new File(['content'], 'mobile.pdf', { type: 'application/pdf' })] },
      });
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(ctxRef.current!.formData.files).toEqual([
        expect.objectContaining({
          objectName: 'mobile.pdf',
          extension: 'pdf',
          status: 'done',
          percent: 100,
        }),
      ]),
    );

    await act(async () => {
      fireEvent.change(input, {
        target: { files: [new File(['content'], 'fail.pdf', { type: 'application/pdf' })] },
      });
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByText('mobile attachment failed')).toBeInTheDocument());
    expect(onChange).toHaveBeenCalled();
  });

  it('移动端可隐藏预览、下载和元信息', () => {
    mockIsMobile.mockReturnValue(true);
    renderField(
      {
        fieldId: 'files',
        label: '附件',
        showPreview: false,
        showDownload: false,
        showFileSize: false,
        showFileTypeBadge: false,
      },
      {
        initialValues: {
          files: [{ id: 'plain', uid: 'plain', name: 'plain.bin', status: 'done', size: 1 }],
        },
      },
    );

    expect(screen.queryByText('预览')).toBeNull();
    expect(screen.queryByText('下载')).toBeNull();
    expect(screen.getByText('已上传')).toBeInTheDocument();
  });
});

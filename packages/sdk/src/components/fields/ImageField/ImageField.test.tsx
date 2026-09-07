import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import React from 'react';
import { ImageField } from './index';
import { FormProvider } from '../../core/FormProvider';
import { useFormContext } from '../../core/FormContext';
import type { FormSchema, FormEngineConfig } from '../../types';

vi.mock('../../core/defaultRegistry', () => ({
  defaultComponentRegistry: {},
}));

globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock-url');

const mobileMock = vi.hoisted(() => ({
  useUploader: false,
  toastShow: vi.fn(),
  lastError: '',
}));

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
          if (file && beforeUpload?.(file) === false) return;
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
            onChange?.({
              fileList: [{ uid: undefined, name: undefined, url: undefined, thumbUrl: undefined }],
            }),
        },
        'trigger-null-props',
      ),
      React.createElement(
        'button',
        {
          'data-testid': `trigger-custom-success-${rest['data-testid']}`,
          onClick: () =>
            customRequest?.({
              file: Object.assign(new File(['img'], 'custom.png', { type: 'image/png' }), {
                uid: 'custom-uid',
              }),
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
              file: Object.assign(new File(['img'], 'failed.png', { type: 'image/png' }), {
                uid: 'failed-uid',
              }),
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
            { key: f.uid, 'data-testid': `img-item-${f.uid}` },
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
  Modal: ({ open, children }: any) =>
    open
      ? React.createElement(
          'div',
          { role: 'dialog', 'aria-label': '附件预览', 'data-testid': 'file-preview-dialog' },
          children,
        )
      : null,
  Typography: {
    Text: ({ children }: any) => React.createElement('span', null, children),
  },
  Button: ({ children, ...props }: any) => React.createElement('button', props, children),
  Alert: ({ message }: any) => React.createElement('div', null, message),
  Empty: ({ description, children }: any) =>
    React.createElement('div', null, description, children),
  Spin: ({ tip, description }: any) => React.createElement('div', null, tip || description),
  Table: () => React.createElement('div', null, 'table'),
  Tabs: () => React.createElement('div', null, 'tabs'),
}));

vi.mock('antd-mobile', () => ({
  get ImageUploader() {
    if (!mobileMock.useUploader) return undefined;
    return ({ value = [], upload, onChange, disableUpload, showUpload }: any) => (
      <div data-testid="mock-image-uploader">
        <button
          type="button"
          disabled={disableUpload}
          data-testid="mobile-uploader-upload"
          onClick={async () => {
            const result = await upload(new File(['img'], 'uploader.png', { type: 'image/png' }));
            onChange?.([...value, result]);
          }}
        >
          upload
        </button>
        <button
          type="button"
          data-testid="mobile-uploader-invalid"
          onClick={async () => {
            try {
              await upload(new File(['txt'], 'bad.txt', { type: 'text/plain' }));
            } catch (error: any) {
              mobileMock.lastError = error?.message || '';
            }
          }}
        >
          invalid
        </button>
        <button
          type="button"
          data-testid="mobile-uploader-change-empty"
          onClick={() => onChange?.([])}
        >
          clear
        </button>
        <span data-testid="mobile-uploader-show">{String(showUpload)}</span>
      </div>
    );
  },
  Toast: {
    show: mobileMock.toastShow,
  },
}));

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
  props: Partial<React.ComponentProps<typeof ImageField>> & { fieldId: string; label: string },
  opts?: RenderOptions,
) {
  const schema =
    opts?.schema ??
    createSchema({
      fields: [{ fieldId: props.fieldId, componentName: 'ImageField', label: props.label }],
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
      React.createElement(ImageField, props as any),
      React.createElement(Capture),
    ),
  );
  return { ...result, ctxRef };
}

beforeEach(() => {
  mockIsMobile.mockReturnValue(false);
  mobileMock.useUploader = false;
  mobileMock.toastShow.mockClear();
  mobileMock.lastError = '';
});
afterEach(() => {
  vi.clearAllMocks();
});

describe('ImageField - NORMAL 态', () => {
  it('正常渲染 PC 端上传组件', () => {
    renderField({ fieldId: 'imgs', label: '图片' });
    expect(screen.getByText('图片')).toBeInTheDocument();
    expect(screen.getByTestId('imagefield-upload-btn-imgs')).toBeInTheDocument();
    expect(screen.getByTestId('imagefield-paste-zone-imgs')).toHaveClass('sy-upload-paste-zone');
  });

  it('上传图片触发值变更', async () => {
    const onChange = vi.fn();
    const { ctxRef } = renderField({ fieldId: 'imgs', label: '图片', onChange });
    const input = screen.getByTestId('upload-input-imagefield-input-imgs');
    const file = new File(['img'], 'photo.png', { type: 'image/png' });
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
      await Promise.resolve();
    });
    expect(onChange).toHaveBeenCalled();
    expect(ctxRef.current!.formData.imgs).toBeDefined();
  });

  it('删除图片', () => {
    const onChange = vi.fn();
    const initialImgs = [{ url: 'http://a.com/1.png', name: '1.png', id: 'i1' }];
    const { ctxRef } = renderField(
      { fieldId: 'imgs', label: '图片', onChange },
      { initialValues: { imgs: initialImgs } },
    );
    fireEvent.click(screen.getByTestId('remove-btn-i1'));
    expect(ctxRef.current!.formData.imgs).toEqual([]);
    expect(onChange).toHaveBeenCalled();
  });

  it('maxCount 达上限隐藏上传按钮', () => {
    const imgs = [{ url: 'http://a.com/1.png', name: '1.png', id: 'i1' }];
    renderField({ fieldId: 'imgs', label: '图片', maxCount: 1 }, { initialValues: { imgs } });
    expect(screen.queryByTestId('imagefield-upload-btn-imgs')).not.toBeInTheDocument();
  });

  it('PC 端使用灰底文件行展示图片名称、大小和操作', () => {
    const imgs = [
      {
        url: 'http://a.com/photo.png',
        name: 'photo.png',
        id: 'i1',
        uid: 'i1',
        status: 'done',
        size: 2048,
      },
    ];
    renderField({ fieldId: 'imgs', label: '图片' }, { initialValues: { imgs } });

    const pasteZone = screen.getByTestId('imagefield-paste-zone-imgs');
    expect(pasteZone).toHaveTextContent('拖拽或Ctrl+V粘贴图片');
    expect(pasteZone).toHaveAttribute('tabindex', '0');
    expect(pasteZone.closest('[data-testid="imagefield-input-imgs"]')).toBeNull();
    expect(
      screen
        .getByTestId('imagefield-upload-btn-imgs')
        .closest('[data-testid="imagefield-input-imgs"]'),
    ).toBeTruthy();
    expect(screen.getByTestId('imagefield-rich-grid-imgs')).toHaveClass('sy-file-list');
    expect(screen.getByTestId('imagefield-thumb-i1')).toHaveClass(
      'sy-file-item',
      'sy-image-file-item',
    );
    expect(screen.getByText('photo.png')).toHaveClass('sy-file-name');
    expect(screen.getByText('2 KB')).toHaveClass('sy-file-sub');
    expect(screen.getByText('预览')).toBeInTheDocument();
    expect(screen.getByText('下载')).toBeInTheDocument();
  });

  it('handles change with undefined fileList', () => {
    renderField({ fieldId: 'imgs', label: '图片' });
    fireEvent.click(screen.getByTestId('trigger-null-list-imagefield-input-imgs'));
    // Should not crash - exercises info.fileList ?? []
  });

  it('ignores malformed internal upload change events', () => {
    const onChange = vi.fn();
    renderField({ fieldId: 'imgs', label: '图片', onChange });
    fireEvent.click(screen.getByTestId('trigger-null-props-imagefield-input-imgs'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('rejects non-image and oversized PC files before upload', () => {
    const onChange = vi.fn();
    renderField({ fieldId: 'imgs', label: '图片', onChange, maxSize: 1 });
    const input = screen.getByTestId('upload-input-imagefield-input-imgs');
    fireEvent.change(input, {
      target: { files: [new File(['txt'], 'bad.txt', { type: 'text/plain' })] },
    });
    expect(onChange).not.toHaveBeenCalled();

    const bigFile = new File(['img'], 'big.png', { type: 'image/png' });
    Object.defineProperty(bigFile, 'size', { value: 2 * 1024 * 1024 });
    fireEvent.change(input, { target: { files: [bigFile] } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('customRequest handles PC upload success, progress and failure', async () => {
    const uploadFile = vi
      .fn()
      .mockImplementationOnce(async (_file, _bucket, onProgress) => {
        onProgress?.(60);
        return {
          id: 'uploaded-img',
          uid: 'uploaded-img',
          name: 'uploaded.png',
          previewUrl: '/uploaded-preview.png',
          url: '/uploaded.png',
          size: 123,
        };
      })
      .mockRejectedValueOnce(new Error('image failed'));
    const { ctxRef } = renderField(
      { fieldId: 'imgs', label: '图片', multiple: false },
      { config: createConfig({ api: { uploadFile } }) },
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('trigger-custom-success-imagefield-input-imgs'));
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(ctxRef.current!.formData.imgs).toEqual([
        expect.objectContaining({
          id: 'uploaded-img',
          url: '/uploaded-preview.png',
          status: 'done',
          percent: 100,
        }),
      ]),
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('trigger-custom-error-imagefield-input-imgs'));
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(ctxRef.current!.formData.imgs).toEqual([
        expect.objectContaining({ id: 'failed-uid', status: 'error', error: 'image failed' }),
      ]),
    );
  });

  it('passes image compression options and stores image variant URLs', async () => {
    const imageCompression = { enabled: true, thumb: { maxWidth: 240, maxHeight: 240 } };
    const uploadFile = vi.fn().mockImplementation(async (_file, _bucket, onProgress) => {
      onProgress?.(100);
      return {
        id: 'variant-img',
        uid: 'variant-img',
        name: 'custom.png',
        url: '/original.png',
        thumbUrl: '/thumb.png',
        previewUrl: '/preview.png',
        variants: {
          thumb: { url: '/thumb.png', objectName: 'thumb.png', width: 240, height: 180 },
          preview: { url: '/preview.png', objectName: 'preview.png', width: 960, height: 720 },
        },
        size: 123,
      };
    });
    const { ctxRef } = renderField(
      { fieldId: 'imgs', label: '图片', multiple: false, imageCompression },
      { config: createConfig({ api: { uploadFile } }) },
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('trigger-custom-success-imagefield-input-imgs'));
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(ctxRef.current!.formData.imgs).toEqual([
        expect.objectContaining({
          id: 'variant-img',
          url: '/original.png',
          thumbUrl: '/thumb.png',
          previewUrl: '/preview.png',
          variants: expect.objectContaining({
            thumb: expect.objectContaining({ url: '/thumb.png' }),
            preview: expect.objectContaining({ url: '/preview.png' }),
          }),
          status: 'done',
        }),
      ]),
    );
    expect(uploadFile).toHaveBeenCalledWith(
      expect.any(File),
      'images',
      expect.any(Function),
      expect.objectContaining({
        imageCompression,
        appType: 'test',
        formUuid: 'test',
        fieldId: 'imgs',
        uploadPurpose: 'image',
      }),
    );
  });

  it('PC 端粘贴区域不触发文件选择并支持粘贴上传图片', async () => {
    const uploadFile = vi.fn().mockImplementation(async (file, _bucket, onProgress) => {
      onProgress?.(100);
      return {
        id: 'pasted-img',
        uid: 'pasted-img',
        name: file.name,
        previewUrl: '/pasted.png',
        url: '/pasted.png',
        size: file.size,
      };
    });
    const { ctxRef } = renderField(
      { fieldId: 'imgs', label: '图片' },
      { config: createConfig({ api: { uploadFile } }) },
    );
    const pasteZone = screen.getByTestId('imagefield-paste-zone-imgs');
    const file = new File(['img'], 'pasted.png', { type: 'image/png' });

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
        'images',
        expect.anything(),
        expect.objectContaining({
          appType: 'test',
          formUuid: 'test',
          fieldId: 'imgs',
          uploadPurpose: 'image',
        }),
      ),
    );
    await waitFor(() =>
      expect(ctxRef.current!.formData.imgs).toEqual([
        expect.objectContaining({
          id: 'pasted-img',
          name: 'pasted.png',
          status: 'done',
          percent: 100,
        }),
      ]),
    );
  });

  it('previews and deletes protected PC images', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const createFileAccessTicket = vi.fn().mockResolvedValue('/preview-ticket.png');
    const deleteFile = vi.fn().mockResolvedValue({ success: true });
    const imgs = [
      {
        id: 'i1',
        uid: 'i1',
        url: '/local.png',
        previewUrl: '/local-preview.png',
        name: '1.png',
        objectName: '1.png',
        bucketName: 'private-images',
        status: 'done',
      },
      {
        id: 'i2',
        uid: 'i2',
        name: 'loading.png',
        status: 'uploading',
        percent: 30,
      },
    ];
    const { ctxRef } = renderField(
      {
        fieldId: 'imgs',
        label: '图片',
        listType: 'picture',
      },
      {
        initialValues: { imgs },
        config: createConfig({ api: { createFileAccessTicket, deleteFile } }),
      },
    );

    fireEvent.click(screen.getByAltText('1.png'));
    await waitFor(() =>
      expect(createFileAccessTicket).toHaveBeenCalledWith(
        'private-images',
        '1.png',
        '1.png',
        'preview',
        { appType: 'test' },
      ),
    );
    expect(screen.getByRole('dialog', { name: '图片预览' })).toBeInTheDocument();
    expect(
      screen.getAllByAltText('1.png').some(node => node.getAttribute('src') === '/preview-ticket.png'),
    ).toBe(true);
    expect(openSpy).not.toHaveBeenCalled();
    expect(screen.getByText('30%')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('remove-btn-i1'));
    expect(ctxRef.current!.formData.imgs).toHaveLength(1);
    await waitFor(() => expect(deleteFile).toHaveBeenCalledWith('1.png', 'private-images'));
  });

  it('required 显示 * 标记', () => {
    renderField({ fieldId: 'imgs', label: '图片', required: true });
    expect(screen.getByText('*')).toBeInTheDocument();
  });
});

describe('ImageField - READONLY 态', () => {
  it('空值显示 "--"', () => {
    renderField({ fieldId: 'imgs', label: '图片', behavior: 'READONLY' });
    expect(screen.getByTestId('imagefield-readonly-imgs')).toHaveTextContent('--');
  });

  it('显示缩略图', () => {
    const imgs = [{ url: 'http://a.com/1.png', name: 'photo.png', id: 'i1', size: 13890 }];
    renderField(
      { fieldId: 'imgs', label: '图片', behavior: 'READONLY' },
      { initialValues: { imgs } },
    );
    expect(screen.getByTestId('imagefield-readonly-imgs')).toHaveClass('sy-readonly-files');
    expect(screen.queryByText('打包下载')).toBeNull();
    expect(screen.getByTestId('imagefield-readonly-item-i1')).toHaveClass('sy-image-file-item');
    expect(screen.getByTestId('imagefield-readonly-img-i1')).toHaveAttribute(
      'src',
      'http://a.com/1.png',
    );
    expect(screen.getByText('(14 KB)')).toBeInTheDocument();
  });

  it('readonly protected image preview uses access ticket and opens inline preview', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const createFileAccessTicket = vi.fn().mockResolvedValue({ previewUrl: '/readonly-preview.png' });
    const imgs = [
      { id: 'i1', name: 'secret.png', objectName: 'secret.png', bucketName: 'secure-images' },
    ];
    renderField(
      { fieldId: 'imgs', label: '图片', behavior: 'READONLY', readonlyClassName: 'img-ro' },
      {
        initialValues: { imgs },
        config: createConfig({ api: { createFileAccessTicket } }),
      },
    );

    fireEvent.click(screen.getByTestId('imagefield-readonly-img-i1'));
    await waitFor(() =>
      expect(createFileAccessTicket).toHaveBeenCalledWith(
        'secure-images',
        'secret.png',
        'secret.png',
        'preview',
        { appType: 'test' },
      ),
    );
    expect(screen.getByRole('dialog', { name: '图片预览' })).toBeInTheDocument();
    expect(
      screen
        .getAllByAltText('secret.png')
        .some(node => node.getAttribute('src') === '/readonly-preview.png'),
    ).toBe(true);
    expect(openSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId('imagefield-readonly-imgs')).toHaveClass('img-ro');
  });

  it('readonly mobile uses thumbnail grid without bundle download', () => {
    mockIsMobile.mockReturnValue(true);
    const imgs = [{ url: 'http://a.com/1.png', name: 'photo.png', id: 'i1' }];
    renderField(
      { fieldId: 'imgs', label: '图片', behavior: 'READONLY' },
      { initialValues: { imgs } },
    );

    expect(screen.getByTestId('imagefield-readonly-imgs')).toHaveClass('is-mobile');
    expect(screen.getByTestId('imagefield-readonly-grid-imgs')).toHaveClass('sy-mobile-image-grid');
    expect(screen.queryByText('打包下载')).toBeNull();
    expect(screen.getByText('photo.png')).toHaveClass('sy-mobile-image-name');
  });
});

describe('ImageField - HIDDEN 态', () => {
  it('不渲染任何 DOM', () => {
    renderField({ fieldId: 'imgs', label: '图片', behavior: 'HIDDEN' });
    expect(document.querySelector('[data-field-id="imgs"]')).not.toBeInTheDocument();
  });
});

describe('ImageField - DISABLED 态', () => {
  it('上传禁用', () => {
    renderField({ fieldId: 'imgs', label: '图片', behavior: 'DISABLED' });
    const input = screen.getByTestId('upload-input-imagefield-input-imgs');
    expect(input).toBeDisabled();
    const pasteZone = screen.getByTestId('imagefield-paste-zone-imgs');
    expect(pasteZone).toHaveClass('is-disabled');
    expect(pasteZone).toHaveAttribute('tabindex', '-1');
  });
});

describe('ImageField - 数据绑定', () => {
  it('从 FormProvider 接收初始值', () => {
    const imgs = [{ url: 'http://a.com/1.png', name: '1.png', id: 'i1' }];
    renderField({ fieldId: 'imgs', label: '图片' }, { initialValues: { imgs } });
    expect(screen.getByTestId('imagefield-thumb-i1')).toBeInTheDocument();
  });

  it('外部 setFieldValue 更新', () => {
    const { ctxRef } = renderField({ fieldId: 'imgs', label: '图片' });
    act(() => {
      ctxRef.current!.setFieldValue('imgs', [
        { url: 'http://b.com/x.png', name: 'x.png', id: 'x1' },
      ]);
    });
    expect(screen.getByTestId('imagefield-thumb-x1')).toBeInTheDocument();
  });

  it('defaultValue 在 mount 时设置', () => {
    const def = [{ url: 'http://a.com/d.png', name: 'd.png', id: 'd1' }];
    const { ctxRef } = renderField({ fieldId: 'imgs', label: '图片', defaultValue: def });
    expect(ctxRef.current!.formData.imgs).toEqual(def);
  });

  it('context behavior 覆盖', () => {
    const schema = createSchema({
      fields: [
        { fieldId: 'imgs', componentName: 'ImageField', label: '图片', behavior: 'DISABLED' },
      ],
    });
    renderField({ fieldId: 'imgs', label: '图片' }, { schema });
    expect(screen.getByTestId('upload-input-imagefield-input-imgs')).toBeDisabled();
  });

  it('字段不在 schema 中时默认 NORMAL', () => {
    const schema = createSchema({ fields: [] });
    renderField({ fieldId: 'imgs', label: '图片' }, { schema });
    expect(screen.getByTestId('imagefield-upload-btn-imgs')).toBeInTheDocument();
  });
});

describe('ImageField - 移动端', () => {
  it('isMobile 时渲染移动端组件', () => {
    mockIsMobile.mockReturnValue(true);
    renderField({ fieldId: 'imgs', label: '图片' });
    expect(screen.getByTestId('imagefield-mobile-imgs')).toBeInTheDocument();
    expect(screen.getByTestId('imagefield-file-input-imgs')).toHaveStyle({ display: 'none' });
    expect(screen.getByTestId('imagefield-file-input-imgs')).toHaveAttribute('aria-hidden', 'true');
  });

  it('移动端上传图片', async () => {
    mockIsMobile.mockReturnValue(true);
    const onChange = vi.fn();
    renderField({ fieldId: 'imgs', label: '图片', onChange });
    const input = screen.getByTestId('imagefield-file-input-imgs');
    const file = new File(['img'], 'mobile.png', { type: 'image/png' });
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
      await Promise.resolve();
    });
    expect(onChange).toHaveBeenCalled();
  });

  it('移动端删除图片', () => {
    mockIsMobile.mockReturnValue(true);
    const onChange = vi.fn();
    const imgs = [{ url: 'http://a.com/1.png', name: '1.png', id: 'i1' }];
    const { ctxRef } = renderField(
      { fieldId: 'imgs', label: '图片', onChange },
      { initialValues: { imgs } },
    );
    fireEvent.click(screen.getByTestId('imagefield-remove-i1'));
    expect(ctxRef.current!.formData.imgs).toEqual([]);
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('移动端 files 为 null 时不报错', () => {
    mockIsMobile.mockReturnValue(true);
    renderField({ fieldId: 'imgs', label: '图片' });
    const input = screen.getByTestId('imagefield-file-input-imgs');
    fireEvent.change(input, { target: { files: null } });
    // Should not crash - exercises if (!files) return
  });

  it('移动端 disabled', () => {
    mockIsMobile.mockReturnValue(true);
    renderField({ fieldId: 'imgs', label: '图片', behavior: 'DISABLED' });
    expect(screen.getByTestId('imagefield-file-input-imgs')).toBeDisabled();
  });

  it('移动端以三列图片网格展示缩略图和文件名', () => {
    mockIsMobile.mockReturnValue(true);
    const imgs = [{ url: 'http://a.com/photo.png', name: 'photo.png', id: 'i1', status: 'done' }];
    renderField({ fieldId: 'imgs', label: '图片' }, { initialValues: { imgs } });

    expect(screen.getByTestId('imagefield-grid-imgs')).toHaveClass('sy-mobile-image-grid');
    expect(screen.getByTestId('imagefield-thumb-i1')).toHaveClass('sy-mobile-image-card');
    expect(screen.getByText('photo.png')).toHaveClass('sy-mobile-image-name');
    expect(screen.getByTestId('imagefield-upload-btn-imgs')).toHaveClass(
      'sy-mobile-image-upload-tile',
    );
  });

  it('移动端使用组件库样式上传并在达到 maxCount 后隐藏上传按钮', async () => {
    mockIsMobile.mockReturnValue(true);
    const uploadFile = vi.fn().mockResolvedValue({
      id: 'mobile-uploaded',
      uid: 'mobile-uploaded',
      previewUrl: '/mobile-preview.png',
      name: 'mobile.png',
    });
    const { ctxRef } = renderField(
      { fieldId: 'imgs', label: '图片', maxCount: 1 },
      { config: createConfig({ api: { uploadFile } }) },
    );

    expect(screen.getByTestId('imagefield-upload-btn-imgs')).toHaveClass(
      'sy-mobile-image-upload-tile',
    );
    await act(async () => {
      fireEvent.change(screen.getByTestId('imagefield-file-input-imgs'), {
        target: { files: [new File(['img'], 'uploader.png', { type: 'image/png' })] },
      });
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(ctxRef.current!.formData.imgs).toEqual([
        expect.objectContaining({ id: 'mobile-uploaded', url: '/mobile-preview.png' }),
      ]),
    );
    expect(screen.queryByTestId('imagefield-upload-btn-imgs')).not.toBeInTheDocument();
  });

  it('移动端处理受保护图片的预览和远端删除', async () => {
    mockIsMobile.mockReturnValue(true);
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const createFileAccessTicket = vi
      .fn()
      .mockResolvedValue({ previewUrl: '/mobile-preview.png' });
    const deleteFile = vi.fn().mockResolvedValue({ success: true });
    const imgs = [
      {
        id: 'mobile-img',
        uid: 'mobile-img',
        objectName: 'mobile.png',
        bucketName: 'secure-images',
        name: 'mobile.png',
        status: 'done',
        size: 1536,
      },
      {
        id: 'local-img',
        uid: 'local-img',
        name: 'local.png',
        status: 'done',
        previewUrl: '/local-preview.png',
        downloadUrl: '/local-download.png',
      },
      {
        id: 'broken-img',
        uid: 'broken-img',
        name: 'broken.png',
        status: 'error',
      },
    ];
    const { ctxRef } = renderField(
      { fieldId: 'imgs', label: '图片' },
      {
        initialValues: { imgs },
        config: createConfig({
          api: { createFileAccessTicket, deleteFile },
        }),
      },
    );

    expect(screen.getByText('上传失败')).toBeInTheDocument();

    fireEvent.click(document.querySelectorAll('.sy-image-preview')[0] as HTMLElement);
    await waitFor(() =>
      expect(createFileAccessTicket).toHaveBeenCalledWith(
        'secure-images',
        'mobile.png',
        'mobile.png',
        'preview',
        { appType: 'test' },
      ),
    );
    expect(screen.getByRole('dialog', { name: '图片预览' })).toBeInTheDocument();
    expect(
      screen
        .getAllByAltText('mobile.png')
        .some(node => node.getAttribute('src') === '/mobile-preview.png'),
    ).toBe(true);
    expect(openSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('关闭图片预览'));
    fireEvent.click(document.querySelectorAll('.sy-image-preview')[1] as HTMLElement);
    expect(await screen.findByRole('dialog', { name: '图片预览' })).toBeInTheDocument();
    expect(
      screen
        .getAllByAltText('local.png')
        .some(node => node.getAttribute('src') === '/local-preview.png'),
    ).toBe(true);
    expect(openSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('imagefield-remove-mobile-img'));
    expect(ctxRef.current!.formData.imgs).toHaveLength(2);
    await waitFor(() => expect(deleteFile).toHaveBeenCalledWith('mobile.png', 'secure-images'));
  });

  it('移动端上传覆盖图片扩展名识别、进度和失败提示', async () => {
    mockIsMobile.mockReturnValue(true);
    const uploadFile = vi
      .fn()
      .mockImplementationOnce(async (_file, _bucket, onProgress) => {
        onProgress?.(42);
        return {
          objectName: 'camera.PNG',
          bucketName: 'images',
          name: 'camera.PNG',
          url: '/camera.png',
          size: 321,
        };
      })
      .mockRejectedValueOnce(new Error('mobile image failed'));
    const onChange = vi.fn();
    const { ctxRef } = renderField(
      { fieldId: 'imgs', label: '图片', onChange, multiple: false },
      { config: createConfig({ api: { uploadFile } }) },
    );
    const input = screen.getByTestId('imagefield-file-input-imgs');

    await act(async () => {
      fireEvent.change(input, {
        target: { files: [new File(['img'], 'camera.PNG', { type: '' })] },
      });
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(ctxRef.current!.formData.imgs).toEqual([
        expect.objectContaining({
          objectName: 'camera.PNG',
          status: 'done',
          percent: 100,
          previewUrl: '/camera.png',
        }),
      ]),
    );

    await act(async () => {
      fireEvent.change(input, {
        target: { files: [new File(['img'], 'fail.png', { type: 'image/png' })] },
      });
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(ctxRef.current!.formData.imgs).toEqual([
        expect.objectContaining({ status: 'error', error: 'mobile image failed' }),
      ]),
    );
    fireEvent.error(screen.getByAltText('fail.png'));
    expect(screen.getByText('mobile image failed')).toBeInTheDocument();
    expect(onChange).toHaveBeenCalled();
  });

  it('移动端忽略无效图片和达到 maxCount 后的选择', async () => {
    mockIsMobile.mockReturnValue(true);
    const onChange = vi.fn();
    renderField(
      { fieldId: 'imgs', label: '图片', onChange, maxCount: 1, maxSize: 1 },
      {
        initialValues: {
          imgs: [{ id: 'existing', uid: 'existing', name: 'existing.png', status: 'done' }],
        },
      },
    );
    const input = screen.getByTestId('imagefield-file-input-imgs');

    await act(async () => {
      fireEvent.change(input, {
        target: { files: [new File(['txt'], 'bad.txt', { type: 'text/plain' })] },
      });
      await Promise.resolve();
    });
    const bigFile = new File(['img'], 'big.png', { type: 'image/png' });
    Object.defineProperty(bigFile, 'size', { value: 2 * 1024 * 1024 });
    await act(async () => {
      fireEvent.change(input, { target: { files: [bigFile] } });
      await Promise.resolve();
    });
    expect(onChange).not.toHaveBeenCalled();
  });
});

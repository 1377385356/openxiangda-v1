import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FilePreviewContent } from './FilePreviewContent';

const renderAsync = vi.fn().mockResolvedValue(undefined);
const readWorkbook = vi.fn(() => ({
  SheetNames: ['Summary'],
  Sheets: { Summary: {} },
}));
const sheetToJson = vi.fn(() => [['Name', 'Value'], ['Contract', 'Ready']]);
const convertHeic = vi.fn(async () => new Blob(['jpeg'], { type: 'image/jpeg' }));
const createObjectUrl = vi.fn(() => 'blob:converted-heic');

vi.mock('docx-preview', () => ({ renderAsync }));
vi.mock('xlsx', () => ({
  read: readWorkbook,
  utils: { sheet_to_json: sheetToJson },
}));
vi.mock('heic2any', () => ({ default: convertHeic }));

Object.defineProperty(URL, 'createObjectURL', {
  configurable: true,
  value: createObjectUrl,
});
Object.defineProperty(URL, 'revokeObjectURL', {
  configurable: true,
  value: vi.fn(),
});
vi.stubGlobal(
  'ResizeObserver',
  class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);
Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

describe('FilePreviewContent', () => {
  it('renders platform-transcoded images and inline video', () => {
    const request = vi.fn();
    const { rerender } = render(
      <FilePreviewContent
        metadata={{
          fileName: 'scan.tiff',
          previewType: 'image',
          renderMode: 'image-transcode',
          imagePreviewUrl: '/file/image-preview/T',
        }}
        request={request}
      />,
    );

    expect(screen.getByRole('img', { name: 'scan.tiff' })).toHaveAttribute(
      'src',
      '/service/file/image-preview/T',
    );

    rerender(
      <FilePreviewContent
        metadata={{
          fileName: 'demo.mp4',
          previewType: 'video',
          renderMode: 'inline',
          previewUrl: '/file/preview-by-ticket/V',
        }}
        request={request}
      />,
    );

    expect(document.querySelector('video')).toHaveAttribute(
      'src',
      '/service/file/preview-by-ticket/V',
    );
  });

  it.each([
    ['Blob', (source: Blob) => source],
    ['PageBinaryResponse', (source: Blob) => ({ blob: source, contentType: source.type })],
    ['Axios binary response', (source: Blob) => ({ data: source })],
  ])('loads DOCX through the ticketed binary stream from %s', async (_kind, responseOf) => {
    const source = new Blob(['docx'], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    const request = vi.fn().mockResolvedValue(responseOf(source));

    render(
      <FilePreviewContent
        metadata={{
          fileName: 'contract.docx',
          previewType: 'office',
          renderMode: 'docx-html',
          previewUrl: '/file/preview-by-ticket/D',
        }}
        request={request}
      />,
    );

    await waitFor(() => expect(renderAsync).toHaveBeenCalled());
    expect(request).toHaveBeenCalledWith({
      url: '/service/file/preview-by-ticket/D',
      method: 'get',
      responseType: 'blob',
    });
    expect(renderAsync.mock.calls.at(-1)?.[0]).toBe(source);
  });

  it('decodes a base64-wrapped DOCX blob before rendering', async () => {
    const bytes = new Uint8Array([
      0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x08, 0x00,
    ]);
    const binary = Array.from(bytes, value => String.fromCharCode(value)).join('');
    const wrapped = new Blob([btoa(binary)], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    const request = vi.fn().mockResolvedValue({ blob: wrapped });

    render(
      <FilePreviewContent
        metadata={{
          fileName: 'legacy.docx',
          previewType: 'office',
          renderMode: 'docx-html',
          previewUrl: '/file/preview-by-ticket/BASE64',
        }}
        request={request}
      />,
    );

    await waitFor(() => expect(renderAsync).toHaveBeenCalled());
    const rendered = renderAsync.mock.calls.at(-1)?.[0] as Blob;
    expect(Array.from(new Uint8Array(await rendered.arrayBuffer()))).toEqual(
      Array.from(bytes),
    );
  });

  it('loads XLSX from a nested PageSdk binary response', async () => {
    const source = new Blob(['xlsx'], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const request = vi.fn().mockResolvedValue({ data: { blob: source } });

    render(
      <FilePreviewContent
        metadata={{
          fileName: 'contracts.xlsx',
          previewType: 'office',
          renderMode: 'excel-client',
          previewUrl: '/file/preview-by-ticket/X',
        }}
        request={request}
      />,
    );

    expect(await screen.findByText('Summary')).toBeInTheDocument();
    expect(await screen.findByText('Contract')).toBeInTheDocument();
    expect(readWorkbook).toHaveBeenCalled();
    expect(request).toHaveBeenCalledWith({
      url: '/service/file/preview-by-ticket/X',
      method: 'get',
      responseType: 'blob',
    });
  });

  it('loads HEIC from a PageSdk binary response before conversion', async () => {
    const source = new Blob(['heic'], { type: 'image/heic' });
    const request = vi.fn().mockResolvedValue({ blob: source });

    render(
      <FilePreviewContent
        metadata={{
          fileName: 'site.heic',
          previewType: 'image',
          renderMode: 'image-heic',
          previewUrl: '/file/preview-by-ticket/H',
        }}
        request={request}
      />,
    );

    expect(await screen.findByRole('img', { name: 'site.heic' })).toHaveAttribute(
      'src',
      'blob:converted-heic',
    );
    expect(convertHeic).toHaveBeenCalledWith({
      blob: source,
      toType: 'image/jpeg',
      quality: 0.92,
    });
  });

  it('shows the authoritative unsupported reason', () => {
    render(
      <FilePreviewContent
        metadata={{
          fileName: 'archive.zip',
          renderMode: 'download',
          canPreview: false,
          unsupportedReason: '当前文件类型没有可用的在线预览器',
        }}
        request={vi.fn()}
      />,
    );

    expect(screen.getByText('当前文件类型没有可用的在线预览器')).toBeInTheDocument();
  });
});

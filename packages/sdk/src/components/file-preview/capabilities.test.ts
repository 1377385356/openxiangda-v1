import { describe, expect, it } from 'vitest';
import {
  normalizePreviewBlobContent,
  normalizePreviewBlobResponse,
} from './capabilities';

describe('normalizePreviewBlobResponse', () => {
  it('keeps the server error when a binary request returns JSON', () => {
    expect(() =>
      normalizePreviewBlobResponse({
        code: 401,
        success: false,
        message: '文件票据已过期',
      }),
    ).toThrow('文件票据已过期');
  });

  it('unwraps nested PageSdk binary responses', () => {
    const blob = new Blob(['binary']);
    expect(normalizePreviewBlobResponse({ data: { blob } })).toBe(blob);
  });

  it('decodes legacy base64-wrapped ZIP blobs into Office binary bytes', async () => {
    const bytes = new Uint8Array([
      0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x08, 0x00,
    ]);
    const binary = Array.from(bytes, value => String.fromCharCode(value)).join('');
    const wrapped = new Blob([btoa(binary)], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });

    const normalized = await normalizePreviewBlobContent({ blob: wrapped });

    expect(Array.from(new Uint8Array(await normalized.arrayBuffer()))).toEqual(
      Array.from(bytes),
    );
    expect(normalized.type).toBe(wrapped.type);
  });

  it('surfaces JSON errors returned through a blob response', async () => {
    const response = new Blob(
      [JSON.stringify({ code: 410, message: '文件访问票据不存在或已过期' })],
      { type: 'application/json' },
    );

    await expect(normalizePreviewBlobContent(response)).rejects.toThrow(
      '文件访问票据不存在或已过期',
    );
  });
});

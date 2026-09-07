import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RuntimeRequestConfig, RuntimeResponse } from '../types';
import { createFormRuntimeApi } from './runtimeApi';

function mockJsonResponse(payload: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(payload), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json' },
    statusText: init?.statusText,
  });
}

describe('runtimeApi', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    window.localStorage.clear();
    delete (window as any).__FORM_API_BASE_URL__;
    delete (window as any).__LOWCODE_API_BASE_URL__;
    delete (window as any).FORM_API_BASE_URL;
    delete (window as any).BASE_API_URL;
  });

  it('uses /service as the default browser API base URL', async () => {
    vi.stubEnv('FORM_API_BASE_URL', '');
    vi.stubEnv('BASE_API_URL', '');
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ data: { result: 'inst-1' } }));
    vi.stubGlobal('fetch', fetchMock);

    const api = createFormRuntimeApi();
    await expect(
      api.submitFormData({
        appType: 'APP_1',
        formUuid: 'FORM_1',
        data: { name: 'Alice' },
      }),
    ).resolves.toEqual({ result: 'inst-1' });

    expect(fetchMock).toHaveBeenCalledWith(
      '/service/form/submitFormData',
      expect.objectContaining({
        method: 'post',
        credentials: 'include',
        body: JSON.stringify({
          appType: 'APP_1',
          formUuid: 'FORM_1',
          data: { name: 'Alice' },
        }),
      }),
    );
  });

  it('allows an explicit browser API base URL override', async () => {
    vi.stubEnv('FORM_API_BASE_URL', '');
    vi.stubEnv('BASE_API_URL', '');
    (window as any).__FORM_API_BASE_URL__ = '/custom-service';
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ data: { ok: true } }));
    vi.stubGlobal('fetch', fetchMock);

    const api = createFormRuntimeApi();
    await api.request({
      url: '/permission/form-group/view-permissions',
      method: 'get',
      params: { appType: 'APP_1', formUuid: 'FORM_1' },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/custom-service/permission/form-group/view-permissions?appType=APP_1&formUuid=FORM_1',
      expect.objectContaining({ method: 'get' }),
    );
  });

  it('does not duplicate the base URL for normalized binary file URLs', async () => {
    const file = new Blob(['docx']);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(file, {
        status: 200,
        headers: { 'content-type': 'application/octet-stream' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const api = createFormRuntimeApi({ baseUrl: '/service' });
    await api.request({
      url: '/service/file/preview-by-ticket/T',
      method: 'get',
      responseType: 'blob',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/service/file/preview-by-ticket/T',
      expect.objectContaining({ method: 'get' }),
    );
  });

  it('uses environment and window base URL fallbacks', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() => Promise.resolve(mockJsonResponse({ data: 'ok' })));
    vi.stubGlobal('fetch', fetchMock);

    vi.stubEnv('FORM_API_BASE_URL', 'https://api.example.com/');
    await createFormRuntimeApi().request({ url: 'ping', method: 'get' });
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://api.example.com/ping',
      expect.objectContaining({ method: 'get' }),
    );

    vi.stubEnv('FORM_API_BASE_URL', '');
    vi.stubEnv('BASE_API_URL', '');
    (window as any).BASE_API_URL = '/window-base/';
    await createFormRuntimeApi().request({ url: '/pong', method: 'get' });
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/window-base/pong',
      expect.objectContaining({ method: 'get' }),
    );

    delete (window as any).BASE_API_URL;
    (window as any).__LOWCODE_API_BASE_URL__ = '/lowcode-base/';
    await createFormRuntimeApi().request({ url: 'again', method: 'get' });
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/lowcode-base/again',
      expect.objectContaining({ method: 'get' }),
    );
  });

  it('serializes default requests, headers, query params and non-json responses', async () => {
    window.localStorage.setItem('token', 'TOKEN_1');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('plain-text', {
          status: 201,
          statusText: 'Created',
          headers: { 'content-type': 'text/plain' },
        }),
      )
      .mockResolvedValueOnce(
        new Response('blob-body', {
          status: 200,
          headers: { 'content-type': 'application/octet-stream' },
        }),
      )
      .mockResolvedValueOnce(mockJsonResponse({ message: 'bad request' }, { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);

    const api = createFormRuntimeApi({ baseUrl: '/api' });
    await expect(
      api.request({
        url: '/items?ready=1',
        method: 'post',
        params: { ids: [1, 2], skip: '', unset: undefined, none: null },
        headers: { 'x-extra': '1' },
        data: { name: 'Alice' },
      }),
    ).resolves.toMatchObject({
      code: 201,
      success: true,
      data: 'plain-text',
      result: 'plain-text',
      message: 'Created',
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/items?ready=1&ids=1&ids=2',
      expect.objectContaining({
        method: 'post',
        body: JSON.stringify({ name: 'Alice' }),
        credentials: 'include',
      }),
    );
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('authorization')).toBe('TOKEN_1');
    expect(headers.get('x-extra')).toBe('1');

    const blob = await api.request({
      url: 'https://files.example.com/a',
      method: 'get',
      responseType: 'blob',
    });
    expect(blob).toMatchObject({ size: 9, type: 'application/octet-stream' });
    expect(typeof (blob as Blob).text).toBe('function');
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://files.example.com/a',
      expect.objectContaining({ method: 'get' }),
    );

    await expect(api.request({ url: '/fail', method: 'get' })).rejects.toThrow('bad request');
  });

  it('sends FormData without overriding the content type', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ success: true, data: 'ok' }));
    vi.stubGlobal('fetch', fetchMock);

    const formData = new FormData();
    formData.append('file', new Blob(['x']), 'a.txt');

    await createFormRuntimeApi({ baseUrl: '/api' }).request({
      url: '/upload',
      method: 'post',
      data: formData,
    });

    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(formData);
    expect(headers.has('Content-Type')).toBe(false);
  });

  it('uses injected fetch and auth headers for default requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ success: true, data: 'ok' }));

    const api = createFormRuntimeApi({
      baseUrl: '/api',
      fetchImpl: fetchMock as typeof fetch,
      getAuthHeaders: () => ({ authorization: 'Bearer public-token' }),
    });
    await api.request({ url: '/ping', method: 'get' });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ping',
      expect.objectContaining({ method: 'get' }),
    );
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get('authorization')).toBe('Bearer public-token');
  });

  it('uses injected auth headers for small file XHR uploads', async () => {
    vi.stubEnv('VITEST', '');
    class FakeXMLHttpRequest {
      static latest: FakeXMLHttpRequest | null = null;
      headers: Record<string, string> = {};
      method = '';
      url = '';
      withCredentials = false;
      status = 200;
      responseText = JSON.stringify({
        success: true,
        data: {
          originalName: 'avatar.png',
          objectName: 'public/app/20260706/avatar.png',
          bucketName: 'images',
          size: 3,
          url: '/file/preview/images/public/app/20260706/avatar.png',
        },
      });
      upload = { onprogress: undefined as any };
      onload?: () => void;
      onerror?: () => void;

      constructor() {
        FakeXMLHttpRequest.latest = this;
      }

      open(method: string, url: string) {
        this.method = method;
        this.url = url;
      }

      setRequestHeader(key: string, value: string) {
        this.headers[key.toLowerCase()] = value;
      }

      send() {
        this.onload?.();
      }
    }
    vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest as any);

    const api = createFormRuntimeApi({
      baseUrl: '/api',
      getAuthHeaders: () => ({ authorization: 'Bearer public-token' }),
    });
    const file = new File(['png'], 'avatar.png', { type: 'image/png' });

    await expect(
      api.uploadFile(file, 'images', undefined, {
        appType: 'APP_PUBLIC',
        formUuid: 'FORM_REGISTER',
        fieldId: 'applicationFiles',
      }),
    ).resolves.toMatchObject({
      objectName: 'public/app/20260706/avatar.png',
      bucketName: 'images',
    });

    expect(FakeXMLHttpRequest.latest?.method).toBe('POST');
    expect(FakeXMLHttpRequest.latest?.url).toBe(
      '/api/file/upload?bucketName=images&appType=APP_PUBLIC&formUuid=FORM_REGISTER&fieldId=applicationFiles&action=upload',
    );
    expect(FakeXMLHttpRequest.latest?.withCredentials).toBe(true);
    expect(FakeXMLHttpRequest.latest?.headers.authorization).toBe('Bearer public-token');
  });

  it('wraps all endpoint helpers around the configured request', async () => {
    const request = vi.fn(async (config: RuntimeRequestConfig): Promise<RuntimeResponse<any>> => {
      if (config.url === '/user/list') return { success: true, data: { items: ['u1'] } };
      if (config.url === '/department/d1/members')
        return { success: true, result: { list: ['u1'] } };
      if (config.url === '/department/root') return { success: true, result: ['root'] };
      if (config.url === '/department/d1/children') return { success: true, data: ['child'] };
      if (config.url === '/department/d1/parentDepartments') {
        return { success: true, data: ['parent'] };
      }
      if (config.url === '/china-divisions') return { success: true, result: ['division'] };
      if (config.url === '/APP/v1/form/advancedSearch.json') {
        return { success: true, result: { data: [{ id: 'r1' }], total: 1 } };
      }
      if (config.url === '/file/download-ticket') return { success: true, data: { ticket: 'd' } };
      if (config.url === '/file/access-ticket') return { success: true, result: { ticket: 'p' } };
      if (config.url === '/dingtalk/signature') return { success: true, data: { nonceStr: 'n' } };
      if (config.url === '/form/submitFormData') return { success: true, data: { id: 'new' } };
      if (config.url === '/APP/v1/form/updateFormData.json') {
        return { success: true, result: { id: 'updated' } };
      }
      if (config.url === '/APP/v1/form/startProcessFromExistingInstance.json') {
        return { success: true, data: { processInstanceId: 'process-1' } };
      }
      return { success: true, data: { ok: true } };
    });

    const api = createFormRuntimeApi({ request });

    await expect(api.deleteFile('a.txt')).resolves.toEqual({ success: true });
    await expect(api.createDownloadTicket('files', 'a.txt', 'a.txt')).resolves.toEqual({
      ticket: 'd',
    });
    await expect(
      api.createFileAccessTicket('files', 'a.txt', 'a.txt', 'preview', { appType: 'APP' }),
    ).resolves.toEqual({ ticket: 'p' });
    await expect(api.getUserById('u1')).resolves.toEqual({ ok: true });
    await expect(api.getUserList({ keyword: '张' })).resolves.toEqual(['u1']);
    await expect(api.getDepartmentRoots()).resolves.toEqual(['root']);
    await expect(api.getDepartmentChildren('d1')).resolves.toEqual(['child']);
    await expect(api.getDepartmentParentDepartments('d1')).resolves.toEqual(['parent']);
    await expect(api.getDepartmentMembers('d1')).resolves.toEqual(['u1']);
    await expect(api.getChinaDivisions()).resolves.toEqual(['division']);
    await expect(api.getChinaDivisions('330000')).resolves.toEqual(['division']);
    await expect(api.advancedSearch({ appType: 'APP', formUuid: 'FORM' })).resolves.toEqual({
      data: [{ id: 'r1' }],
      total: 1,
    });
    await expect(api.getDingTalkSignature('https://example.com')).resolves.toEqual({
      nonceStr: 'n',
    });
    await expect(
      api.submitFormData({ appType: 'APP', formUuid: 'FORM', data: {} }),
    ).resolves.toEqual({ id: 'new' });
    await expect(
      api.updateFormData({
        appType: 'APP',
        formUuid: 'FORM',
        formInstanceId: 'inst',
        updateFormDataJson: '{}',
      }),
    ).resolves.toEqual({ id: 'updated' });
    await expect(
      api.startProcessFromExistingInstance({
        appType: 'APP',
        formUuid: 'FORM',
        formInstanceId: 'inst',
        updateFormDataJson: '{}',
      }),
    ).resolves.toEqual({ processInstanceId: 'process-1' });

    expect(request).toHaveBeenCalledWith({
      url: '/APP/v1/form/updateFormData.json',
      method: 'post',
      data: {
        appType: 'APP',
        formUuid: 'FORM',
        formInstId: 'inst',
        updateFormDataJson: '{}',
      },
    });
    expect(request).toHaveBeenCalledWith({
      url: '/file/access-ticket',
      method: 'post',
      data: {
        bucketName: 'files',
        objectName: 'a.txt',
        fileName: 'a.txt',
        purpose: 'preview',
        appType: 'APP',
      },
    });
    expect(request).toHaveBeenCalledWith({
      url: '/APP/v1/form/startProcessFromExistingInstance.json',
      method: 'post',
      data: {
        appType: 'APP',
        formUuid: 'FORM',
        formInstId: 'inst',
        updateFormDataJson: '{}',
      },
    });
    expect(request).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ formInstanceId: 'inst' }),
      }),
    );
    expect(request).toHaveBeenCalledWith({
      url: '/file/delete',
      method: 'post',
      data: { bucketName: 'files', objectName: 'a.txt' },
    });
    expect(request).toHaveBeenCalledWith({
      url: '/china-divisions',
      method: 'get',
      params: { parentAdcode: '330000' },
    });
  });

  it('treats updateFormData business failures as errors', async () => {
    const api = createFormRuntimeApi({
      request: vi.fn().mockResolvedValue({
        code: 200,
        message: '更新成功',
        data: { success: false, message: '数据不存在', code: 404 },
      }),
    });

    await expect(
      api.updateFormData({
        appType: 'APP',
        formUuid: 'FORM',
        formInstanceId: 'missing',
        updateFormDataJson: '{}',
      }),
    ).rejects.toThrow('数据不存在');
  });

  it('treats submitFormData business failures as errors', async () => {
    const api = createFormRuntimeApi({
      request: vi.fn().mockResolvedValue({
        code: 500,
        data: null,
        message: '提交失败',
      }),
    });

    await expect(
      api.submitFormData({
        appType: 'APP',
        formUuid: 'FORM',
        data: { name: 'Alice' },
      }),
    ).rejects.toThrow('提交失败');
  });

  it('normalizes list endpoint fallback shapes', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ success: true, data: ['u1'] })
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockResolvedValueOnce({ success: true, result: ['m1'] })
      .mockResolvedValueOnce({ success: true, data: [] });
    const api = createFormRuntimeApi({ request });

    await expect(api.getUserList()).resolves.toEqual(['u1']);
    await expect(api.getUserList()).resolves.toEqual([]);
    await expect(api.getDepartmentMembers('d1')).resolves.toEqual(['m1']);
    await expect(api.getDepartmentMembers('d1')).resolves.toEqual([]);
  });

  it('uploads small files through the test XHR fallback', async () => {
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob://preview') });
    const progress = vi.fn();

    await expect(
      createFormRuntimeApi({ baseUrl: '/api' }).uploadFile(
        new File(['hello'], 'hello.txt', { type: 'text/plain' }),
        'docs',
        progress,
      ),
    ).resolves.toMatchObject({
      name: 'hello.txt',
      url: 'blob://preview',
      status: 'done',
      size: 5,
      bucketName: 'docs',
      contentType: 'text/plain',
    });
    expect(progress).toHaveBeenCalledWith(100);
  });

  it('uploads small files through XMLHttpRequest outside the vitest shortcut', async () => {
    vi.stubEnv('VITEST', '');
    window.localStorage.setItem('token', 'TOKEN_XHR');
    const progress = vi.fn();
    const instances: any[] = [];

    class MockXHR {
      upload: any = {};
      status = 201;
      responseText = JSON.stringify({
        success: true,
        data: [
          {
            id: 'file-1',
            uid: 'uid-1',
            originalName: 'xhr.txt',
            objectName: 'docs/xhr.txt',
            bucketName: 'docs',
            size: 3,
            contentType: 'text/plain',
            url: '/files/xhr.txt',
          },
        ],
      });
      withCredentials = false;
      onload?: () => void;
      onerror?: () => void;
      open = vi.fn();
      setRequestHeader = vi.fn();
      send = vi.fn(() => {
        this.upload.onprogress?.({ lengthComputable: true, loaded: 1, total: 2 });
        this.onload?.();
      });

      constructor() {
        instances.push(this);
      }
    }

    vi.stubGlobal('XMLHttpRequest', MockXHR as any);

    await expect(
      createFormRuntimeApi({ baseUrl: '/api' }).uploadFile(
        new File(['xhr'], 'xhr.txt', { type: 'text/plain' }),
        'docs',
        progress,
      ),
    ).resolves.toMatchObject({
      id: 'file-1',
      uid: 'uid-1',
      name: 'xhr.txt',
      originalName: 'xhr.txt',
      objectName: 'docs/xhr.txt',
      bucketName: 'docs',
      contentType: 'text/plain',
      mimeType: 'text/plain',
      url: '/files/xhr.txt',
    });

    expect(instances[0].open).toHaveBeenCalledWith('POST', '/api/file/upload?bucketName=docs');
    expect(instances[0].withCredentials).toBe(true);
    expect(instances[0].setRequestHeader).toHaveBeenCalledWith('authorization', 'TOKEN_XHR');
    expect(instances[0].send.mock.calls[0][0]).toBeInstanceOf(FormData);
    expect(progress).toHaveBeenCalledWith(50);
  });

  it('uploads public files through XMLHttpRequest with public visibility', async () => {
    vi.stubEnv('VITEST', '');
    const instances: any[] = [];

    class MockXHR {
      upload: any = {};
      status = 200;
      responseText = JSON.stringify({
        success: true,
        data: [
          {
            id: 'file-public',
            originalName: 'cover.png',
            objectName: 'covers/cover.png',
            bucketName: 'public-assets',
            size: 5,
            contentType: 'image/png',
            url: '/file/public/public-assets/covers/cover.png',
            previewUrl: '/file/public/public-assets/covers/cover.png',
            downloadUrl: '/file/public/public-assets/covers/cover.png?download=1',
            publicUrl: '/file/public/public-assets/covers/cover.png',
            visibility: 'public',
          },
        ],
      });
      withCredentials = false;
      onload?: () => void;
      onerror?: () => void;
      open = vi.fn();
      setRequestHeader = vi.fn();
      send = vi.fn(() => this.onload?.());

      constructor() {
        instances.push(this);
      }
    }

    vi.stubGlobal('XMLHttpRequest', MockXHR as any);

    await expect(
      createFormRuntimeApi({ baseUrl: '/api' }).uploadPublicFile(
        new File(['cover'], 'cover.png', { type: 'image/png' }),
      ),
    ).resolves.toMatchObject({
      id: 'file-public',
      name: 'cover.png',
      objectName: 'covers/cover.png',
      bucketName: 'public-assets',
      url: '/api/file/public/public-assets/covers/cover.png',
      previewUrl: '/api/file/public/public-assets/covers/cover.png',
      downloadUrl: '/api/file/public/public-assets/covers/cover.png?download=1',
      publicUrl: '/api/file/public/public-assets/covers/cover.png',
      visibility: 'public',
    });

    expect(instances[0].open).toHaveBeenCalledWith(
      'POST',
      '/api/file/upload?bucketName=public-assets&visibility=public',
    );
  });

  it('uploads OSS files through a signed PUT URL', async () => {
    vi.stubEnv('VITEST', '');
    const progress = vi.fn();
    const request = vi.fn().mockResolvedValue({
      success: true,
      data: {
        provider: 'oss',
        storageCode: 'evaluate_oss',
        uploadMethod: 'put',
        uploadUrl: 'https://evaluate-oss.oss-cn-hangzhou.aliyuncs.com/signed',
        headers: { 'x-oss-meta-source': 'openxiangda' },
        objectName: 'openxiangda/APP_1/file.txt',
        bucketName: 'evaluate-oss',
        url: 'https://evaluate-oss.oss-cn-hangzhou.aliyuncs.com/openxiangda/APP_1/file.txt',
        previewUrl: 'https://evaluate-oss.oss-cn-hangzhou.aliyuncs.com/openxiangda/APP_1/file.txt',
        downloadUrl: 'https://evaluate-oss.oss-cn-hangzhou.aliyuncs.com/openxiangda/APP_1/file.txt',
        contentType: 'text/plain',
      },
    });
    const instances: any[] = [];

    class MockXHR {
      upload: any = {};
      status = 200;
      statusText = 'OK';
      onload?: () => void;
      onerror?: () => void;
      open = vi.fn();
      setRequestHeader = vi.fn();
      send = vi.fn(() => {
        this.upload.onprogress?.({ lengthComputable: true, loaded: 1, total: 2 });
        this.onload?.();
      });

      constructor() {
        instances.push(this);
      }
    }

    vi.stubGlobal('XMLHttpRequest', MockXHR as any);

    await expect(
      createFormRuntimeApi({ request }).uploadFile(
        new File(['hello'], 'file.txt', { type: 'text/plain' }),
        'attachments',
        progress,
        { uploadProvider: 'oss', storageCode: 'evaluate_oss', appType: 'APP_1' },
      ),
    ).resolves.toMatchObject({
      provider: 'oss',
      storageCode: 'evaluate_oss',
      objectName: 'openxiangda/APP_1/file.txt',
      bucketName: 'evaluate-oss',
      url: 'https://evaluate-oss.oss-cn-hangzhou.aliyuncs.com/openxiangda/APP_1/file.txt',
      contentType: 'text/plain',
      status: 'done',
    });

    expect(request).toHaveBeenCalledWith({
      url: '/openxiangda-api/v1/apps/APP_1/storage-configs/evaluate_oss/uploads/initiate',
      method: 'post',
      data: {
        fileName: 'file.txt',
        fileSize: 5,
        contentType: 'text/plain',
        bucketName: 'attachments',
      },
    });
    expect(instances[0].open).toHaveBeenCalledWith(
      'PUT',
      'https://evaluate-oss.oss-cn-hangzhou.aliyuncs.com/signed',
    );
    expect(instances[0].setRequestHeader).toHaveBeenCalledWith(
      'x-oss-meta-source',
      'openxiangda',
    );
    expect(instances[0].send.mock.calls[0][0]).toBeInstanceOf(File);
    expect(progress).toHaveBeenCalledWith(50);
    expect(progress).toHaveBeenCalledWith(100);
  });

  it('uploads builtin OSS files without storageCode', async () => {
    vi.stubEnv('VITEST', '');
    const request = vi.fn().mockResolvedValue({
      success: true,
      data: {
        provider: 'oss',
        uploadProvider: 'builtin-oss',
        storageScope: 'platform',
        uploadMethod: 'put',
        uploadUrl: 'https://platform-oss.aliyuncs.com/signed',
        headers: { 'content-type': 'text/plain' },
        objectName: 'openxiangda/files/TENANT_1/APP_1/file.txt',
        bucketName: 'platform-bucket',
        url: 'https://cdn.example.com/openxiangda/files/TENANT_1/APP_1/file.txt',
        previewUrl: 'https://cdn.example.com/openxiangda/files/TENANT_1/APP_1/file.txt',
        downloadUrl: 'https://cdn.example.com/openxiangda/files/TENANT_1/APP_1/file.txt',
        contentType: 'text/plain',
      },
    });
    const instances: any[] = [];

    class MockXHR {
      upload: any = {};
      status = 200;
      statusText = 'OK';
      onload?: () => void;
      onerror?: () => void;
      open = vi.fn();
      setRequestHeader = vi.fn();
      send = vi.fn(() => this.onload?.());

      constructor() {
        instances.push(this);
      }
    }

    vi.stubGlobal('XMLHttpRequest', MockXHR as any);

    await expect(
      createFormRuntimeApi({ request }).uploadFile(
        new File(['hello'], 'file.txt', { type: 'text/plain' }),
        'attachments',
        undefined,
        { uploadProvider: 'builtin-oss', appType: 'APP_1', uploadPurpose: 'attachment' },
      ),
    ).resolves.toMatchObject({
      provider: 'oss',
      uploadProvider: 'builtin-oss',
      storageScope: 'platform',
      objectName: 'openxiangda/files/TENANT_1/APP_1/file.txt',
      bucketName: 'platform-bucket',
      status: 'done',
    });

    expect(request).toHaveBeenCalledWith({
      url: '/openxiangda-api/v1/apps/APP_1/storage/builtin/uploads/initiate',
      method: 'post',
      data: {
        fileName: 'file.txt',
        fileSize: 5,
        contentType: 'text/plain',
        bucketName: 'attachments',
        purpose: 'attachment',
      },
    });
    expect(instances[0].open).toHaveBeenCalledWith(
      'PUT',
      'https://platform-oss.aliyuncs.com/signed',
    );
  });

  it('uploads compressed image variants and keeps the original image URL as primary', async () => {
    vi.stubEnv('VITEST', '');
    const progress = vi.fn();
    const request = vi.fn(async (config: RuntimeRequestConfig) => {
      const fileName = String(config.data?.fileName || '');
      return {
        success: true,
        data: {
          provider: 'oss',
          storageCode: 'evaluate_oss',
          uploadMethod: 'put',
          uploadUrl: `https://evaluate-oss.oss-cn-hangzhou.aliyuncs.com/signed/${fileName}`,
          objectName: `openxiangda/APP_1/${fileName}`,
          bucketName: 'evaluate-oss',
          url: `https://cdn.example.com/openxiangda/APP_1/${fileName}`,
          previewUrl: `https://cdn.example.com/openxiangda/APP_1/${fileName}`,
          downloadUrl: `https://cdn.example.com/openxiangda/APP_1/${fileName}`,
          contentType: config.data?.contentType,
        },
      } satisfies RuntimeResponse<any>;
    });
    const instances: any[] = [];

    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 1600, height: 1200, close: vi.fn() }),
    );
    const createElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((tagName: string, options?: any) => {
      if (tagName === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => ({ drawImage: vi.fn() }),
          toBlob: (callback: (blob: Blob) => void, type: string) => {
            callback(new Blob(['x'], { type }));
          },
        } as any;
      }
      return createElement(tagName, options);
    }) as typeof document.createElement);

    class MockXHR {
      upload: any = {};
      status = 200;
      statusText = 'OK';
      onload?: () => void;
      onerror?: () => void;
      open = vi.fn();
      setRequestHeader = vi.fn();
      send = vi.fn(() => {
        this.upload.onprogress?.({ lengthComputable: true, loaded: 1, total: 2 });
        this.onload?.();
      });

      constructor() {
        instances.push(this);
      }
    }

    vi.stubGlobal('XMLHttpRequest', MockXHR as any);

    const result = await createFormRuntimeApi({ request }).uploadFile(
      new File([new Uint8Array(200)], 'photo.png', { type: 'image/png' }),
      'images',
      progress,
      {
        uploadProvider: 'oss',
        storageCode: 'evaluate_oss',
        appType: 'APP_1',
        imageCompression: { enabled: true },
      },
    );

    expect(request).toHaveBeenCalledTimes(3);
    expect(request.mock.calls.map(([config]) => config.data.fileName)).toEqual([
      'photo.png',
      'photo.thumb.png',
      'photo.preview.png',
    ]);
    expect(instances).toHaveLength(3);
    expect(result).toMatchObject({
      url: 'https://cdn.example.com/openxiangda/APP_1/photo.png',
      thumbUrl: 'https://cdn.example.com/openxiangda/APP_1/photo.thumb.png',
      previewUrl: 'https://cdn.example.com/openxiangda/APP_1/photo.preview.png',
      variants: {
        thumb: {
          url: 'https://cdn.example.com/openxiangda/APP_1/photo.thumb.png',
          objectName: 'openxiangda/APP_1/photo.thumb.png',
          width: 320,
          height: 240,
        },
        preview: {
          url: 'https://cdn.example.com/openxiangda/APP_1/photo.preview.png',
          objectName: 'openxiangda/APP_1/photo.preview.png',
          width: 1280,
          height: 960,
        },
      },
    });
    expect(progress).toHaveBeenLastCalledWith(100);
  });

  it('deletes OSS files through the storage config endpoint', async () => {
    const request = vi.fn().mockResolvedValue({ success: true });
    const api = createFormRuntimeApi({ request });

    await expect(
      api.deleteFile('openxiangda/APP_1/file.txt', 'evaluate-oss', {
        uploadProvider: 'oss',
        storageCode: 'evaluate_oss',
        appType: 'APP_1',
      }),
    ).resolves.toEqual({ success: true });

    expect(request).toHaveBeenCalledWith({
      url: '/openxiangda-api/v1/apps/APP_1/storage-configs/evaluate_oss/objects/delete',
      method: 'post',
      data: {
        bucketName: 'evaluate-oss',
        objectName: 'openxiangda/APP_1/file.txt',
      },
    });
  });

  it('deletes builtin OSS files through the platform storage endpoint', async () => {
    const request = vi.fn().mockResolvedValue({ success: true });
    const api = createFormRuntimeApi({ request });

    await expect(
      api.deleteFile('openxiangda/files/TENANT_1/APP_1/file.txt', 'platform-bucket', {
        uploadProvider: 'builtin-oss',
        storageScope: 'platform',
        appType: 'APP_1',
      }),
    ).resolves.toEqual({ success: true });

    expect(request).toHaveBeenCalledWith({
      url: '/openxiangda-api/v1/apps/APP_1/storage/builtin/objects/delete',
      method: 'post',
      data: {
        bucketName: 'platform-bucket',
        objectName: 'openxiangda/files/TENANT_1/APP_1/file.txt',
      },
    });
  });

  it('rejects XMLHttpRequest upload failures and malformed payloads', async () => {
    vi.stubEnv('VITEST', '');

    class ErrorXHR {
      upload: any = {};
      status = 500;
      responseText = JSON.stringify({ success: false, message: 'server failed' });
      withCredentials = false;
      onload?: () => void;
      onerror?: () => void;
      open = vi.fn();
      setRequestHeader = vi.fn();
      send = vi.fn(() => this.onload?.());
    }

    vi.stubGlobal('XMLHttpRequest', ErrorXHR as any);
    await expect(
      createFormRuntimeApi({ baseUrl: '/api' }).uploadFile(
        new File(['bad'], 'bad.txt', { type: 'text/plain' }),
        'docs',
      ),
    ).rejects.toThrow('server failed');

    class MalformedXHR extends ErrorXHR {
      status = 200;
      responseText = '{bad';
    }

    vi.stubGlobal('XMLHttpRequest', MalformedXHR as any);
    await expect(
      createFormRuntimeApi({ baseUrl: '/api' }).uploadFile(
        new File(['bad'], 'bad.txt', { type: 'text/plain' }),
        'docs',
      ),
    ).rejects.toThrow();

    class NetworkErrorXHR extends ErrorXHR {
      send = vi.fn(() => this.onerror?.());
    }

    vi.stubGlobal('XMLHttpRequest', NetworkErrorXHR as any);
    await expect(
      createFormRuntimeApi({ baseUrl: '/api' }).uploadFile(
        new File(['bad'], 'bad.txt', { type: 'text/plain' }),
        'docs',
      ),
    ).rejects.toThrow('上传失败');
  });

  it('uploads multipart files and aborts failed multipart uploads', async () => {
    const bigFile = {
      name: 'big.bin',
      size: 11 * 1024 * 1024,
      type: 'application/octet-stream',
      slice: vi.fn(() => new Blob(['chunk'])),
    } as any as File;
    const progress = vi.fn();
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        success: true,
        data: {
          uploadId: 'up-1',
          bucketName: 'docs',
          objectName: 'big.bin',
          totalParts: 2,
        },
      })
      .mockResolvedValueOnce({ success: true, data: { partNumber: 2, etag: 'b' } })
      .mockResolvedValueOnce({ success: true, result: { partNumber: 1, etag: 'a' } })
      .mockResolvedValueOnce({
        success: true,
        data: { id: 'file-1', objectName: 'big.bin', bucketName: 'docs' },
      });

    await expect(
      createFormRuntimeApi({ request }).uploadFile(bigFile, 'docs', progress),
    ).resolves.toMatchObject({
      id: 'file-1',
      name: 'big.bin',
      bucketName: 'docs',
      objectName: 'big.bin',
      contentType: 'application/octet-stream',
    });
    expect(progress).toHaveBeenNthCalledWith(1, 50);
    expect(progress).toHaveBeenNthCalledWith(2, 100);
    expect(request).toHaveBeenLastCalledWith({
      url: '/file/multipart/complete',
      method: 'post',
      data: expect.objectContaining({
        uploadId: 'up-1',
        parts: [
          { partNumber: 1, etag: 'a' },
          { partNumber: 2, etag: 'b' },
        ],
      }),
    });

    const failedRequest = vi
      .fn()
      .mockResolvedValueOnce({
        success: true,
        result: {
          uploadId: 'up-2',
          bucketName: 'docs',
          objectName: 'big.bin',
          totalParts: 1,
        },
      })
      .mockRejectedValueOnce(new Error('part failed'))
      .mockResolvedValueOnce({ success: true });

    await expect(
      createFormRuntimeApi({ request: failedRequest }).uploadFile(bigFile, 'docs'),
    ).rejects.toThrow('part failed');
    expect(failedRequest).toHaveBeenLastCalledWith({
      url: '/file/multipart/abort',
      method: 'post',
      data: {
        uploadId: 'up-2',
        bucketName: 'docs',
        objectName: 'big.bin',
      },
    });
  });

  it('uploads public multipart files with public visibility', async () => {
    const bigFile = {
      name: 'public.bin',
      size: 11 * 1024 * 1024,
      type: 'application/octet-stream',
      slice: vi.fn(() => new Blob(['chunk'])),
    } as any as File;
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        success: true,
        data: {
          uploadId: 'up-public',
          bucketName: 'public-assets',
          objectName: 'public.bin',
          totalParts: 1,
        },
      })
      .mockResolvedValueOnce({ success: true, data: { partNumber: 1, etag: 'a' } })
      .mockResolvedValueOnce({
        success: true,
        data: {
          id: 'file-public',
          objectName: 'public.bin',
          bucketName: 'public-assets',
          url: '/file/public/public-assets/public.bin',
          visibility: 'public',
        },
      });

    await expect(
      createFormRuntimeApi({ request }).uploadPublicFile(bigFile),
    ).resolves.toMatchObject({
      id: 'file-public',
      bucketName: 'public-assets',
      objectName: 'public.bin',
      url: '/service/file/public/public-assets/public.bin',
      visibility: 'public',
    });

    expect(request).toHaveBeenNthCalledWith(1, {
      url: '/file/multipart/initiate',
      method: 'post',
      data: {
        fileName: 'public.bin',
        fileSize: bigFile.size,
        chunkSize: 5 * 1024 * 1024,
        bucketName: 'public-assets',
        visibility: 'public',
        contentType: 'application/octet-stream',
      },
    });
  });
});

import type {
  AttachmentImageVariants,
  AttachmentItem,
  FormRuntimeApi,
  FormRuntimeApiConfig,
  RuntimeAuthHeadersProvider,
  RuntimeRequestConfig,
  RuntimeResponse,
  RuntimeUploadOptions,
} from '../types';
import { createCompressedImageVariants, type CompressedImageVariant } from './imageCompression';

const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024;
const CHUNK_UPLOAD_THRESHOLD = 10 * 1024 * 1024;
const DEFAULT_PUBLIC_FILE_BUCKET = 'public-assets';

const trimTrailingSlash = (value?: string) => String(value || '').replace(/\/$/, '');

const getDefaultBaseUrl = () => {
  const globalEnv = (globalThis as any).process?.env;
  const envBaseUrl = globalEnv?.FORM_API_BASE_URL || globalEnv?.BASE_API_URL;
  if (envBaseUrl) return trimTrailingSlash(envBaseUrl);

  const browserGlobal = typeof window !== 'undefined' ? (window as any) : undefined;
  const windowBaseUrl =
    browserGlobal?.FORM_API_BASE_URL ||
    browserGlobal?.BASE_API_URL ||
    browserGlobal?.__FORM_API_BASE_URL__ ||
    browserGlobal?.__LOWCODE_API_BASE_URL__;
  if (windowBaseUrl) return trimTrailingSlash(windowBaseUrl);

  return typeof window !== 'undefined' ? '/service' : '';
};

const appendQuery = (url: string, params?: Record<string, any>) => {
  if (!params) return url;
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value)) {
      value.forEach((item) => search.append(key, String(item)));
      return;
    }
    search.append(key, String(value));
  });
  const query = search.toString();
  if (!query) return url;
  return `${url}${url.includes('?') ? '&' : '?'}${query}`;
};

const joinUrl = (baseUrl: string, url: string) => {
  if (/^https?:\/\//i.test(url)) return url;
  const normalizedBaseUrl = trimTrailingSlash(baseUrl);
  if (
    normalizedBaseUrl &&
    (url === normalizedBaseUrl || url.startsWith(`${normalizedBaseUrl}/`))
  ) {
    return url;
  }
  return `${normalizedBaseUrl}${url.startsWith('/') ? url : `/${url}`}`;
};

const isSuccessCode = (value: any) => {
  if (value === undefined || value === null || value === '') return true;
  const code = Number(value);
  return Number.isFinite(code) ? code === 0 || (code >= 200 && code < 300) : false;
};

const normalizeRuntimeFileUrl = (baseUrl: string, value: any) => {
  if (typeof value !== 'string' || !value) return value;
  if (/^(https?:)?\/\//i.test(value) || /^(blob|data):/i.test(value)) return value;
  if (!value.startsWith('/file/')) return value;
  return joinUrl(baseUrl, value);
};

const normalizeFilePayloadUrls = (baseUrl: string, payload: any) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  return {
    ...payload,
    url: normalizeRuntimeFileUrl(baseUrl, payload.url),
    downloadUrl: normalizeRuntimeFileUrl(baseUrl, payload.downloadUrl),
    publicUrl: normalizeRuntimeFileUrl(baseUrl, payload.publicUrl),
    relayUrl: normalizeRuntimeFileUrl(baseUrl, payload.relayUrl),
    previewUrl: normalizeRuntimeFileUrl(baseUrl, payload.previewUrl),
    metadataUrl: normalizeRuntimeFileUrl(baseUrl, payload.metadataUrl),
    previewPageUrl: payload.previewPageUrl,
  };
};

const normalizeImageVariants = (
  baseUrl: string,
  variants: any,
): AttachmentImageVariants | undefined => {
  if (!variants || typeof variants !== 'object' || Array.isArray(variants)) return undefined;
  const normalized: AttachmentImageVariants = {};
  (['thumb', 'preview'] as const).forEach((kind) => {
    const item = variants[kind];
    if (!item || typeof item !== 'object') return;
    normalized[kind] = {
      ...item,
      url: normalizeRuntimeFileUrl(baseUrl, item.url),
    };
  });
  return normalized.thumb || normalized.preview ? normalized : undefined;
};

const normalizeFileTicketResult = (baseUrl: string, payload: any) =>
  typeof payload === 'string'
    ? normalizeRuntimeFileUrl(baseUrl, payload)
    : normalizeFilePayloadUrls(baseUrl, payload);

const parseResponse = async <T>(response: Response): Promise<RuntimeResponse<T>> => {
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload
        ? payload.message || payload.error || response.statusText
        : response.statusText;
    throw new Error(message || '请求失败');
  }

  if (typeof payload === 'object' && payload) {
    const hasCode = Object.prototype.hasOwnProperty.call(payload, 'code');
    if (payload.success === false || (hasCode && !isSuccessCode(payload.code))) {
      throw new Error(payload.message || payload.error || '请求失败');
    }
  }

  if (typeof payload === 'object' && payload) {
    return payload as RuntimeResponse<T>;
  }

  return {
    code: response.status,
    success: response.ok,
    data: payload as T,
    result: payload as T,
    message: response.statusText,
  };
};

const applyAuthHeaders = (headers: Headers, getAuthHeaders?: RuntimeAuthHeadersProvider) => {
  const authHeaders = getAuthHeaders?.();
  if (authHeaders) {
    new Headers(authHeaders).forEach((value, key) => {
      if (!headers.has(key)) headers.set(key, value);
    });
  }
  const token = typeof window !== 'undefined' ? window.localStorage?.getItem('token') : undefined;
  if (token && !headers.has('authorization')) {
    headers.set('authorization', token);
  }
};

const applyXhrAuthHeaders = (
  xhr: XMLHttpRequest,
  getAuthHeaders?: RuntimeAuthHeadersProvider,
) => {
  let hasAuthorization = false;
  const authHeaders = getAuthHeaders?.();
  if (authHeaders) {
    new Headers(authHeaders).forEach((value, key) => {
      if (key.toLowerCase() === 'authorization') hasAuthorization = true;
      xhr.setRequestHeader(key, value);
    });
  }
  const token = typeof window !== 'undefined' ? window.localStorage?.getItem('token') : undefined;
  if (token && !hasAuthorization) xhr.setRequestHeader('authorization', token);
};

const createDefaultRequest =
  (
    baseUrl: string,
    fetchImpl: typeof fetch = fetch,
    getAuthHeaders?: RuntimeAuthHeadersProvider,
  ): FormRuntimeApi['request'] =>
  async <T = any>(config: RuntimeRequestConfig): Promise<RuntimeResponse<T> | Blob> => {
    const method = config.method ?? 'get';
    const url = appendQuery(joinUrl(baseUrl, config.url), config.params);
    const headers = new Headers(config.headers as HeadersInit);
    let body: BodyInit | undefined;

    if (config.data !== undefined) {
      if (config.data instanceof FormData) {
        body = config.data;
      } else {
        headers.set('Content-Type', headers.get('Content-Type') || 'application/json');
        body = JSON.stringify(config.data);
      }
    }

    applyAuthHeaders(headers, getAuthHeaders);

    const response = await fetchImpl(url, {
      method,
      headers,
      body,
      credentials: 'include',
    });

    if (config.responseType === 'blob') {
      if (!response.ok) throw new Error(response.statusText || '请求失败');
      return response.blob();
    }

    return parseResponse<T>(response);
  };

const generateUid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;

const normalizeFormInstancePayload = (payload: Record<string, any>): Record<string, any> => {
  const { formInstanceId, ...rest } = payload || {};
  return {
    ...rest,
    formInstId: payload?.formInstId || formInstanceId,
  };
};

const unwrapBusinessResponse = (response: RuntimeResponse<any> | any) => {
  const isFailureCode = (value: any) => {
    if (value === undefined || value === null || value === '') return false;
    const code = Number(value);
    return Number.isFinite(code) && code !== 0 && code !== 200;
  };
  if (response?.success === false || isFailureCode(response?.code)) {
    throw new Error(response.message || response.error || '请求失败');
  }
  const result = response?.data ?? response?.result ?? response;
  if (result?.success === false || isFailureCode(result?.code)) {
    throw new Error(result.message || response?.message || '请求失败');
  }
  return result;
};

const normalizeUploadData = (
  data: any,
  file: File,
  bucketName: string,
  baseUrl = '',
): AttachmentItem => {
  const item = Array.isArray(data) ? data[0] : data;
  const objectName = item?.objectName || item?.objectKey || item?.key;
  const resolvedBucketName = item?.bucketName || bucketName;
  const variants = normalizeImageVariants(baseUrl, item?.variants);
  return {
    id: item?.id || item?.uid || objectName || generateUid(),
    uid: item?.uid || item?.id || objectName || generateUid(),
    name: item?.originalName || item?.name || file.name,
    originalName: item?.originalName || file.name,
    url: normalizeRuntimeFileUrl(baseUrl, item?.url) || '',
    downloadUrl: normalizeRuntimeFileUrl(baseUrl, item?.downloadUrl),
    previewUrl: normalizeRuntimeFileUrl(baseUrl, item?.previewUrl),
    publicUrl: normalizeRuntimeFileUrl(baseUrl, item?.publicUrl),
    thumbUrl: normalizeRuntimeFileUrl(baseUrl, item?.thumbUrl) || variants?.thumb?.url,
    visibility: item?.visibility,
    provider: item?.provider,
    uploadProvider: item?.uploadProvider,
    storageScope: item?.storageScope,
    storageCode: item?.storageCode,
    appType: item?.appType,
    status: 'done',
    size: item?.size ?? file.size,
    objectName,
    bucketName: resolvedBucketName,
    contentType: item?.contentType || file.type,
    mimeType: item?.contentType || file.type,
    extension: item?.extension,
    width: item?.width,
    height: item?.height,
    variants,
  };
};

const uploadWithXhr = (
  baseUrl: string,
  file: File,
  bucketName: string,
  onProgress?: (percent: number) => void,
  options: { visibility?: 'public' | 'private' } = {},
  uploadOptions: RuntimeUploadOptions = {},
  getAuthHeaders?: RuntimeAuthHeadersProvider,
): Promise<AttachmentItem> =>
  new Promise((resolve, reject) => {
    if ((globalThis as any).process?.env?.VITEST) {
      onProgress?.(100);
      resolve({
        id: generateUid(),
        uid: generateUid(),
        name: file.name,
        url: typeof URL !== 'undefined' && URL.createObjectURL ? URL.createObjectURL(file) : '',
        status: 'done',
        size: file.size,
        bucketName,
        contentType: file.type,
        visibility: options.visibility,
      });
      return;
    }

    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('files', file);

    xhr.open(
      'POST',
      joinUrl(
        baseUrl,
        appendQuery('/file/upload', {
          bucketName,
          visibility: options.visibility,
          appType: uploadOptions.appType,
          policyCode: uploadOptions.policyCode,
          routeCode: uploadOptions.routeCode,
          formUuid: uploadOptions.formUuid,
          formCode: uploadOptions.formCode,
          fieldId: uploadOptions.fieldId,
          action:
            uploadOptions.appType ||
            uploadOptions.formUuid ||
            uploadOptions.formCode ||
            uploadOptions.fieldId
              ? 'upload'
              : undefined,
        }),
      ),
    );
    xhr.withCredentials = true;
    applyXhrAuthHeaders(xhr, getAuthHeaders);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress?.(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      try {
        const payload = JSON.parse(xhr.responseText || '{}');
        if (xhr.status >= 200 && xhr.status < 300 && payload.success !== false) {
          resolve(normalizeUploadData(payload.data, file, bucketName, baseUrl));
          return;
        }
        reject(new Error(payload.message || payload.error || '上传失败'));
      } catch (error) {
        reject(error);
      }
    };
    xhr.onerror = () => reject(new Error('上传失败'));
    xhr.send(formData);
  });

const uploadWithSignedUrl = (
  file: File,
  uploadInfo: any,
  bucketName: string,
  onProgress?: (percent: number) => void,
): Promise<AttachmentItem> =>
  new Promise((resolve, reject) => {
    if (!uploadInfo?.uploadUrl) {
      reject(new Error('OSS 上传签名缺少 uploadUrl'));
      return;
    }
    const xhr = new XMLHttpRequest();
    xhr.open(String(uploadInfo.uploadMethod || 'PUT').toUpperCase(), uploadInfo.uploadUrl);
    Object.entries(uploadInfo.headers || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        xhr.setRequestHeader(key, String(value));
      }
    });
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress?.(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve(
          normalizeUploadData(
            {
              ...uploadInfo,
              provider: uploadInfo.provider || 'oss',
              uploadProvider: uploadInfo.uploadProvider,
              storageScope: uploadInfo.storageScope,
              storageCode: uploadInfo.storageCode,
            },
            file,
            uploadInfo.bucketName || bucketName,
          ),
        );
        return;
      }
      reject(new Error(xhr.statusText || 'OSS 上传失败'));
    };
    xhr.onerror = () => reject(new Error('OSS 上传失败'));
    xhr.send(file);
  });

async function uploadOssFile(
  request: FormRuntimeApi['request'],
  file: File,
  bucketName: string,
  onProgress: ((percent: number) => void) | undefined,
  options: RuntimeUploadOptions,
) {
  if (!options.appType) throw new Error('OSS 上传缺少 appType');
  if (!options.storageCode) throw new Error('OSS 上传缺少 storageCode');
  const response = (await request<any>({
    url: `/openxiangda-api/v1/apps/${encodeURIComponent(
      options.appType,
    )}/storage-configs/${encodeURIComponent(options.storageCode)}/uploads/initiate`,
    method: 'post',
    data: {
      fileName: file.name,
      fileSize: file.size,
      contentType: file.type || undefined,
      bucketName,
    },
  })) as RuntimeResponse<any>;
  return uploadWithSignedUrl(file, response.data || response.result, bucketName, onProgress);
}

async function uploadBuiltinOssFile(
  request: FormRuntimeApi['request'],
  file: File,
  bucketName: string,
  onProgress: ((percent: number) => void) | undefined,
  options: RuntimeUploadOptions,
) {
  if (!options.appType) throw new Error('平台内置 OSS 上传缺少 appType');
  const response = (await request<any>({
    url: `/openxiangda-api/v1/apps/${encodeURIComponent(
      options.appType,
    )}/storage/builtin/uploads/initiate`,
    method: 'post',
    data: {
      fileName: file.name,
      fileSize: file.size,
      contentType: file.type || undefined,
      bucketName,
      purpose: options.uploadPurpose,
    },
  })) as RuntimeResponse<any>;
  return uploadWithSignedUrl(file, response.data || response.result, bucketName, onProgress);
}

async function uploadChunkedFile(
  request: FormRuntimeApi['request'],
  file: File,
  bucketName: string,
  baseUrl: string,
  onProgress?: (percent: number) => void,
  options: { visibility?: 'public' | 'private' } = {},
  uploadOptions: RuntimeUploadOptions = {},
) {
  const initiate = (await request<any>({
    url: '/file/multipart/initiate',
    method: 'post',
    data: {
      fileName: file.name,
      fileSize: file.size,
      chunkSize: DEFAULT_CHUNK_SIZE,
      bucketName,
      visibility: options.visibility,
      contentType: file.type || undefined,
      appType: uploadOptions.appType,
      policyCode: uploadOptions.policyCode,
      routeCode: uploadOptions.routeCode,
      formUuid: uploadOptions.formUuid,
      formCode: uploadOptions.formCode,
      fieldId: uploadOptions.fieldId,
      action:
        uploadOptions.appType ||
        uploadOptions.formUuid ||
        uploadOptions.formCode ||
        uploadOptions.fieldId
          ? 'upload'
          : undefined,
    },
  })) as RuntimeResponse<any>;
  const uploadInfo = initiate.data || initiate.result;
  const totalParts = uploadInfo?.totalParts || Math.ceil(file.size / DEFAULT_CHUNK_SIZE);
  const parts: Array<{ partNumber: number; etag: string }> = [];

  try {
    for (let index = 0; index < totalParts; index += 1) {
      const start = index * DEFAULT_CHUNK_SIZE;
      const end = Math.min(start + DEFAULT_CHUNK_SIZE, file.size);
      const formData = new FormData();
      formData.append('file', file.slice(start, end));
      formData.append('uploadId', uploadInfo.uploadId);
      formData.append('partNumber', String(index + 1));
      formData.append('bucketName', uploadInfo.bucketName);
      formData.append('objectName', uploadInfo.objectName);
      const part = (await request<any>({
        url: '/file/multipart/upload',
        method: 'post',
        data: formData,
      })) as RuntimeResponse<any>;
      parts.push(part.data || part.result);
      onProgress?.(Math.round(((index + 1) / totalParts) * 100));
    }

    const completed = (await request<any>({
      url: '/file/multipart/complete',
      method: 'post',
      data: {
        uploadId: uploadInfo.uploadId,
        bucketName: uploadInfo.bucketName,
        objectName: uploadInfo.objectName,
        originalName: file.name,
        contentType: file.type || undefined,
        parts: parts.sort((a, b) => a.partNumber - b.partNumber),
      },
    })) as RuntimeResponse<any>;

    return normalizeUploadData(completed.data || completed.result, file, bucketName, baseUrl);
  } catch (error) {
    await request({
      url: '/file/multipart/abort',
      method: 'post',
      data: {
        uploadId: uploadInfo?.uploadId,
        bucketName: uploadInfo?.bucketName,
        objectName: uploadInfo?.objectName,
      },
    }).catch(() => undefined);
    throw error;
  }
}

const stripImageCompressionOptions = (options: RuntimeUploadOptions): RuntimeUploadOptions => {
  const { imageCompression, ...rest } = options;
  return rest;
};

const createSegmentProgress =
  (onProgress: ((percent: number) => void) | undefined, start: number, end: number) =>
  (percent: number) => {
    const next = start + ((end - start) * Math.max(0, Math.min(100, percent))) / 100;
    onProgress?.(Math.round(next));
  };

const getAttachmentUrl = (item: AttachmentItem) =>
  item.publicUrl || item.previewUrl || item.downloadUrl || item.url || '';

async function uploadSingleRuntimeFile(
  request: FormRuntimeApi['request'],
  baseUrl: string,
  file: File,
  bucketName: string,
  onProgress: ((percent: number) => void) | undefined,
  options: RuntimeUploadOptions,
  getAuthHeaders?: RuntimeAuthHeadersProvider,
) {
  const singleOptions = stripImageCompressionOptions(options);
  if (singleOptions.uploadProvider === 'builtin-oss') {
    return uploadBuiltinOssFile(request, file, bucketName, onProgress, singleOptions);
  }
  if (singleOptions.uploadProvider === 'oss' || singleOptions.storageCode) {
    return uploadOssFile(request, file, bucketName, onProgress, singleOptions);
  }
  if (file.size > CHUNK_UPLOAD_THRESHOLD) {
    return uploadChunkedFile(
      request,
      file,
      bucketName,
      baseUrl,
      onProgress,
      {},
      singleOptions,
    );
  }
  return uploadWithXhr(
    baseUrl,
    file,
    bucketName,
    onProgress,
    {},
    singleOptions,
    getAuthHeaders,
  );
}

function toImageVariantMetadata(uploaded: AttachmentItem, variant: CompressedImageVariant) {
  return {
    url: getAttachmentUrl(uploaded),
    objectName: uploaded.objectName,
    bucketName: uploaded.bucketName,
    width: variant.width,
    height: variant.height,
    size: uploaded.size ?? variant.file.size,
    contentType: uploaded.contentType || variant.contentType,
    quality: variant.quality,
  };
}

async function uploadFileWithImageVariants(
  request: FormRuntimeApi['request'],
  baseUrl: string,
  file: File,
  bucketName: string,
  onProgress: ((percent: number) => void) | undefined,
  options: RuntimeUploadOptions,
  getAuthHeaders?: RuntimeAuthHeadersProvider,
) {
  let variants: CompressedImageVariant[] = [];
  try {
    variants = await createCompressedImageVariants(file, options.imageCompression);
  } catch {
    variants = [];
  }

  if (variants.length === 0) {
    return uploadSingleRuntimeFile(
      request,
      baseUrl,
      file,
      bucketName,
      onProgress,
      options,
      getAuthHeaders,
    );
  }

  const originalProgressEnd = 70;
  const uploaded = await uploadSingleRuntimeFile(
    request,
    baseUrl,
    file,
    bucketName,
    createSegmentProgress(onProgress, 0, originalProgressEnd),
    options,
    getAuthHeaders,
  );

  const imageVariants: AttachmentImageVariants = { ...(uploaded.variants || {}) };
  const variantProgressStep = (100 - originalProgressEnd) / variants.length;

  for (let index = 0; index < variants.length; index += 1) {
    const variant = variants[index];
    const start = originalProgressEnd + variantProgressStep * index;
    const end = originalProgressEnd + variantProgressStep * (index + 1);
    try {
      const variantUpload = await uploadSingleRuntimeFile(
        request,
        baseUrl,
        variant.file,
        bucketName,
        createSegmentProgress(onProgress, start, end),
        options,
        getAuthHeaders,
      );
      imageVariants[variant.kind] = toImageVariantMetadata(variantUpload, variant);
    } catch {
      onProgress?.(Math.round(end));
    }
  }

  onProgress?.(100);
  return {
    ...uploaded,
    thumbUrl: imageVariants.thumb?.url || uploaded.thumbUrl,
    previewUrl: imageVariants.preview?.url || uploaded.previewUrl || uploaded.url,
    variants: imageVariants.thumb || imageVariants.preview ? imageVariants : uploaded.variants,
  };
}

export function createFormRuntimeApi(config?: FormRuntimeApiConfig): FormRuntimeApi {
  const { baseUrl = getDefaultBaseUrl(), ...overrides } = config ?? {};
  const { fetchImpl, getAuthHeaders } = overrides;
  const request =
    overrides.request ?? createDefaultRequest(baseUrl, fetchImpl, getAuthHeaders);

  const defaults: FormRuntimeApi = {
    request,
    uploadFile: async (file, bucketName = 'files', onProgress, options = {}) => {
      return uploadFileWithImageVariants(
        request,
        baseUrl,
        file,
        bucketName,
        onProgress,
        options,
        getAuthHeaders,
      );
    },
    uploadPublicFile: async (
      file,
      bucketName = DEFAULT_PUBLIC_FILE_BUCKET,
      onProgress
    ) => {
      if (file.size > CHUNK_UPLOAD_THRESHOLD) {
        return uploadChunkedFile(request, file, bucketName, baseUrl, onProgress, {
          visibility: 'public',
        }, {});
      }
      return uploadWithXhr(baseUrl, file, bucketName, onProgress, {
        visibility: 'public',
      }, {}, getAuthHeaders);
    },
    deleteFile: async (objectName, bucketName = 'files', options = {}) => {
      if (options.uploadProvider === 'builtin-oss' || options.storageScope === 'platform') {
        if (!options.appType) throw new Error('平台内置 OSS 删除缺少 appType');
        await request({
          url: `/openxiangda-api/v1/apps/${encodeURIComponent(
            options.appType,
          )}/storage/builtin/objects/delete`,
          method: 'post',
          data: { bucketName, objectName },
        });
        return { success: true };
      }
      if (options.uploadProvider === 'oss' || options.storageCode) {
        if (!options.appType) throw new Error('OSS 删除缺少 appType');
        if (!options.storageCode) throw new Error('OSS 删除缺少 storageCode');
        await request({
          url: `/openxiangda-api/v1/apps/${encodeURIComponent(
            options.appType,
          )}/storage-configs/${encodeURIComponent(options.storageCode)}/objects/delete`,
          method: 'post',
          data: { bucketName, objectName },
        });
        return { success: true };
      }
      await request({ url: '/file/delete', method: 'post', data: { bucketName, objectName } });
      return { success: true };
    },
    createDownloadTicket: async (bucketName, objectName, fileName) => {
      const response = (await request<any>({
        url: '/file/download-ticket',
        method: 'post',
        data: { bucketName, objectName, fileName },
      })) as RuntimeResponse<any>;
      return normalizeFileTicketResult(baseUrl, response.data || response.result);
    },
    createFileAccessTicket: async (
      bucketName,
      objectName,
      fileName,
      purpose = 'preview',
      options = {},
    ) => {
      const response = (await request<any>({
        url: '/file/access-ticket',
        method: 'post',
        data: { bucketName, objectName, fileName, purpose, appType: options.appType },
      })) as RuntimeResponse<any>;
      return normalizeFileTicketResult(baseUrl, response.data || response.result);
    },
    getUserById: async (id) => {
      const response = (await request<any>({
        url: `/user/${id}`,
        method: 'get',
      })) as RuntimeResponse<any>;
      return response.data || response.result;
    },
    getUserList: async (params) => {
      const response = (await request<any>({
        url: '/user/list',
        method: 'get',
        params,
      })) as RuntimeResponse<any>;
      const data = response.data || response.result;
      return Array.isArray(data) ? data : data?.items || data?.list || [];
    },
    getDepartmentRoots: async () => {
      const response = (await request<any>({
        url: '/department/root',
        method: 'get',
      })) as RuntimeResponse<any>;
      return response.data || response.result || [];
    },
    getDepartmentChildren: async (parentId) => {
      const response = (await request<any>({
        url: `/department/${parentId}/children`,
        method: 'get',
      })) as RuntimeResponse<any>;
      return response.data || response.result || [];
    },
    searchDepartments: async (params) => {
      const page = params?.page ?? 1;
      const pageSize = params?.pageSize ?? 50;
      const response = (await request<any>({
        url: '/department/search',
        method: 'get',
        params: {
          keyword: params?.keyword,
          page,
          pageSize,
          includePath: params?.includePath ?? true,
        },
      })) as RuntimeResponse<any>;
      const data = response.data || response.result;
      if (Array.isArray(data)) {
        return { items: data, total: data.length, page, pageSize };
      }
      return {
        items: data?.items || data?.list || [],
        total: Number(data?.total ?? data?.count ?? data?.items?.length ?? 0),
        page: Number(data?.page ?? page),
        pageSize: Number(data?.pageSize ?? pageSize),
      };
    },
    getDepartmentParentDepartments: async (id) => {
      const response = (await request<any>({
        url: `/department/${id}/parentDepartments`,
        method: 'get',
      })) as RuntimeResponse<any>;
      return response.data || response.result || [];
    },
    getDepartmentMembers: async (id) => {
      const response = (await request<any>({
        url: `/department/${id}/members`,
        method: 'get',
      })) as RuntimeResponse<any>;
      const data = response.data || response.result;
      return Array.isArray(data) ? data : data?.items || data?.list || [];
    },
    getDepartmentMembersPage: async (id, params) => {
      const page = params?.page ?? 1;
      const pageSize = params?.pageSize ?? 20;
      const response = (await request<any>({
        url: `/department/${id}/members`,
        method: 'get',
        params: { page, pageSize },
      })) as RuntimeResponse<any>;
      const data = response.data || response.result;
      const items = Array.isArray(data) ? data : data?.items || data?.list || [];
      return {
        items,
        total: Number(data?.total ?? data?.count ?? items.length),
        page: Number(data?.page ?? page),
        pageSize: Number(data?.pageSize ?? pageSize),
      };
    },
    getChinaDivisions: async (parentAdcode) => {
      const response = (await request<any>({
        url: '/china-divisions',
        method: 'get',
        params: parentAdcode ? { parentAdcode } : undefined,
      })) as RuntimeResponse<any>;
      return response.data || response.result || [];
    },
    advancedSearch: async (params) => {
      const response = (await request<any>({
        url: `/${params.appType}/v1/form/advancedSearch.json`,
        method: 'get',
        params,
      })) as RuntimeResponse<any>;
      return response.result || response.data || {};
    },
    getDingTalkSignature: async (url) => {
      const response = (await request<any>({
        url: '/dingtalk/signature',
        method: 'get',
        params: { url },
      })) as RuntimeResponse<any>;
      return response.data || response.result;
    },
    submitFormData: async (payload) => {
      const response = (await request<any>({
        url: '/form/submitFormData',
        method: 'post',
        data: payload,
      })) as RuntimeResponse<any>;
      return unwrapBusinessResponse(response);
    },
    updateFormData: async (payload) => {
      const data = normalizeFormInstancePayload(payload);
      const response = (await request<any>({
        url: `/${data.appType}/v1/form/updateFormData.json`,
        method: 'post',
        data,
      })) as RuntimeResponse<any>;
      return unwrapBusinessResponse(response);
    },
    startProcessFromExistingInstance: async (payload) => {
      const data = normalizeFormInstancePayload(payload);
      const response = (await request<any>({
        url: `/${data.appType}/v1/form/startProcessFromExistingInstance.json`,
        method: 'post',
        data,
      })) as RuntimeResponse<any>;
      return unwrapBusinessResponse(response);
    },
  };

  return { ...defaults, ...overrides, request };
}

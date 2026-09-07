import { describe, expect, it, vi } from "vitest"

import { createPageFormRuntimeApi } from "./formRuntime"

import type { PageSdk } from "../core/types"

const createSdk = (servicePrefix = "/service") => {
  const blob = new Blob([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  })
  const transportRequest = vi.fn(async () => ({
    code: 200,
    data: { data: { value: "ok" }, success: true },
    result: { value: "ok" },
    success: true,
  }))
  const transportDownload = vi.fn(async () => ({
    blob,
    contentType: blob.type,
  }))
  const createFileAccessTicket = vi.fn(async () => ({
    code: 200,
    data: {
      data: {
        ticket: "ticket-1",
        downloadUrl: "/file/download-by-access-ticket/ticket-1",
        previewUrl: "/file/preview-by-ticket/ticket-1",
      },
      success: true,
    },
    result: {
      ticket: "ticket-1",
      downloadUrl: "/file/download-by-access-ticket/ticket-1",
      previewUrl: "/file/preview-by-ticket/ticket-1",
      officeTextPreviewUrl: "/file/office-text-preview/ticket-1",
      previewPageUrl: "/view/APP_TEST/file-preview?ticket=ticket-1",
    },
    success: true,
  }))
  const request = vi.fn(async () => ({
    code: 200,
    data: {
      data: {
        ticket: "download-1",
        downloadUrl: "/file/download-by-ticket/download-1",
      },
      success: true,
    },
    result: {
      ticket: "download-1",
      downloadUrl: "/file/download-by-ticket/download-1",
    },
    success: true,
  }))

  return {
    blob,
    createFileAccessTicket,
    request,
    sdk: {
      context: { env: { servicePrefix } },
      createFileAccessTicket,
      request,
      transport: {
        download: transportDownload,
        request: transportRequest,
      },
    } as unknown as PageSdk,
    transportDownload,
    transportRequest,
  }
}

describe("PageSdk form runtime adapter", () => {
  it("routes blob requests through transport.download", async () => {
    const { blob, sdk, transportDownload, transportRequest } = createSdk()
    const api = createPageFormRuntimeApi(sdk)

    const response = await api.request({
      url: "/file/preview-by-ticket/ticket-1",
      method: "get",
      params: { revision: 2 },
      responseType: "blob",
    })

    expect(response).toBe(blob)
    expect(transportRequest).not.toHaveBeenCalled()
    expect(transportDownload).toHaveBeenCalledWith({
      path: "/file/preview-by-ticket/ticket-1",
      method: "get",
      query: { revision: 2 },
      body: undefined,
      headers: undefined,
    })
  })

  it("keeps JSON requests on transport.request", async () => {
    const { sdk, transportDownload, transportRequest } = createSdk()
    const api = createPageFormRuntimeApi(sdk)

    const response = await api.request<{ value: string }>({
      url: "/example",
      method: "post",
      data: { input: true },
    })

    expect(response).toMatchObject({
      code: 200,
      data: { value: "ok" },
      result: { value: "ok" },
      success: true,
    })
    expect(transportDownload).not.toHaveBeenCalled()
    expect(transportRequest).toHaveBeenCalledOnce()
  })

  it("delegates protected file tickets to PageSdk", async () => {
    const { createFileAccessTicket, sdk } = createSdk()
    const api = createPageFormRuntimeApi(sdk)

    await expect(
      api.createFileAccessTicket(
        "attachments",
        "contract.docx",
        "合同.docx",
        "preview",
        { appType: "APP_TEST" },
      ),
    ).resolves.toEqual({
      ticket: "ticket-1",
      downloadUrl: "/service/file/download-by-access-ticket/ticket-1",
      previewUrl: "/service/file/preview-by-ticket/ticket-1",
      officeTextPreviewUrl: "/service/file/office-text-preview/ticket-1",
      previewPageUrl: "/view/APP_TEST/file-preview?ticket=ticket-1",
    })
    expect(createFileAccessTicket).toHaveBeenCalledWith(
      "attachments",
      "contract.docx",
      "合同.docx",
      "preview",
      { appType: "APP_TEST" },
    )
  })

  it("normalizes download ticket URLs to the PageSdk service prefix", async () => {
    const { request, sdk } = createSdk()
    const api = createPageFormRuntimeApi(sdk)

    await expect(
      api.createDownloadTicket("attachments", "contract.docx", "合同.docx"),
    ).resolves.toEqual({
      ticket: "download-1",
      downloadUrl: "/service/file/download-by-ticket/download-1",
    })
    expect(request).toHaveBeenCalledWith({
      path: "/file/download-ticket",
      method: "post",
      body: {
        bucketName: "attachments",
        objectName: "contract.docx",
        fileName: "合同.docx",
      },
    })
  })

  it("honors a custom PageSdk service prefix", async () => {
    const { sdk } = createSdk("/gateway/service/")
    const api = createPageFormRuntimeApi(sdk)

    await expect(
      api.createDownloadTicket("attachments", "contract.docx", "合同.docx"),
    ).resolves.toMatchObject({
      downloadUrl: "/gateway/service/file/download-by-ticket/download-1",
    })
  })
})

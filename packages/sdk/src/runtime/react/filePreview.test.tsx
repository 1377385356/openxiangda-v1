import React from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { createPageContextFixture } from "../../test/fixtures/pageContext"
import { PageProvider } from "./provider"
import { AttachmentPreviewList, ImagePreviewGrid } from "./filePreview"

import type { PageContext } from "../core/types"

const renderAsync = vi.fn().mockResolvedValue(undefined)

vi.mock("docx-preview", () => ({ renderAsync }))

vi.stubGlobal(
  "ResizeObserver",
  class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
)

const renderWithContext = (children: React.ReactNode, context: PageContext) =>
  render(<PageProvider context={context}>{children}</PageProvider>)

describe("standalone file preview components", () => {
  beforeEach(() => {
    renderAsync.mockClear()
  })

  it("opens a protected DOCX through the PageSdk binary adapter", async () => {
    const source = new Blob(["docx"], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    })
    const bridgeInvoke = vi.fn(async (method: string, rawPayload?: unknown) => {
      const payload = rawPayload as { path?: string; body?: Record<string, unknown> }
      if (method === "transport.download") {
        return { blob: source, contentType: source.type }
      }
      if (payload.path === "/file/preview-capabilities") {
        return {
          code: 200,
          success: true,
          data: {
            items: [
              {
                key: "docx-1",
                extension: "docx",
                previewType: "office",
                renderMode: "docx-html",
                canPreview: true,
                canDownload: true,
              },
            ],
          },
        }
      }
      if (payload.path === "/file/access-ticket") {
        expect(payload.body?.appType).toBe("APP_DEMO")
        return {
          code: 200,
          success: true,
          data: { ticket: "DOCX_TICKET", appType: "APP_DEMO" },
        }
      }
      if (payload.path === "/file/access-ticket/DOCX_TICKET") {
        return {
          code: 200,
          success: true,
          data: {
            ticket: "DOCX_TICKET",
            fileName: "report.docx",
            extension: "docx",
            previewType: "office",
            renderMode: "docx-html",
            canPreview: true,
            canDownload: true,
            previewUrl: "/file/preview-by-ticket/DOCX_TICKET",
          },
        }
      }
      return { code: 200, success: true, data: null }
    })
    const context = createPageContextFixture({ bridgeInvoke })

    renderWithContext(
      <AttachmentPreviewList
        items={[
          {
            id: "docx-1",
            uid: "docx-1",
            name: "report.docx",
            objectName: "APP_DEMO/report.docx",
            bucketName: "attachments",
            status: "done",
          },
        ]}
      />,
      context,
    )

    const previewButton = await screen.findByTestId("attachment-preview-docx-1")
    fireEvent.click(previewButton)

    await waitFor(() => expect(renderAsync).toHaveBeenCalled())
    expect(renderAsync.mock.calls.at(-1)?.[0]).toBe(source)
    expect(bridgeInvoke).toHaveBeenCalledWith(
      "transport.download",
      expect.objectContaining({
        path: "/service/file/preview-by-ticket/DOCX_TICKET",
        method: "get",
      }),
    )
  })

  it("only shows preview after the platform grants the capability", async () => {
    const bridgeInvoke = vi.fn(async (_method: string, rawPayload?: unknown) => {
      const payload = rawPayload as { path?: string }
      if (payload.path === "/file/preview-capabilities") {
        return {
          code: 200,
          success: true,
          data: {
            items: [
              {
                key: "archive-1",
                extension: "zip",
                previewType: "download",
                renderMode: "download",
                canPreview: false,
                canDownload: true,
              },
            ],
          },
        }
      }
      return { code: 200, success: true, data: null }
    })
    const context = createPageContextFixture({ bridgeInvoke })

    renderWithContext(
      <AttachmentPreviewList
        items={[
          {
            id: "archive-1",
            uid: "archive-1",
            name: "archive.zip",
            objectName: "APP_DEMO/archive.zip",
            status: "done",
          },
        ]}
      />,
      context,
    )

    await waitFor(() =>
      expect(bridgeInvoke).toHaveBeenCalledWith(
        "transport.request",
        expect.objectContaining({ path: "/file/preview-capabilities" }),
      ),
    )
    expect(screen.queryByLabelText("预览")).not.toBeInTheDocument()
    expect(screen.getByLabelText("下载")).toBeInTheDocument()
  })

  it("renders direct images as a previewable grid", () => {
    const context = createPageContextFixture()
    renderWithContext(
      <ImagePreviewGrid
        items={[
          {
            id: "image-1",
            uid: "image-1",
            name: "site.webp",
            provider: "oss",
            previewUrl: "https://cdn.example.com/site.webp",
            status: "done",
          },
        ]}
      />,
      context,
    )

    expect(screen.getByTestId("openxiangda-image-preview-grid")).toBeInTheDocument()
    expect(screen.getByRole("img", { name: "site.webp" })).toHaveAttribute(
      "src",
      "https://cdn.example.com/site.webp",
    )
    expect(screen.getByTestId("image-preview-image-1")).toBeEnabled()
  })
})

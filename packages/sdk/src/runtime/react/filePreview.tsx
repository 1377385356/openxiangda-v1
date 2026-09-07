import React, { useMemo, useState } from "react"
import { Empty } from "antd"

import {
  getPreviewItemKey,
  useFilePreviewController,
} from "../../components/file-preview"
import {
  FileActionButton,
  FileStatusText,
  FileTypeIcon,
} from "../../components/fields/shared/FileDisplay"
import { usePageSdk } from "./hooks/usePageSdk"
import { createPageFormRuntimeApi } from "./formRuntime"

import type { AttachmentItem } from "../../components/types"
import type {
  FilePreviewCapability,
  PreparedFilePreview,
} from "../../components/file-preview"

const EMPTY_ITEMS: AttachmentItem[] = []

export interface UseFilePreviewOptions {
  /** Files from a form value, data view row, App Function, or another PageSdk result. */
  items?: AttachmentItem[]
  /** Defaults to the current PageSdk app context. */
  appType?: string
  bucketName?: string
  enabled?: boolean
  requireServerCapability?: boolean
}

export interface FilePreviewController {
  canPreview: (item: AttachmentItem) => boolean
  getCapability: (item: AttachmentItem) => FilePreviewCapability | undefined
  open: (item: AttachmentItem) => Promise<void>
  download: (item: AttachmentItem, prepared?: PreparedFilePreview | null) => Promise<void>
  isOpening: (item: AttachmentItem) => boolean
  openingKey: string
  host: React.ReactNode
}

/**
 * Adds platform-authorized preview and download actions to standalone React SPA UI.
 * Render the returned `host` once so dialogs and image galleries can be mounted.
 */
export const useFilePreview = ({
  items = EMPTY_ITEMS,
  appType,
  bucketName = "attachments",
  enabled = true,
  requireServerCapability = true,
}: UseFilePreviewOptions): FilePreviewController => {
  const sdk = usePageSdk()
  const api = useMemo(() => createPageFormRuntimeApi(sdk), [sdk])
  const preview = useFilePreviewController({
    items,
    api,
    appType: appType || sdk.context.app.appType,
    bucketName,
    enabled,
    requireServerCapability,
  })

  return {
    canPreview: preview.canPreview,
    getCapability: preview.getCapability,
    open: preview.openPreview,
    download: preview.downloadItem,
    isOpening: preview.isOpening,
    openingKey: preview.openingKey,
    host: preview.previewHost,
  }
}

export interface AttachmentPreviewListProps {
  items?: AttachmentItem[]
  appType?: string
  bucketName?: string
  showPreview?: boolean
  showDownload?: boolean
  showFileSize?: boolean
  showFileTypeBadge?: boolean
  emptyText?: React.ReactNode
  className?: string
}

/** Read-only attachment list with capability-aware preview and download actions. */
export const AttachmentPreviewList = ({
  items = EMPTY_ITEMS,
  appType,
  bucketName = "attachments",
  showPreview = true,
  showDownload = true,
  showFileSize = true,
  showFileTypeBadge = false,
  emptyText = "暂无附件",
  className,
}: AttachmentPreviewListProps) => {
  const preview = useFilePreview({
    items,
    appType,
    bucketName,
    enabled: showPreview,
    requireServerCapability: true,
  })

  if (!items.length) {
    return <Empty description={emptyText} className={className} />
  }

  return (
    <div
      className={["sy-readonly-files", "sy-readonly-attachments", className]
        .filter(Boolean)
        .join(" ")}
      data-testid="openxiangda-attachment-preview-list"
    >
      <div className="sy-file-list">
        {items.map((item, index) => {
          const key = getPreviewItemKey(item, index)
          const canAct = item.status !== "uploading" && item.status !== "error"
          const canDownload = preview.getCapability(item)?.canDownload !== false
          return (
            <div className="sy-file-item" key={`${key}-${index}`}>
              <FileTypeIcon item={item} />
              <div className="sy-file-meta">
                <span className="sy-file-name" title={item.name}>
                  {item.name || "未命名附件"}
                </span>
                <FileStatusText
                  item={item}
                  showFileSize={showFileSize}
                  showFileTypeBadge={showFileTypeBadge}
                />
              </div>
              <div className="sy-file-actions">
                {showPreview && preview.canPreview(item) ? (
                  <FileActionButton
                    type="preview"
                    disabled={!canAct || preview.isOpening(item)}
                    onClick={() => void preview.open(item)}
                    testId={`attachment-preview-${key}`}
                  />
                ) : null}
                {showDownload && canDownload ? (
                  <FileActionButton
                    type="download"
                    disabled={!canAct}
                    onClick={() => void preview.download(item)}
                    testId={`attachment-download-${key}`}
                  />
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
      {preview.host}
    </div>
  )
}

export interface ImagePreviewGridProps {
  items?: AttachmentItem[]
  appType?: string
  bucketName?: string
  showPreview?: boolean
  showDownload?: boolean
  showFileName?: boolean
  emptyText?: React.ReactNode
  className?: string
}

const PreviewImageThumb = ({ item }: { item: AttachmentItem }) => {
  const src = item.thumbUrl || item.previewUrl || item.url
  const [failed, setFailed] = useState(false)

  React.useEffect(() => setFailed(false), [src])

  return src && !failed ? (
    <img src={src} alt={item.name || "图片"} onError={() => setFailed(true)} />
  ) : (
    <span className="sy-image-state">{item.name || "图片"}</span>
  )
}

/** Read-only image grid that opens the current item in the shared preview gallery. */
export const ImagePreviewGrid = ({
  items = EMPTY_ITEMS,
  appType,
  bucketName = "images",
  showPreview = true,
  showDownload = true,
  showFileName = true,
  emptyText = "暂无图片",
  className,
}: ImagePreviewGridProps) => {
  const preview = useFilePreview({
    items,
    appType,
    bucketName,
    enabled: showPreview,
    requireServerCapability: true,
  })

  if (!items.length) {
    return <Empty description={emptyText} className={className} />
  }

  return (
    <div
      className={["sy-readonly-files", "sy-readonly-images", className]
        .filter(Boolean)
        .join(" ")}
      data-testid="openxiangda-image-preview-grid"
    >
      <div
        className="sy-mobile-image-grid"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(112px, 160px))" }}
      >
        {items.map((item, index) => {
          const key = getPreviewItemKey(item, index)
          const canAct = item.status !== "uploading" && item.status !== "error"
          const canOpen = showPreview && preview.canPreview(item)
          const canDownload = preview.getCapability(item)?.canDownload !== false
          return (
            <div className="sy-mobile-image-card" key={`${key}-${index}`}>
              <div className="sy-mobile-image-thumb">
                <button
                  type="button"
                  className="sy-image-preview"
                  disabled={!canAct || !canOpen || preview.isOpening(item)}
                  onClick={() => void preview.open(item)}
                  aria-label={`预览 ${item.name || "图片"}`}
                  data-testid={`image-preview-${key}`}
                >
                  <PreviewImageThumb item={item} />
                </button>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  minWidth: 0,
                }}
              >
                {showFileName ? (
                  <div className="sy-mobile-image-name" title={item.name} style={{ flex: 1 }}>
                    {item.name || "图片"}
                  </div>
                ) : (
                  <span style={{ flex: 1 }} />
                )}
                <div className="sy-file-actions">
                  {canOpen ? (
                    <FileActionButton
                      type="preview"
                      disabled={!canAct || preview.isOpening(item)}
                      onClick={() => void preview.open(item)}
                    />
                  ) : null}
                  {showDownload && canDownload ? (
                    <FileActionButton
                      type="download"
                      disabled={!canAct}
                      onClick={() => void preview.download(item)}
                    />
                  ) : null}
                </div>
              </div>
            </div>
          )
        })}
      </div>
      {preview.host}
    </div>
  )
}

export type FilePreviewItem = AttachmentItem

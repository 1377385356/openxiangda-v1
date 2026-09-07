import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Form, Input, Modal, Select } from "antd"
import {
  CheckOutlined,
  CloseOutlined,
  ReloadOutlined,
  RollbackOutlined,
  SaveOutlined,
  SwapOutlined,
} from "@ant-design/icons"

import type {
  ProcessCapabilities,
  ProcessCapabilityOperation,
  ResolveProcessCapabilitiesParams,
  WorkflowCapabilityActionKey,
} from "../core/types"
import { usePageSdk } from "./hooks/usePageSdk"
import { StickyActionBar } from "../../components/modules/StickyActionBar"
import type { ActionConfig } from "../../components/modules/FormActionBar"
import { ApprovalTimeline } from "../../components/modules/ApprovalTimeline"
import type { ApprovalTimelineProps } from "../../components/modules/ApprovalTimeline"
import { ProcessPreview } from "../../components/modules/ProcessPreview"
import type { ProcessPreviewProps } from "../../components/modules/ProcessPreview"
import { InitiatorApproverSelector } from "../../components/modules/InitiatorApproverSelector"

export interface UseProcessCapabilitiesOptions
  extends ResolveProcessCapabilitiesParams {
  enabled?: boolean
  refreshKey?: unknown
  onError?: (error: Error) => void
}

export interface UseProcessCapabilitiesReturn {
  capabilities: ProcessCapabilities | null
  operations: ProcessCapabilityOperation[]
  timeline: Array<Record<string, unknown>>
  loading: boolean
  error: Error | null
  refresh: () => Promise<ProcessCapabilities | null>
}

const getError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error || "流程能力解析失败"))

const normalizeCapabilities = (value: unknown): ProcessCapabilities => {
  const raw = (value || {}) as ProcessCapabilities
  return {
    ...raw,
    operations: Array.isArray(raw.operations) ? raw.operations : [],
    timeline: Array.isArray(raw.timeline) ? raw.timeline : [],
  }
}

export function useProcessCapabilities(
  options: UseProcessCapabilitiesOptions,
): UseProcessCapabilitiesReturn {
  const { enabled = true, refreshKey, onError, ...params } = options
  const sdk = usePageSdk()
  const [capabilities, setCapabilities] = useState<ProcessCapabilities | null>(
    null,
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const mountedRef = useRef(true)
  const paramsKey = JSON.stringify({ ...params, refreshKey })

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const refresh = useCallback(async () => {
    if (!enabled) return capabilities
    setLoading(true)
    setError(null)
    try {
      const response = await sdk.process.resolveCapabilities<ProcessCapabilities>(
        params,
      )
      const nextCapabilities = normalizeCapabilities(response.result)
      if (mountedRef.current) {
        setCapabilities(nextCapabilities)
      }
      return nextCapabilities
    } catch (input) {
      const nextError = getError(input)
      if (mountedRef.current) {
        setError(nextError)
      }
      onError?.(nextError)
      return null
    } finally {
      if (mountedRef.current) {
        setLoading(false)
      }
    }
  }, [capabilities, enabled, onError, paramsKey, sdk])

  useEffect(() => {
    if (!enabled) return
    void refresh()
  }, [enabled, paramsKey, refresh])

  return {
    capabilities,
    operations: capabilities?.operations || [],
    timeline: capabilities?.timeline || [],
    loading,
    error,
    refresh,
  }
}

export interface ExecuteProcessOperationInput {
  comments?: string
  reason?: string
  newAssignee?: string
  targetNodeId?: string
  payload?: unknown
  submissionDepartmentId?: string
  selectedApprovers?: Record<string, string[]>
  initiatorSelectedApprovers?: Record<string, string[]>
  updateFormDataJson?: string
}

export interface UseProcessActionsOptions {
  capabilities?: ProcessCapabilities | null
  formUuid?: string
  appType?: string
  getFormValues?: () => Record<string, unknown>
  onActionComplete?: (
    action: WorkflowCapabilityActionKey,
    operation: ProcessCapabilityOperation,
  ) => Promise<void> | void
}

export interface UseProcessActionsReturn {
  loadingAction: WorkflowCapabilityActionKey | null
  executeOperation: (
    operation: ProcessCapabilityOperation,
    input?: ExecuteProcessOperationInput,
  ) => Promise<boolean>
  execute: (
    action: WorkflowCapabilityActionKey,
    input?: ExecuteProcessOperationInput,
  ) => Promise<boolean>
}

const getInstanceId = (
  operation: ProcessCapabilityOperation,
  capabilities?: ProcessCapabilities | null,
) =>
  String(
    operation.instanceId ||
      operation.formInstanceId ||
      capabilities?.instance?.id ||
      capabilities?.instance?.formInstanceId ||
      "",
  )

const getTaskId = (operation: ProcessCapabilityOperation) =>
  String(operation.taskId || "")

const requireValue = (value: string | undefined, message: string) => {
  const normalized = String(value || "").trim()
  if (!normalized) throw new Error(message)
  return normalized
}

export function useProcessActions(
  options: UseProcessActionsOptions,
): UseProcessActionsReturn {
  const { capabilities, formUuid, appType, getFormValues, onActionComplete } =
    options
  const sdk = usePageSdk()
  const [loadingAction, setLoadingAction] =
    useState<WorkflowCapabilityActionKey | null>(null)

  const buildUpdateFormDataJson = useCallback(
    (input?: ExecuteProcessOperationInput) => {
      if (input?.updateFormDataJson !== undefined) return input.updateFormDataJson
      const values = getFormValues?.()
      return values ? JSON.stringify(values) : undefined
    },
    [getFormValues],
  )

  const executeOperation = useCallback(
    async (
      operation: ProcessCapabilityOperation,
      input: ExecuteProcessOperationInput = {},
    ) => {
      if (!operation.enabled) return false
      setLoadingAction(operation.key)
      try {
        const instanceId = getInstanceId(operation, capabilities)
        const taskId = getTaskId(operation)
        if (operation.key === "startProcess") {
          const definition = capabilities?.instance?.definition as
            | Record<string, unknown>
            | undefined
          await sdk.process.startFromExistingInstance({
            appType,
            formUuid: requireValue(
              formUuid ||
                String(operation.formUuid || definition?.formUuid || ""),
              "formUuid 不能为空",
            ),
            formInstId: requireValue(instanceId, "表单实例ID不能为空"),
            formInstanceId: instanceId,
            updateFormDataJson: buildUpdateFormDataJson(input),
            submissionDepartmentId: input.submissionDepartmentId,
            selectedApprovers: input.selectedApprovers,
            initiatorSelectedApprovers:
              input.initiatorSelectedApprovers || input.selectedApprovers,
          })
        } else if (operation.key === "approve") {
          await sdk.process.approve({
            instanceId: requireValue(instanceId, "流程实例ID不能为空"),
            appType,
            formUuid,
            comments: input.comments,
            updateFormDataJson: buildUpdateFormDataJson(input),
          })
        } else if (operation.key === "reject") {
          await sdk.process.reject({
            instanceId: requireValue(instanceId, "流程实例ID不能为空"),
            appType,
            formUuid,
            comments: input.comments || input.reason,
            updateFormDataJson: buildUpdateFormDataJson(input),
          })
        } else if (operation.key === "transfer") {
          await sdk.process.transferTask({
            taskId: requireValue(taskId, "流程任务ID不能为空"),
            newAssignee: requireValue(input.newAssignee, "转交人不能为空"),
            reason: input.reason,
          })
        } else if (operation.key === "adminTransfer") {
          await sdk.process.adminTransferTask({
            taskId: requireValue(taskId, "流程任务ID不能为空"),
            newAssignee: requireValue(input.newAssignee, "转交人不能为空"),
            reason: input.reason,
          })
        } else if (operation.key === "return") {
          await sdk.process.returnTask({
            taskId: requireValue(taskId, "流程任务ID不能为空"),
            targetNodeId: requireValue(input.targetNodeId, "退回节点不能为空"),
            reason: input.reason,
          })
        } else if (operation.key === "withdraw") {
          await sdk.process.withdraw({
            instanceId: requireValue(instanceId, "流程实例ID不能为空"),
            reason: input.reason || input.comments,
          })
        } else if (operation.key === "save") {
          await sdk.process.saveTask({
            instanceId: requireValue(instanceId, "流程实例ID不能为空"),
            appType,
            formUuid: requireValue(formUuid, "formUuid 不能为空"),
            updateFormDataJson: requireValue(
              buildUpdateFormDataJson(input),
              "暂存数据不能为空",
            ),
            comments: input.comments,
          })
        } else if (operation.key === "resubmit") {
          await sdk.process.resubmitTask({
            taskId: requireValue(taskId, "流程任务ID不能为空"),
            appType,
            formUuid: requireValue(formUuid, "formUuid 不能为空"),
            updateFormDataJson: requireValue(
              buildUpdateFormDataJson(input),
              "重新提交数据不能为空",
            ),
            comments: input.comments,
            selectedApprovers: input.selectedApprovers,
            initiatorSelectedApprovers: input.selectedApprovers,
          })
        } else if (operation.key === "callback") {
          await sdk.process.triggerCallback({
            taskId: requireValue(taskId, "流程任务ID不能为空"),
            payload: input.payload,
          })
        } else if (operation.key === "retryException") {
          await sdk.process.retryException({
            instanceId: requireValue(instanceId, "流程实例ID不能为空"),
          })
        }
        await onActionComplete?.(operation.key, operation)
        return true
      } finally {
        setLoadingAction(null)
      }
    },
    [
      appType,
      buildUpdateFormDataJson,
      capabilities,
      formUuid,
      onActionComplete,
      sdk,
    ],
  )

  const execute = useCallback(
    async (
      action: WorkflowCapabilityActionKey,
      input?: ExecuteProcessOperationInput,
    ) => {
      const operation = (capabilities?.operations || []).find(
        (item) => item.key === action,
      )
      if (!operation) return false
      return executeOperation(operation, input)
    },
    [capabilities?.operations, executeOperation],
  )

  return {
    loadingAction,
    executeOperation,
    execute,
  }
}

export interface ProcessActionBarProps extends UseProcessActionsOptions {
  capabilities?: ProcessCapabilities | null
  capabilityParams?: UseProcessCapabilitiesOptions
  operations?: ProcessCapabilityOperation[]
  onRefreshCapabilities?: () => Promise<void> | void
  className?: string
  maxMobileButtons?: number
  inDrawer?: boolean
  maxWidth?: number | string
  position?: "sticky" | "fixed" | "inline"
}

type ModalAction = Extract<
  WorkflowCapabilityActionKey,
  "reject" | "transfer" | "adminTransfer" | "return" | "withdraw" | "resubmit"
>

const modalActions = new Set<WorkflowCapabilityActionKey>([
  "reject",
  "transfer",
  "adminTransfer",
  "return",
  "withdraw",
  "resubmit",
])

const actionPriority: Record<WorkflowCapabilityActionKey, number> = {
  startProcess: 5,
  approve: 10,
  resubmit: 15,
  callback: 20,
  save: 40,
  transfer: 50,
  adminTransfer: 55,
  return: 60,
  retryException: 70,
  withdraw: 80,
  reject: 90,
}

const actionTone = (
  key: WorkflowCapabilityActionKey,
): ActionConfig["type"] => {
  if (key === "startProcess" || key === "approve" || key === "resubmit") return "primary"
  if (key === "reject" || key === "withdraw") return "danger"
  return "default"
}

const actionIcon = (key: WorkflowCapabilityActionKey) => {
  if (key === "startProcess" || key === "approve") return <CheckOutlined />
  if (key === "reject") return <CloseOutlined />
  if (key === "transfer" || key === "adminTransfer") return <SwapOutlined />
  if (key === "return" || key === "withdraw") return <RollbackOutlined />
  if (key === "save") return <SaveOutlined />
  if (key === "retryException" || key === "callback") return <ReloadOutlined />
  return undefined
}

const getModalTitle = (key: ModalAction) => {
  if (key === "reject") return "拒绝理由"
  if (key === "transfer") return "转交任务"
  if (key === "adminTransfer") return "管理员转交"
  if (key === "return") return "退回任务"
  if (key === "withdraw") return "撤回流程"
  return "重新提交"
}

export const ProcessActionBar: React.FC<ProcessActionBarProps> = ({
  capabilities: controlledCapabilities,
  capabilityParams,
  operations: controlledOperations,
  formUuid,
  appType,
  getFormValues,
  onActionComplete,
  onRefreshCapabilities,
  className,
  maxMobileButtons = 2,
  inDrawer,
  maxWidth,
  position = "sticky",
}) => {
  const [form] = Form.useForm()
  const [activeOperation, setActiveOperation] =
    useState<ProcessCapabilityOperation | null>(null)
  const autoCapabilities = useProcessCapabilities({
    ...(capabilityParams || {}),
    enabled: Boolean(capabilityParams) && capabilityParams?.enabled !== false,
  })
  const capabilities = controlledCapabilities || autoCapabilities.capabilities
  const operations = controlledOperations || capabilities?.operations || []
  const actions = useProcessActions({
    capabilities,
    formUuid,
    appType,
    getFormValues,
    onActionComplete: async (action, operation) => {
      await onActionComplete?.(action, operation)
      await onRefreshCapabilities?.()
      if (capabilityParams) {
        await autoCapabilities.refresh()
      }
    },
  })

  const openOperation = (operation: ProcessCapabilityOperation) => {
    if (!operation.enabled) return
    if (modalActions.has(operation.key)) {
      const firstReturnNode = operation.returnableNodes?.[0]
      form.setFieldsValue({
        comments: "",
        reason: "",
        newAssignee: undefined,
        targetNodeId:
          typeof firstReturnNode?.nodeId === "string"
            ? firstReturnNode.nodeId
            : typeof firstReturnNode?.id === "string"
              ? firstReturnNode.id
              : undefined,
      })
      setActiveOperation(operation)
      return
    }
    void actions.executeOperation(operation)
  }

  const actionConfigs: ActionConfig[] = useMemo(
    () =>
      operations.map((operation) => ({
        key: operation.key,
        label: operation.label || operation.key,
        type: actionTone(operation.key),
        icon: actionIcon(operation.key),
        disabled: !operation.enabled,
        disabledReason: operation.disabledReason,
        visible: operation.visible !== false,
        loading: actions.loadingAction === operation.key,
        priority: actionPriority[operation.key] || 50,
        onClick: () => openOperation(operation),
      })),
    [actions.loadingAction, operations],
  )

  const handleModalOk = async () => {
    if (!activeOperation) return
    const values = await form.validateFields()
    const ok = await actions.executeOperation(activeOperation, values)
    if (ok) {
      setActiveOperation(null)
      form.resetFields()
    }
  }

  const modalKey = activeOperation?.key as ModalAction | undefined
  const returnOptions = (activeOperation?.returnableNodes || []).map((node) => {
    const value = String(node.nodeId || node.id || "")
    return {
      value,
      label: String(node.nodeName || node.name || node.label || value),
    }
  })

  return (
    <>
      <StickyActionBar
        actions={actionConfigs}
        layoutMode="approval"
        maxMobileButtons={maxMobileButtons}
        className={className}
        inDrawer={inDrawer}
        maxWidth={maxWidth}
        position={position}
      />
      <Modal
        getContainer={false}
        title={modalKey ? getModalTitle(modalKey) : "流程操作"}
        open={Boolean(activeOperation)}
        okText="确认"
        cancelText="取消"
        confirmLoading={Boolean(
          activeOperation && actions.loadingAction === activeOperation.key,
        )}
        onOk={handleModalOk}
        onCancel={() => {
          setActiveOperation(null)
          form.resetFields()
        }}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          {(modalKey === "transfer" || modalKey === "adminTransfer") && (
            <Form.Item
              name="newAssignee"
              label="接收人"
              rules={[{ required: true, message: "请输入接收人用户ID" }]}
            >
              <Input placeholder="请输入用户ID" />
            </Form.Item>
          )}
          {modalKey === "return" && (
            <Form.Item
              name="targetNodeId"
              label="退回节点"
              rules={[{ required: true, message: "请选择退回节点" }]}
            >
              <Select placeholder="请选择退回节点" options={returnOptions} />
            </Form.Item>
          )}
          <Form.Item
            name={modalKey === "reject" || modalKey === "resubmit" ? "comments" : "reason"}
            label={
              modalKey === "reject"
                ? "拒绝理由"
                : modalKey === "resubmit"
                  ? "提交意见"
                  : "说明"
            }
            rules={[
              {
                required: modalKey === "reject" || modalKey === "withdraw",
                message: "请填写说明",
              },
            ]}
          >
            <Input.TextArea rows={4} maxLength={500} showCount />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}

export interface ProcessTimelineProps
  extends Omit<ApprovalTimelineProps, "tasks"> {
  capabilities?: ProcessCapabilities | null
  tasks?: ApprovalTimelineProps["tasks"]
}

export const ProcessTimeline: React.FC<ProcessTimelineProps> = ({
  capabilities,
  tasks,
  ...props
}) => (
  <ApprovalTimeline
    {...props}
    tasks={(tasks || capabilities?.timeline || []) as ApprovalTimelineProps["tasks"]}
  />
)

export const ProcessPreviewPanel = ProcessPreview
export type ProcessPreviewPanelProps = ProcessPreviewProps
export { InitiatorApproverSelector }

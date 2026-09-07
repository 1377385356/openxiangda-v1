import type {
  ApprovalPermission,
  ApproveParams,
  ChangeRecordListResponse,
  ChangeRecordQueryParams,
  FormDataDeleteParams,
  FormDataQueryParams,
  FormInstanceData,
  FormRuntimeApi,
  InitiatorSelectCandidate,
  InitiatorSelectRequirement,
  PreviewParams,
  ProcessBasicInfo,
  ProcessDefinition,
  ProcessRoute,
  ProcessTask,
  ReturnableNode,
  ReturnableNodeResult,
  ReturnParams,
  ResubmitParams,
  RuntimeResponse,
  SaveTaskParams,
  TransferParams,
  ViewPermissionQueryParams,
  ViewPermissionSummary,
  WithdrawParams,
} from '../types';

// ============ 流程基础 ============

const hasOwn = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);

const isRuntimeEnvelope = (value: any): value is RuntimeResponse<any> =>
  !!value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  (hasOwn(value, 'code') ||
    hasOwn(value, 'success') ||
    hasOwn(value, 'data') ||
    hasOwn(value, 'result') ||
    hasOwn(value, 'message') ||
    hasOwn(value, 'error'));

const isSuccessCode = (code: unknown) => {
  if (code === undefined || code === null || code === '') return true;
  const normalized = Number(code);
  return Number.isFinite(normalized) ? normalized === 0 || normalized === 200 : false;
};

const unwrapRuntimeResponse = <T = any>(response: RuntimeResponse<T> | any): T => {
  if (!isRuntimeEnvelope(response)) return response as T;

  if (response.success === false || !isSuccessCode(response.code)) {
    throw new Error(response.message || response.error || '请求失败');
  }

  if (hasOwn(response, 'data')) return response.data as T;
  if (hasOwn(response, 'result')) return response.result as T;
  return response as T;
};

const withInitiatorSelectedApprovers = <T extends Record<string, any>>(
  payload: T,
  initiatorSelectedApprovers?: Record<string, string[]>,
): T & {
  selectedApprovers?: Record<string, string[]>;
  initiatorSelectedApprovers?: Record<string, string[]>;
} => {
  if (!initiatorSelectedApprovers) return payload;
  return {
    ...payload,
    selectedApprovers: initiatorSelectedApprovers,
    initiatorSelectedApprovers,
  };
};

const normalizeProcessTask = (value: any): ProcessTask => {
  const taskId = value?.taskId ?? value?.id ?? value?.task_id ?? '';
  return {
    ...value,
    id: value?.id ?? taskId,
    taskId,
    nodeId: value?.nodeId ?? value?.node_id ?? '',
    nodeType: value?.nodeType ?? value?.node_type ?? 'approval',
    nodeName: value?.nodeName ?? value?.title ?? value?.name ?? value?.nodeId ?? '审批节点',
    status: value?.status ?? 'pending',
    assigneeId: value?.assigneeId ?? value?.assignee,
  };
};

const normalizeProcessTasks = (value: any): ProcessTask[] => {
  if (Array.isArray(value)) return value.map(normalizeProcessTask);
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value.tasks)) return value.tasks.map(normalizeProcessTask);
  if (Array.isArray(value.currentTasks)) return value.currentTasks.map(normalizeProcessTask);
  if (Array.isArray(value.list)) return value.list.map(normalizeProcessTask);
  if (Array.isArray(value.items)) return value.items.map(normalizeProcessTask);
  if (Array.isArray(value.records)) return value.records.map(normalizeProcessTask);
  return [];
};

const normalizePreviewAssignees = (value: any): Array<{ id: string; name: string }> => {
  if (Array.isArray(value?.assignees)) {
    return value.assignees
      .map((assignee: any) => {
        if (typeof assignee === 'string' || typeof assignee === 'number') {
          const id = String(assignee);
          return { id, name: id };
        }
        const id = String(
          assignee?.id ?? assignee?.userId ?? assignee?.userid ?? assignee?.assignee ?? '',
        );
        if (!id) return null;
        return {
          id,
          name: String(assignee?.name ?? assignee?.label ?? assignee?.userName ?? id),
        };
      })
      .filter(Boolean) as Array<{ id: string; name: string }>;
  }

  const assigneeId = value?.assignee ?? value?.assigneeId;
  if (assigneeId) {
    const id = String(assigneeId);
    return [
      {
        id,
        name: String(value?.assigneeName ?? value?.assignee_name ?? value?.userName ?? id),
      },
    ];
  }

  const ids = Array.isArray(value?.allAssignees) ? value.allAssignees : [];
  const names = Array.isArray(value?.allAssigneeNames) ? value.allAssigneeNames : [];

  return ids
    .map((id: any, index: number) => {
      const normalizedId = String(id ?? '');
      if (!normalizedId) return null;
      return {
        id: normalizedId,
        name: String(names[index] ?? (ids.length === 1 ? value?.assigneeName : undefined) ?? id),
      };
    })
    .filter(Boolean) as Array<{ id: string; name: string }>;
};

const normalizePreviewRoutes = (value: any): ProcessRoute[] => {
  const raw = value?.data ?? value?.result ?? value;
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.routes)
      ? raw.routes
      : Array.isArray(raw?.tasks)
        ? raw.tasks
        : Array.isArray(raw?.nodes)
          ? raw.nodes
          : Array.isArray(raw?.items)
            ? raw.items
            : [];

  return list.map((route: any, index: number) => ({
    ...route,
    nodeId: String(route?.nodeId ?? route?.node_id ?? route?.id ?? `preview-${index}`),
    nodeName: String(
      route?.nodeName ?? route?.title ?? route?.name ?? route?.nodeId ?? `流程节点 ${index + 1}`,
    ),
    nodeType: route?.nodeType ?? route?.node_type ?? route?.type ?? 'approval',
    assignees: normalizePreviewAssignees(route),
  }));
};

const normalizeInitiatorSelectCandidate = (value: any): InitiatorSelectCandidate => {
  const id = String(value?.id ?? value?.userId ?? value?.userid ?? value?.value ?? '');
  return {
    ...value,
    id,
    name: String(value?.name ?? value?.label ?? value?.username ?? id),
  };
};

const normalizeInitiatorSelectRequirements = (value: any): InitiatorSelectRequirement[] => {
  const raw = value?.data ?? value?.result ?? value;
  const nodes = Array.isArray(raw?.nodes) ? raw.nodes : Array.isArray(raw) ? raw : [];
  return nodes
    .map((node: any) => ({
      ...node,
      nodeId: String(node?.nodeId ?? node?.id ?? ''),
      nodeName: String(node?.nodeName ?? node?.name ?? node?.title ?? node?.nodeId ?? ''),
      scope: node?.scope ?? node?.initiatorSelectScope ?? 'all',
      approvals: Array.isArray(node?.approvals) ? node.approvals : [],
      approvalNames: Array.isArray(node?.approvalNames) ? node.approvalNames : [],
      candidateUsers: Array.isArray(node?.candidateUsers)
        ? node.candidateUsers.map(normalizeInitiatorSelectCandidate).filter((user: any) => user.id)
        : undefined,
    }))
    .filter((node: InitiatorSelectRequirement) => node.nodeId);
};

const normalizeProcessBasic = (value: any): ProcessBasicInfo => {
  const raw = value ?? {};
  const instance = raw.instance ?? raw;
  const currentTask = raw.currentTask ? normalizeProcessTask(raw.currentTask) : undefined;

  return {
    ...raw,
    instanceId: raw.instanceId ?? raw.id ?? instance.formInstanceId ?? instance.id,
    processStatus: raw.processStatus ?? raw.status ?? instance.processStatus ?? instance.status,
    formUuid: raw.formUuid ?? instance.formUuid ?? instance.definition?.formUuid,
    appType: raw.appType ?? instance.appType ?? instance.definition?.appType,
    title: raw.title ?? instance.title ?? instance.instanceTitle,
    originatorId: raw.originatorId ?? instance.originatorId ?? instance.startedBy,
    originatorName: raw.originatorName ?? instance.originatorName ?? instance.startedByName,
    originatorDepartment:
      raw.originatorDepartment ?? instance.originatorDepartment ?? instance.startedDepartmentName,
    createdAt: raw.createdAt ?? instance.createdAt ?? instance.startedAt,
    currentTask,
    isExecuting: raw.isExecuting ?? instance.isExecuting,
  };
};

const normalizeApprovalPermission = (value: any): ApprovalPermission => {
  const raw = value ?? {};
  const currentTasks = normalizeProcessTasks(raw.currentTasks);
  const hasPermission = Boolean(raw.hasPermission ?? raw.isApprover ?? currentTasks.length > 0);

  return {
    ...raw,
    hasPermission,
    isApprover: Boolean(raw.isApprover ?? hasPermission),
    canUndo: Boolean(raw.canUndo ?? raw.canWithdraw),
    currentTasks,
  };
};

const normalizeReturnableNodes = (value: any): ReturnableNode[] => {
  const raw = value?.candidates || value?.nodes || value?.data || value;
  if (!Array.isArray(raw)) return [];
  return raw.map((node) => ({
    ...node,
    nodeId: node?.nodeId || node?.id || '',
    nodeName: node?.nodeName || node?.name || node?.title || node?.id || '',
  }));
};

const normalizeReturnableNodeResult = (value: any): ReturnableNodeResult => {
  const raw = value?.data || value || {};
  return {
    nodes: normalizeReturnableNodes(raw),
    policy: raw?.policy || null,
  };
};

const normalizeProcessDefinition = (value: any): ProcessDefinition => {
  const raw = value?.definitionJson || value?.viewJson || value || {};
  const nodes = Array.isArray(raw.nodes) ? raw.nodes : [];
  const startNode = nodes.find((node: any) => node?.type === 'start' || node?.nodeType === 'start');
  return {
    ...raw,
    processId: raw.processId || raw.id || value?.id || '',
    flowConfig: raw.flowConfig || value?.flowConfig || {},
    startNodeId: raw.startNodeId || startNode?.id || value?.startNodeId,
  };
};

/** 获取流程基本信息 */
export async function getProcessBasic(
  request: FormRuntimeApi['request'],
  formInstId: string,
): Promise<ProcessBasicInfo> {
  const response = (await request<ProcessBasicInfo>({
    url: `/workflow/instance/${formInstId}/basic`,
    method: 'get',
  })) as RuntimeResponse<ProcessBasicInfo>;
  return normalizeProcessBasic(unwrapRuntimeResponse(response));
}

/** 获取流程进度（任务列表） */
export async function getProcessProgress(
  request: FormRuntimeApi['request'],
  formInstId: string,
): Promise<ProcessTask[]> {
  const response = (await request<any>({
    url: `/workflow/instance/${formInstId}/all-tasks`,
    method: 'get',
  })) as RuntimeResponse<any>;
  return normalizeProcessTasks(unwrapRuntimeResponse(response));
}

/** 检查当前用户审批权限 */
export async function checkUserApproval(
  request: FormRuntimeApi['request'],
  formInstId: string,
): Promise<ApprovalPermission> {
  const response = (await request<ApprovalPermission>({
    url: `/workflow/instance/${formInstId}/permission`,
    method: 'get',
  })) as RuntimeResponse<ApprovalPermission>;
  return normalizeApprovalPermission(unwrapRuntimeResponse(response));
}

// ============ 审批操作 ============

/** 审批（同意/拒绝） */
export async function handleApproval(
  request: FormRuntimeApi['request'],
  params: ApproveParams,
): Promise<any> {
  const response = (await request<any>({
    url: '/workflow/approve',
    method: 'post',
    data: params,
  })) as RuntimeResponse<any>;
  return unwrapRuntimeResponse(response);
}

/** 撤销流程 */
export async function withdrawProcess(
  request: FormRuntimeApi['request'],
  params: WithdrawParams,
): Promise<any> {
  const response = (await request<any>({
    url: `/workflow/instance/${params.instanceId}/withdraw`,
    method: 'post',
    data: { reason: params.reason },
  })) as RuntimeResponse<any>;
  return unwrapRuntimeResponse(response);
}

/** 转交任务 */
export async function transferTask(
  request: FormRuntimeApi['request'],
  params: TransferParams,
): Promise<any> {
  const response = (await request<any>({
    url: `/workflow/task/${params.taskId}/transfer`,
    method: 'post',
    data: { newAssignee: params.newAssignee, reason: params.reason },
  })) as RuntimeResponse<any>;
  return unwrapRuntimeResponse(response);
}

/** 退回任务 */
export async function returnTask(
  request: FormRuntimeApi['request'],
  params: ReturnParams,
): Promise<any> {
  const response = (await request<any>({
    url: `/workflow/task/${params.taskId}/return`,
    method: 'post',
    data: { targetNodeId: params.targetNodeId, reason: params.reason },
  })) as RuntimeResponse<any>;
  return unwrapRuntimeResponse(response);
}

/** 重新提交任务 */
export async function resubmitTask(
  request: FormRuntimeApi['request'],
  params: ResubmitParams,
): Promise<any> {
  const initiatorSelectedApprovers = params.initiatorSelectedApprovers || params.selectedApprovers;
  const response = (await request<any>({
    url: `/workflow/task/${params.taskId}/resubmit`,
    method: 'post',
    data: withInitiatorSelectedApprovers(
      {
        formUuid: params.formUuid,
        appType: params.appType,
        updateFormDataJson: params.updateFormDataJson,
        comments: params.comments,
      },
      initiatorSelectedApprovers,
    ),
  })) as RuntimeResponse<any>;
  return unwrapRuntimeResponse(response);
}

/** 暂存任务 */
export async function saveTask(
  request: FormRuntimeApi['request'],
  params: SaveTaskParams,
): Promise<any> {
  const response = (await request<any>({
    url: '/workflow/task/save',
    method: 'post',
    data: params,
  })) as RuntimeResponse<any>;
  return unwrapRuntimeResponse(response);
}

/** 获取可退回节点 */
export async function getReturnableNodes(
  request: FormRuntimeApi['request'],
  taskId: string,
): Promise<ReturnableNode[]> {
  const result = await getReturnableNodeResult(request, taskId);
  return result.nodes;
}

/** 获取可退回节点和退回策略 */
export async function getReturnableNodeResult(
  request: FormRuntimeApi['request'],
  taskId: string,
): Promise<ReturnableNodeResult> {
  const response = (await request<ReturnableNode[]>({
    url: `/workflow/task/${taskId}/returnable-nodes`,
    method: 'get',
  })) as RuntimeResponse<ReturnableNode[]>;
  return normalizeReturnableNodeResult(unwrapRuntimeResponse(response));
}

// ============ 流程预览和定义 ============

/** 预览流程路由 */
export async function previewProcess(
  request: FormRuntimeApi['request'],
  params: PreviewParams,
): Promise<ProcessRoute[]> {
  const initiatorSelectedApprovers = params.initiatorSelectedApprovers || params.selectedApprovers;
  const response = (await request<ProcessRoute[]>({
    url: '/workflow/preview',
    method: 'post',
    data: withInitiatorSelectedApprovers(params, initiatorSelectedApprovers),
  })) as RuntimeResponse<ProcessRoute[]>;
  return normalizePreviewRoutes(unwrapRuntimeResponse(response));
}

export async function getInitiatorSelectRequirements(
  request: FormRuntimeApi['request'],
  params: {
    formUuid: string;
    appType: string;
    data: Record<string, any>;
    submissionDepartmentId?: string;
  },
): Promise<InitiatorSelectRequirement[]> {
  const response = (await request<any>({
    url: '/workflow/initiator-approver/requirements',
    method: 'post',
    data: params,
  })) as RuntimeResponse<any>;
  return normalizeInitiatorSelectRequirements(unwrapRuntimeResponse(response));
}

export async function getResubmitInitiatorSelectRequirements(
  request: FormRuntimeApi['request'],
  params: {
    taskId: string;
    formUuid: string;
    appType: string;
    data: Record<string, any>;
  },
): Promise<InitiatorSelectRequirement[]> {
  const response = (await request<any>({
    url: `/workflow/task/${params.taskId}/resubmit/initiator-approver/requirements`,
    method: 'post',
    data: {
      formUuid: params.formUuid,
      appType: params.appType,
      data: params.data,
    },
  })) as RuntimeResponse<any>;
  return normalizeInitiatorSelectRequirements(unwrapRuntimeResponse(response));
}

export async function getInitiatorSelectCandidates(
  request: FormRuntimeApi['request'],
  params: {
    formUuid: string;
    appType: string;
    nodeId: string;
    page?: number;
    pageSize?: number;
    keyword?: string;
    departmentId?: string;
  },
): Promise<{
  items: InitiatorSelectCandidate[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const response = (await request<any>({
    url: '/workflow/initiator-select/candidates',
    method: 'get',
    params,
  })) as RuntimeResponse<any>;
  const raw = unwrapRuntimeResponse(response) || {};
  const items = Array.isArray(raw.items) ? raw.items : [];
  return {
    items: items
      .map(normalizeInitiatorSelectCandidate)
      .filter((user: InitiatorSelectCandidate) => user.id),
    total: Number(raw.total || items.length || 0),
    page: Number(raw.page || params.page || 1),
    pageSize: Number(raw.pageSize || params.pageSize || 50),
  };
}

/** 获取流程定义 */
export async function getProcessDefinition(
  request: FormRuntimeApi['request'],
  formUuid: string,
): Promise<ProcessDefinition> {
  const response = (await request<ProcessDefinition>({
    url: '/workflow/definition/form',
    method: 'get',
    params: { formUuid },
  })) as RuntimeResponse<ProcessDefinition>;
  return normalizeProcessDefinition(unwrapRuntimeResponse(response));
}

/** 触发回调等待任务 */
export async function triggerCallbackTask(
  request: FormRuntimeApi['request'],
  params: { taskId: string; payload?: Record<string, any> },
): Promise<any> {
  const response = (await request<any>({
    url: `/workflow/task/${params.taskId}/callback`,
    method: 'post',
    data: params.payload || {},
  })) as RuntimeResponse<any>;
  return unwrapRuntimeResponse(response);
}

// ============ 表单详情 ============

/** 获取表单实例数据 */
export async function getFormData(
  request: FormRuntimeApi['request'],
  params: FormDataQueryParams,
): Promise<FormInstanceData> {
  const response = (await request<FormInstanceData>({
    url: '/form/queryFormDataByFormInstanceId',
    method: 'get',
    params,
  })) as RuntimeResponse<FormInstanceData>;
  return unwrapRuntimeResponse(response);
}

/** 删除表单数据 */
export async function deleteFormData(
  request: FormRuntimeApi['request'],
  params: FormDataDeleteParams,
): Promise<any> {
  const response = (await request<any>({
    url: `/${params.appType}/v1/form/deleteFormData.json`,
    method: 'post',
    data: {
      appType: params.appType,
      formUuid: params.formUuid,
      formInstId: params.formInstanceId,
    },
  })) as RuntimeResponse<any>;
  return unwrapRuntimeResponse(response);
}

/** 获取表单变更记录 */
export async function getChangeRecords(
  request: FormRuntimeApi['request'],
  params: ChangeRecordQueryParams,
): Promise<ChangeRecordListResponse> {
  const response = (await request<ChangeRecordListResponse>({
    url: '/form/getFormDataChangeRecords',
    method: 'get',
    params,
  })) as RuntimeResponse<ChangeRecordListResponse>;
  return unwrapRuntimeResponse(response);
}

/** 获取视图权限摘要 */
export async function getViewPermission(
  request: FormRuntimeApi['request'],
  params: ViewPermissionQueryParams,
): Promise<ViewPermissionSummary> {
  const response = (await request<ViewPermissionSummary>({
    url: '/permission/form-group/view-permissions',
    method: 'get',
    params,
  })) as RuntimeResponse<ViewPermissionSummary>;
  return unwrapRuntimeResponse(response);
}

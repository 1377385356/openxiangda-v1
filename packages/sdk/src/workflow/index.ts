export type WorkflowNodeRef = string;

export interface WorkflowCompileResult {
  definitionJson: {
    version: "v3";
    nodes: any[];
    edges: any[];
    flowConfig: Record<string, any[]>;
    globalSettings: Record<string, any>;
  };
  previewJson: {
    kind: "workflow_code_preview";
    version: "preview_v1";
    steps: any[];
    edges: any[];
    sourceMode: "workflow_code_ts";
  };
}

export interface WorkflowDefinitionInput {
  name?: string;
  formCode?: string;
  formUuid?: string;
  globalSettings?: Record<string, any>;
  build: (flow: WorkflowBuilder) => void;
}

export interface WorkflowDeclarativeInput {
  id?: string;
  name?: string;
  formCode?: string;
  formUuid?: string;
  globalSettings?: Record<string, any>;
  nodes: WorkflowDeclarativeNode[];
  edges?: WorkflowDeclarativeEdge[];
}

export interface WorkflowDeclarativeNode {
  __openxiangdaWorkflowNode: true;
  id: WorkflowNodeRef;
  type: string;
  data: NodeOptions;
}

export interface WorkflowDeclarativeEdge {
  __openxiangdaWorkflowEdge: true;
  source: WorkflowNodeRef;
  target: WorkflowNodeRef;
  data?: NodeOptions;
}

type NodeOptions = Record<string, any>;

function sanitizeId(value: string) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_");
}

function createPosition(index: number) {
  return { x: 400, y: 100 + index * 150 };
}

function hasRequiredValue(value: any) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function validateCompiledWorkflowDefinition(definitionJson: WorkflowCompileResult["definitionJson"]) {
  const errors: string[] = [];
  for (const node of definitionJson.nodes || []) {
    const nodeId = node?.id || "<unknown>";
    const data = node?.data || {};
    switch (node?.type) {
      case "function_call":
        if (!hasRequiredValue(data.functionCode)) {
          errors.push(`function_call node ${nodeId} requires functionCode`);
        }
        break;
      case "callback_wait":
        if (!hasRequiredValue(data.eventCode)) {
          errors.push(`callback_wait node ${nodeId} requires eventCode`);
        }
        break;
      case "work_notification":
        if (
          !hasRequiredValue(data.title) ||
          !hasRequiredValue(data.content) ||
          !hasRequiredValue(data.recipientType)
        ) {
          errors.push(`work_notification node ${nodeId} requires title, content, and recipientType`);
        }
        break;
      default:
        break;
    }
  }
  if (errors.length > 0) {
    throw new Error(`workflow DSL validation failed:\n- ${errors.join("\n- ")}`);
  }
}

function normalizeAction(action: string, label: string, extra: NodeOptions = {}) {
  return {
    action,
    name: { zh_CN: label },
    ...extra,
  };
}

const workflowActions = {
  approve: (label = "同意", extra: NodeOptions = {}) =>
    normalizeAction("agree", label, extra),
  reject: (label = "拒绝", extra: NodeOptions = {}) =>
    normalizeAction("rejected", label, extra),
  transfer: (label = "转交", extra: NodeOptions = {}) =>
    normalizeAction("transfer", label, {
      remark: { popUp: true, required: false },
      ...extra,
    }),
  return: (label = "退回", extra: NodeOptions = {}) =>
    normalizeAction("return", label, {
      remark: { popUp: true, required: false },
      ...extra,
    }),
  returnToInitiator: (label = "退回发起人", extra: NodeOptions = {}) =>
    normalizeAction("return", label, {
      remark: { popUp: true, required: false },
      returnTarget: "initiator",
      returnScope: "initiator",
      ...extra,
    }),
  save: (label = "暂存", extra: NodeOptions = {}) =>
    normalizeAction("save", label, extra),
  withdraw: (label = "撤回", extra: NodeOptions = {}) =>
    normalizeAction("withdraw", label, extra),
  resubmit: (label = "重新提交", extra: NodeOptions = {}) =>
    normalizeAction("resubmit", label, extra),
  callback: (label = "触发回调", extra: NodeOptions = {}) =>
    normalizeAction("callback", label, extra),
  retryException: (label = "重试异常", extra: NodeOptions = {}) =>
    normalizeAction("retryException", label, extra),
  adminTransfer: (label = "管理员转交", extra: NodeOptions = {}) =>
    normalizeAction("adminTransfer", label, extra),
};

function normalizeReturnConfig(value: any) {
  if (value === false) return { enabled: false };
  if (value === true || value === undefined) {
    return { enabled: true, scopeType: "previous_all" };
  }
  return {
    enabled: value.enabled !== false,
    scopeType: value.scopeType || value.scope || "previous_all",
    resubmitMode: value.resubmitMode || "resume_current",
    ...value,
  };
}

function findInitiatorReturnAction(actions: any[]) {
  return actions.find(
    (action) =>
      action?.action === "return" &&
      (action.returnTarget === "initiator" || action.returnScope === "initiator"),
  );
}

function inferReturnConfigFromActions(actions: any[], explicitReturnConfig?: any) {
  const initiatorReturnAction = findInitiatorReturnAction(actions);
  if (!initiatorReturnAction) return explicitReturnConfig;

  const base =
    explicitReturnConfig ||
    normalizeReturnConfig({
      scopeType: "initiator",
      resubmitMode: initiatorReturnAction.resubmitMode || "replay",
    });

  return {
    ...base,
    scopeType: base.scopeType || "initiator",
    allowOriginatorReturn: true,
  };
}

function normalizeFieldBehavior(value: any) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["normal", "edit", "editable", "write", "writable"].includes(normalized)) return "NORMAL";
  if (["readonly", "read", "view", "visible"].includes(normalized)) return "READONLY";
  if (["hidden", "hide", "invisible"].includes(normalized)) return "HIDDEN";
  return String(value || "READONLY").toUpperCase();
}

function normalizeFieldPermissions(value: any): any[] | undefined {
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (!item || typeof item !== "object") return item;
      return {
        ...item,
        fieldId: item.fieldId || item.field || item.id,
        fieldBehavior: normalizeFieldBehavior(item.fieldBehavior || item.behavior || item.permission),
      };
    });
  }
  if (value && typeof value === "object") {
    return Object.entries(value).map(([fieldId, fieldBehavior]) => ({
      fieldId,
      fieldBehavior: normalizeFieldBehavior(fieldBehavior),
    }));
  }
  return undefined;
}

function normalizeConditionRule(rule: any): any {
  if (!rule || typeof rule !== "object") return rule;
  if (Array.isArray(rule)) return rule.map(normalizeConditionRule);

  const normalized: NodeOptions = { ...rule };
  const fieldId = rule.id || rule.fieldId || rule.field || rule.key || rule.column;
  const operator = rule.opCode || rule.op || rule.operator;
  const componentType = rule.componentType || rule.componentName;

  if (Array.isArray(rule.rules)) {
    normalized.rules = rule.rules.map(normalizeConditionRule);
  }
  if (fieldId) {
    normalized.id = normalized.id || fieldId;
    normalized.fieldId = normalized.fieldId || fieldId;
  }
  if (operator) {
    normalized.opCode = normalized.opCode || operator;
    normalized.operator = normalized.operator || operator;
  }
  if (componentType) {
    normalized.componentType = normalized.componentType || componentType;
  }

  return normalized;
}

function createDeclarativeNode(
  type: string,
  id: string,
  data: NodeOptions = {},
): WorkflowDeclarativeNode {
  return {
    __openxiangdaWorkflowNode: true,
    id: sanitizeId(id),
    type,
    data,
  };
}

function createDeclarativeEdge(
  source: WorkflowNodeRef,
  target: WorkflowNodeRef,
  data: NodeOptions = {},
): WorkflowDeclarativeEdge {
  return {
    __openxiangdaWorkflowEdge: true,
    source,
    target,
    data,
  };
}

function isDeclarativeInput(input: any): input is WorkflowDeclarativeInput {
  return input && Array.isArray(input.nodes);
}

function isWorkflowNodeDescriptor(value: any): value is WorkflowDeclarativeNode {
  return Boolean(value?.__openxiangdaWorkflowNode);
}

function normalizeAssignee(value: any) {
  if (typeof value === "string") {
    return { type: value === "originator" ? "originator" : "user", id: value, name: value };
  }
  return value || {};
}

function normalizeApprovalData(data: NodeOptions = {}) {
  const normalized: NodeOptions = { ...data };
  const assignees = Array.isArray(data.assignees)
    ? data.assignees.map(normalizeAssignee)
    : undefined;

  if (assignees && !normalized.approverType) {
    const supervisor = assignees.find((item) => item.type === "department_supervisor");
    const initiatorSelect = assignees.find((item) => item.type === "initiator_select");
    const roleAssignees = assignees.filter((item) => item.type === "role");
    const userAssignees = assignees.filter((item) => item.type === "user" || item.type === "originator");

    if (supervisor) {
      normalized.approverType = "ext_target_approval_department_supervisor";
      normalized.supervisorConfig = {
        level: supervisor.level || 1,
        fallbackToAncestorSupervisor: supervisor.fallbackToAncestorSupervisor !== false,
        ...(normalized.supervisorConfig || {}),
      };
      normalized.approvals = normalized.approvals || [];
      normalized.approvalNames = normalized.approvalNames || [];
    } else if (initiatorSelect) {
      normalized.approverType = "ext_target_approval_initiator_select";
      normalized.initiatorSelectScope = initiatorSelect.scope || initiatorSelect.initiatorSelectScope || "all";
      normalized.approvals =
        normalized.approvals ||
        (Array.isArray(initiatorSelect.approvals)
          ? initiatorSelect.approvals
          : roleAssignees.map((item) => item.id).filter(Boolean));
      normalized.approvalNames =
        normalized.approvalNames ||
        (Array.isArray(initiatorSelect.approvalNames)
          ? initiatorSelect.approvalNames
          : roleAssignees.map((item) => item.name || item.id).filter(Boolean));
    } else if (roleAssignees.length > 0 && userAssignees.length === 0) {
      normalized.approverType = "ext_target_approval_role";
      normalized.approvals = normalized.approvals || roleAssignees.map((item) => item.id).filter(Boolean);
      normalized.approvalNames =
        normalized.approvalNames || roleAssignees.map((item) => item.name || item.id).filter(Boolean);
    } else {
      normalized.approverType = "ext_target_approval";
      normalized.approvals =
        normalized.approvals ||
        userAssignees
          .map((item) => (item.type === "originator" ? "originator" : item.id))
          .filter(Boolean);
      normalized.approvalNames =
        normalized.approvalNames ||
        userAssignees
          .map((item) => item.name || (item.type === "originator" ? "发起人" : item.id))
          .filter(Boolean);
    }
  }

  return normalized;
}

export class WorkflowBuilder {
  private nodes: any[] = [];
  private edges: any[] = [];
  private flowConfig: Record<string, any[]> = {};
  private globalSettings: Record<string, any> = {};
  readonly action = workflowActions;

  constructor(private readonly meta: Omit<WorkflowDefinitionInput, "build"> = {}) {
    this.globalSettings = { ...(meta.globalSettings || {}) };
  }

  start(id = "start", data: NodeOptions = {}): WorkflowNodeRef {
    return this.node("start", id, { label: "开始节点", ...data });
  }

  end(id = "end", data: NodeOptions = {}): WorkflowNodeRef {
    return this.node("end", id, { label: "结束节点", ...data });
  }

  approval(id: string, data: NodeOptions): WorkflowNodeRef {
    const approvalData = normalizeApprovalData(data);
    const actions =
      approvalData.buttons || approvalData.actions || [
        this.action.approve(),
        this.action.reject(),
      ];
    const returnConfig =
      approvalData.returnConfig !== undefined
        ? normalizeReturnConfig(approvalData.returnConfig)
        : approvalData.returnPolicy !== undefined
          ? normalizeReturnConfig(approvalData.returnPolicy)
          : undefined;
    const inferredReturnConfig = inferReturnConfigFromActions(actions, returnConfig);
    return this.node("approval", id, {
      label: approvalData.label || "审批",
      value: approvalData.value || "",
      approverType: approvalData.approverType || "ext_target_approval",
      approvals: approvalData.approvals || [],
      approvalNames: approvalData.approvalNames || [],
      multiApprove: approvalData.multiApprove || "or",
      ...approvalData,
      actions,
      ...(inferredReturnConfig ? { returnConfig: inferredReturnConfig } : {}),
    });
  }

  copy(id: string, data: NodeOptions): WorkflowNodeRef {
    return this.node("copy", id, {
      label: data.label || "抄送",
      value: data.value || "",
      approverType: data.approverType || "ext_target_approval",
      approvals: data.approvals || [],
      approvalNames: data.approvalNames || [],
      ...data,
    });
  }

  jsCode(id: string, data: NodeOptions): WorkflowNodeRef {
    return this.node("js_code", id, {
      label: data.label || "JS代码节点",
      runtimeMode: "trusted_node",
      sourceType: data.sourceFile ? "file_snapshot" : data.sourceType || "inline",
      timeout: data.timeout || data.timeoutMs || 30000,
      ...data,
    });
  }

  functionCall(id: string, data: NodeOptions): WorkflowNodeRef {
    return this.node("function_call", id, {
      label: data.label || "调用函数",
      functionCode: data.functionCode || data.functionName || data.code,
      input: data.input || data.inputMapping || {},
      saveResponseTo: data.saveResponseTo || data.outputKey,
      timeout: data.timeout || data.timeoutMs || 30000,
      ...data,
    });
  }

  callbackWait(id: string, data: NodeOptions): WorkflowNodeRef {
    return this.node("callback_wait", id, {
      type: "callback_wait",
      label: data.label || "回调等待",
      timeoutSeconds: data.timeoutSeconds || 86400,
      timeoutStrategy: data.timeoutStrategy || "FAIL",
      ...data,
    });
  }

  connectorCall(id: string, data: NodeOptions): WorkflowNodeRef {
    return this.node("connector_call", id, {
      type: "connector_call",
      label: data.label || "连接器",
      timeout: data.timeout || 30000,
      ...data,
    });
  }

  workNotification(id: string, data: NodeOptions): WorkflowNodeRef {
    return this.node("work_notification", id, {
      label: data.label || "工作通知",
      buttonText: data.buttonText || "查看详情",
      linkType: data.linkType || "current_form",
      ...data,
    });
  }

  notification(id: string, data: NodeOptions): WorkflowNodeRef {
    return this.workNotification(id, data);
  }

  dingtalkCard(id: string, data: NodeOptions): WorkflowNodeRef {
    return this.node("dingtalk_card", id, {
      config: {
        type: "dingtalk_card",
        label: data.label || "钉钉消息卡片",
        sameFieldStrategy: "create",
        ...(data.config || data),
      },
    });
  }

  condition(id: string, data: NodeOptions): WorkflowNodeRef {
    const condition = normalizeConditionRule(
      data.condition || { ruleType: "group", condition: "AND", rules: [] },
    );
    return this.node("condition_branch", id, {
      type: "condition_branch",
      label: data.label || "条件分支",
      isElse: data.isElse === true,
      priority: data.priority || "1",
      trueNodeId: data.trueNodeId,
      falseNodeId: data.falseNodeId,
      ...data,
      condition,
    });
  }

  branch(id: string, data: NodeOptions = {}): WorkflowNodeRef {
    return this.node("branch", id, {
      label: data.label || "辅助分支",
      isAuxNode: data.isAuxNode ?? true,
      branchType: data.branchType || "condition_controller",
      ...data,
    });
  }

  parallel(
    id: string,
    branches: Array<{
      id: string;
      label?: string;
      nodes: WorkflowNodeRef[];
    }>,
    data: NodeOptions = {},
  ) {
    const branchId = sanitizeId(id);
    const entryId = sanitizeId(`${id}_branch`);
    const convergeId = sanitizeId(`${id}_converge`);
    const entry = this.branch(entryId, {
      label: data.label || "并行分支",
      branchType: "parallel",
      branchId,
      branchControllerId: entryId,
      convergeNodeId: convergeId,
      hidden: true,
    });
    const converge = this.branch(convergeId, {
      label: data.convergeLabel || "并行汇聚",
      branchType: "converge",
      branchId,
      branchControllerId: entryId,
      convergeNodeId: convergeId,
      hidden: true,
    });

    branches.forEach((branch, index) => {
      const nodes = branch.nodes.filter(Boolean);
      if (nodes.length === 0) return;
      this.edge(entry, nodes[0], {
        id: `edge_${entry}_${sanitizeId(branch.id || String(index))}`,
        label: branch.label,
      });
      this.sequence(...nodes);
      this.edge(nodes[nodes.length - 1], converge, {
        id: `edge_${sanitizeId(branch.id || String(index))}_${converge}`,
      });
    });

    return { entry, converge };
  }

  conditionBranches(
    id: string,
    branches: Array<{
      id: string;
      label?: string;
      condition?: any;
      nodes: WorkflowNodeRef[];
      isElse?: boolean;
    }>,
    data: NodeOptions = {},
  ) {
    const branchId = sanitizeId(id);
    const entryId = sanitizeId(`${id}_controller`);
    const convergeId = sanitizeId(`${id}_converge`);
    const entry = this.branch(entryId, {
      label: data.label || "条件分支",
      branchType: "condition_controller",
      branchId,
      branchControllerId: entryId,
      convergeNodeId: convergeId,
      hidden: true,
    });
    const converge = this.branch(convergeId, {
      label: data.convergeLabel || "条件汇聚",
      branchType: "converge",
      branchId,
      branchControllerId: entryId,
      convergeNodeId: convergeId,
      hidden: true,
    });

    branches.forEach((branch, index) => {
      const condition = this.condition(`${id}_${branch.id}`, {
        label: branch.label || (branch.isElse ? "其他情况" : `条件 ${index + 1}`),
        condition:
          branch.condition || {
            ruleType: "group",
            condition: "AND",
            rules: [],
          },
        isElse: branch.isElse === true,
        priority: String(index + 1),
        branchId,
        branchControllerId: entryId,
        convergeNodeId: convergeId,
      });
      this.edge(entry, condition, {
        id: `edge_${entry}_${condition}`,
        label: branch.label,
      });
      const nodes = branch.nodes.filter(Boolean);
      if (nodes.length > 0) {
        this.edge(condition, nodes[0], {
          id: `edge_${condition}_${nodes[0]}`,
          label: branch.label,
        });
        this.sequence(...nodes);
        this.edge(nodes[nodes.length - 1], converge, {
          id: `edge_${nodes[nodes.length - 1]}_${converge}`,
        });
      } else {
        this.edge(condition, converge, {
          id: `edge_${condition}_${converge}`,
        });
      }
    });

    if (!branches.some((branch) => branch.isElse)) {
      const elseNode = this.condition(`${id}_else`, {
        label: "其他情况",
        isElse: true,
        priority: String(branches.length + 1),
        condition: { ruleType: "group", condition: "AND", rules: [] },
        branchId,
        branchControllerId: entryId,
        convergeNodeId: convergeId,
      });
      this.edge(entry, elseNode, { id: `edge_${entry}_${elseNode}`, label: "其他情况" });
      this.edge(elseNode, converge, { id: `edge_${elseNode}_${converge}` });
    }

    return { entry, converge };
  }

  data = {
    retrieveSingle: (id: string, data: NodeOptions) =>
      this.node("data_retrieve_single", id, {
        type: "data_retrieve_single",
        label: data.label || "获取单条数据",
        filterType: data.filterType || "condition",
        ...data,
      }),
    retrieveBatch: (id: string, data: NodeOptions) =>
      this.node("data_retrieve_batch", id, {
        type: "data_retrieve_batch",
        label: data.label || "获取多条数据",
        filterType: data.filterType || "condition",
        ...data,
      }),
    create: (id: string, data: NodeOptions) =>
      this.node("data_create", id, {
        type: "data_create",
        label: data.label || "新增数据",
        insertType: data.insertType || "form",
        assignments: data.assignments || [],
        ...data,
      }),
    update: (id: string, data: NodeOptions) =>
      this.node("data_update", id, {
        type: "data_update",
        label: data.label || "更新数据",
        updateType: data.updateType || "direct_form",
        assignments: data.assignments || [],
        noneOperation: data.noneOperation || "ignored",
        ...data,
      }),
  };

  node(type: string, id: string, data: NodeOptions): WorkflowNodeRef {
    const nodeId = sanitizeId(id);
    if (!nodeId) throw new Error("workflow node id is required");
    if (this.nodes.some((node) => node.id === nodeId)) {
      throw new Error(`duplicate workflow node id: ${nodeId}`);
    }
    this.nodes.push({
      id: nodeId,
      type,
      data,
      position: createPosition(this.nodes.length),
    });
    const fieldPermissions = normalizeFieldPermissions(data.fieldPermissions);
    if (fieldPermissions) {
      this.flowConfig[nodeId] = fieldPermissions;
    }
    return nodeId;
  }

  edge(source: WorkflowNodeRef, target: WorkflowNodeRef, data: NodeOptions = {}) {
    const id = data.id || `edge_${source}_${target}`;
    this.edges.push({
      id,
      source,
      target,
      type: data.type || "custom",
      ...(data.label ? { label: data.label } : {}),
    });
  }

  connect(source: WorkflowNodeRef, target: WorkflowNodeRef, data: NodeOptions = {}) {
    this.edge(source, target, data);
  }

  sequence(...refs: WorkflowNodeRef[]) {
    for (let index = 0; index < refs.length - 1; index += 1) {
      this.edge(refs[index], refs[index + 1]);
    }
  }

  setFieldPermissions(nodeId: WorkflowNodeRef, permissions: any[]) {
    this.flowConfig[nodeId] = permissions;
  }

  setGlobalSettings(settings: Record<string, any>) {
    this.globalSettings = { ...this.globalSettings, ...settings };
  }

  compile(): WorkflowCompileResult {
    const definitionJson = {
      version: "v3" as const,
      nodes: this.nodes,
      edges: this.edges,
      flowConfig: this.flowConfig,
      globalSettings: this.globalSettings,
    };
    validateCompiledWorkflowDefinition(definitionJson);
    return {
      definitionJson,
      previewJson: {
        kind: "workflow_code_preview",
        version: "preview_v1",
        sourceMode: "workflow_code_ts",
        steps: this.nodes.map((node) => ({
          id: node.id,
          type: node.type,
          label: node.data?.label || node.id,
          config: node.data,
        })),
        edges: this.edges.map((edge) => ({
          source: edge.source,
          target: edge.target,
          label: edge.label,
        })),
      },
    };
  }
}

export function defineWorkflow(input: WorkflowDefinitionInput) {
  return {
    __openxiangdaWorkflow: true,
    compile() {
      const builder = new WorkflowBuilder(input);
      input.build(builder);
      return builder.compile();
    },
  };
}

function addDeclarativeNode(builder: WorkflowBuilder, node: WorkflowDeclarativeNode) {
  if (!isWorkflowNodeDescriptor(node)) {
    throw new Error("workflow declarative nodes must be created by flow.* helpers");
  }

  switch (node.type) {
    case "start":
      builder.start(node.id, node.data);
      return;
    case "end":
      builder.end(node.id, node.data);
      return;
    case "approval":
      builder.approval(node.id, node.data);
      return;
    case "copy":
      builder.copy(node.id, node.data);
      return;
    case "js_code":
      builder.jsCode(node.id, node.data);
      return;
    case "function_call":
      builder.functionCall(node.id, node.data);
      return;
    case "callback_wait":
      builder.callbackWait(node.id, node.data);
      return;
    case "connector_call":
      builder.connectorCall(node.id, node.data);
      return;
    case "work_notification":
      builder.workNotification(node.id, node.data);
      return;
    case "condition_branch":
      builder.condition(node.id, node.data);
      return;
    case "branch": {
      const controllerId = sanitizeId(node.id);
      const branchId = sanitizeId(node.data?.branchId || node.id);
      builder.branch(node.id, {
        ...node.data,
        branchId,
        branchControllerId: node.data?.branchControllerId || controllerId,
      });
      const branches = Array.isArray(node.data?.branches) ? node.data.branches : [];
      branches.forEach((branch: any, index: number) => {
        const conditionId = sanitizeId(`${node.id}_${branch.id || index + 1}`);
        builder.condition(conditionId, {
          label: branch.label || (branch.else || branch.isElse ? "其他情况" : `条件 ${index + 1}`),
          condition:
            branch.condition || {
              ruleType: "group",
              condition: "AND",
              rules: [],
            },
          isElse: branch.else === true || branch.isElse === true,
          priority: String(index + 1),
          branchId,
          branchControllerId: node.data?.branchControllerId || controllerId,
        });
        builder.edge(node.id, conditionId, {
          id: `edge_${node.id}_${conditionId}`,
          label: branch.label,
        });
        if (branch.next) {
          builder.edge(conditionId, sanitizeId(branch.next), {
            id: `edge_${conditionId}_${sanitizeId(branch.next)}`,
            label: branch.label,
          });
        }
      });
      return;
    }
    default:
      builder.node(node.type, node.id, node.data);
  }
}

function defineDeclarativeWorkflow(input: WorkflowDeclarativeInput) {
  return {
    __openxiangdaWorkflow: true,
    compile() {
      const builder = new WorkflowBuilder(input);
      input.nodes.forEach((node) => addDeclarativeNode(builder, node));
      (input.edges || []).forEach((edge) => {
        builder.edge(edge.source, edge.target, edge.data || {});
      });
      return builder.compile();
    },
  };
}

export const flow = {
  define(input: WorkflowDefinitionInput | WorkflowDeclarativeInput) {
    if (isDeclarativeInput(input)) {
      return defineDeclarativeWorkflow(input);
    }
    return defineWorkflow(input);
  },
  action: workflowActions,
  assignee: {
    user: (id: string, name?: string) => ({ type: "user", id, name: name || id }),
    initiator: () => ({ type: "originator", id: "originator", name: "发起人" }),
    role: (id: string, name?: string) => ({ type: "role", id, name: name || id }),
    departmentSupervisor: (
      level = 1,
      extra: NodeOptions = {},
    ) => ({ type: "department_supervisor", level, ...extra }),
    initiatorSelect: (
      scope: "all" | "members" | "roles" = "all",
      extra: NodeOptions = {},
    ) => ({ type: "initiator_select", scope, ...extra }),
  },
  start: (id = "start", data: NodeOptions = {}) =>
    createDeclarativeNode("start", id, data),
  end: (id = "end", data: NodeOptions = {}) =>
    createDeclarativeNode("end", id, data),
  approval: (id: string, data: NodeOptions = {}) =>
    createDeclarativeNode("approval", id, data),
  copy: (id: string, data: NodeOptions = {}) =>
    createDeclarativeNode("copy", id, data),
  jsCode: (id: string, data: NodeOptions = {}) =>
    createDeclarativeNode("js_code", id, data),
  functionCall: (id: string, data: NodeOptions = {}) =>
    createDeclarativeNode("function_call", id, data),
  callbackWait: (id: string, data: NodeOptions = {}) =>
    createDeclarativeNode("callback_wait", id, data),
  connectorCall: (id: string, data: NodeOptions = {}) =>
    createDeclarativeNode("connector_call", id, data),
  workNotification: (id: string, data: NodeOptions = {}) =>
    createDeclarativeNode("work_notification", id, data),
  notification: (id: string, data: NodeOptions = {}) =>
    createDeclarativeNode("work_notification", id, data),
  condition: (id: string, data: NodeOptions = {}) =>
    createDeclarativeNode("condition_branch", id, data),
  branch: (id: string, data: NodeOptions = {}) =>
    createDeclarativeNode("branch", id, data),
  data: {
    retrieveSingle: (id: string, data: NodeOptions = {}) =>
      createDeclarativeNode("data_retrieve_single", id, data),
    retrieveBatch: (id: string, data: NodeOptions = {}) =>
      createDeclarativeNode("data_retrieve_batch", id, data),
    create: (id: string, data: NodeOptions = {}) =>
      createDeclarativeNode("data_create", id, data),
    update: (id: string, data: NodeOptions = {}) =>
      createDeclarativeNode("data_update", id, data),
  },
  connect: createDeclarativeEdge,
};

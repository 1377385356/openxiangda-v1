import { describe, expect, it, vi } from 'vitest';
import {
  checkUserApproval,
  deleteFormData,
  getChangeRecords,
  getFormData,
  getInitiatorSelectRequirements,
  getResubmitInitiatorSelectRequirements,
  getProcessBasic,
  getProcessDefinition,
  getProcessProgress,
  getReturnableNodes,
  getViewPermission,
  handleApproval,
  previewProcess,
  resubmitTask,
  returnTask,
  saveTask,
  transferTask,
  withdrawProcess,
} from './processApi';
import type { FormRuntimeApi } from '../types';

function createRequest(response: unknown): FormRuntimeApi['request'] {
  return vi.fn().mockResolvedValue(response) as unknown as FormRuntimeApi['request'];
}

describe('processApi', () => {
  it('loads process basic data', async () => {
    const data = { instanceId: 'inst-1', processStatus: 'running' };
    const request = createRequest({ data });

    await expect(getProcessBasic(request, 'inst-1')).resolves.toMatchObject(data);
    expect(request).toHaveBeenCalledWith({
      url: '/workflow/instance/inst-1/basic',
      method: 'get',
    });
  });

  it('loads process basic data from the platform response shape', async () => {
    const currentTask = {
      id: 'task-1',
      nodeId: 'node-1',
      nodeType: 'approval',
      title: '主管审批',
      status: 'pending',
    };
    const request = createRequest({
      data: {
        instance: {
          id: 'proc-1',
          status: 'running',
          startedBy: 'user-1',
          startedDepartmentName: 'Sales',
          startedAt: '2026-05-13 18:20:07',
          definition: { formUuid: 'form-1', appType: 'app-1' },
        },
        currentTask,
      },
    });

    await expect(getProcessBasic(request, 'inst-1')).resolves.toMatchObject({
      instanceId: 'proc-1',
      processStatus: 'running',
      formUuid: 'form-1',
      appType: 'app-1',
      originatorId: 'user-1',
      originatorDepartment: 'Sales',
      createdAt: '2026-05-13 18:20:07',
      currentTask: {
        id: 'task-1',
        taskId: 'task-1',
        nodeName: '主管审批',
      },
    });
  });

  it('loads process progress with an empty fallback', async () => {
    const request = createRequest({});

    await expect(getProcessProgress(request, 'inst-1')).resolves.toEqual([]);
    expect(request).toHaveBeenCalledWith({
      url: '/workflow/instance/inst-1/all-tasks',
      method: 'get',
    });
  });

  it('loads process progress from the all-tasks response shape', async () => {
    const tasks = [{ id: 'task-1', nodeName: '审批节点', status: 'pending' }];
    const request = createRequest({ data: { instanceId: 'inst-1', tasks } });

    await expect(getProcessProgress(request, 'inst-1')).resolves.toEqual([
      expect.objectContaining({ id: 'task-1', taskId: 'task-1', nodeName: '审批节点' }),
    ]);
    expect(request).toHaveBeenCalledWith({
      url: '/workflow/instance/inst-1/all-tasks',
      method: 'get',
    });
  });

  it('checks approval permission', async () => {
    const result = { hasPermission: true, canUndo: true, isApprover: true };
    const request = createRequest({ result });

    await expect(checkUserApproval(request, 'inst-1')).resolves.toMatchObject({
      ...result,
      currentTasks: [],
    });
    expect(request).toHaveBeenCalledWith({
      url: '/workflow/instance/inst-1/permission',
      method: 'get',
    });
  });

  it('infers approver permission from current pending tasks', async () => {
    const request = createRequest({
      data: {
        instanceId: 'inst-1',
        userId: 'user-1',
        hasPermission: true,
        canUndo: true,
        currentTasks: [
          {
            id: 'task-1',
            nodeId: 'node-1',
            nodeType: 'approval',
            status: 'pending',
            createdAt: '2026-05-13 18:20:07',
          },
        ],
      },
    });

    await expect(checkUserApproval(request, 'inst-1')).resolves.toMatchObject({
      hasPermission: true,
      isApprover: true,
      canUndo: true,
      currentTasks: [
        {
          id: 'task-1',
          taskId: 'task-1',
          nodeName: 'node-1',
        },
      ],
    });
  });

  it('submits approval operations', async () => {
    const data = { ok: true };
    const request = createRequest({ data });
    const params = {
      instanceId: 'inst-1',
      action: 'approved' as const,
      comments: 'ok',
      appType: 'app',
      formUuid: 'form',
    };

    await expect(handleApproval(request, params)).resolves.toBe(data);
    expect(request).toHaveBeenCalledWith({
      url: '/workflow/approve',
      method: 'post',
      data: params,
    });
  });

  it('withdraws a process', async () => {
    const result = { ok: true };
    const request = createRequest({ result });

    await expect(
      withdrawProcess(request, { instanceId: 'inst-1', reason: 'mistake' }),
    ).resolves.toBe(result);
    expect(request).toHaveBeenCalledWith({
      url: '/workflow/instance/inst-1/withdraw',
      method: 'post',
      data: { reason: 'mistake' },
    });
  });

  it('transfers and returns tasks', async () => {
    const request = createRequest({ data: { ok: true } });

    await transferTask(request, { taskId: 'task-1', newAssignee: 'user-2', reason: 'busy' });
    expect(request).toHaveBeenLastCalledWith({
      url: '/workflow/task/task-1/transfer',
      method: 'post',
      data: { newAssignee: 'user-2', reason: 'busy' },
    });

    await returnTask(request, { taskId: 'task-1', targetNodeId: 'node-1', reason: 'revise' });
    expect(request).toHaveBeenLastCalledWith({
      url: '/workflow/task/task-1/return',
      method: 'post',
      data: { targetNodeId: 'node-1', reason: 'revise' },
    });
  });

  it('resubmits and saves tasks', async () => {
    const request = createRequest({ result: { ok: true } });

    await resubmitTask(request, {
      taskId: 'task-1',
      formUuid: 'form',
      appType: 'app',
      updateFormDataJson: '{"name":"A"}',
      comments: 'fixed',
    });
    expect(request).toHaveBeenLastCalledWith({
      url: '/workflow/task/task-1/resubmit',
      method: 'post',
      data: {
        formUuid: 'form',
        appType: 'app',
        updateFormDataJson: '{"name":"A"}',
        comments: 'fixed',
      },
    });

    const saveParams = {
      instanceId: 'inst-1',
      formUuid: 'form',
      appType: 'app',
      updateFormDataJson: '{"name":"B"}',
    };
    await saveTask(request, saveParams);
    expect(request).toHaveBeenLastCalledWith({
      url: '/workflow/task/save',
      method: 'post',
      data: saveParams,
    });
  });

  it('loads returnable nodes, preview routes, and process definition', async () => {
    const nodes = [{ nodeId: 'node-1', nodeName: 'Manager' }];
    const request = createRequest({ data: nodes });

    await expect(getReturnableNodes(request, 'task-1')).resolves.toStrictEqual(nodes);
    expect(request).toHaveBeenLastCalledWith({
      url: '/workflow/task/task-1/returnable-nodes',
      method: 'get',
    });

    await previewProcess(request, {
      formUuid: 'form',
      appType: 'app',
      data: { name: 'A' },
    });
    expect(request).toHaveBeenLastCalledWith({
      url: '/workflow/preview',
      method: 'post',
      data: { formUuid: 'form', appType: 'app', data: { name: 'A' } },
    });

    await getProcessDefinition(request, 'form');
    expect(request).toHaveBeenLastCalledWith({
      url: '/workflow/definition/form',
      method: 'get',
      params: { formUuid: 'form' },
    });
  });

  it('normalizes process preview task response shape', async () => {
    const request = createRequest({
      data: {
        instance: { id: 'preview' },
        tasks: [
          {
            id: 'task-start',
            nodeId: 'start-1',
            nodeType: 'start',
            title: '用户提交',
            assignee: 'u1',
            assigneeName: '蔡杰',
          },
          {
            id: 'task-approval',
            nodeId: 'approval-1',
            nodeType: 'approval',
            nodeName: '审批',
            allAssignees: ['u2'],
          },
          {
            id: 'task-initiator-select',
            nodeId: 'approval-2',
            nodeType: 'approval',
            nodeName: '发起人自选审批',
            assignee: 'u3',
            assigneeName: '平台管理员',
            allAssignees: ['u2', 'u3'],
          },
        ],
      },
    });

    await expect(
      previewProcess(request, {
        formUuid: 'form',
        appType: 'app',
        data: { name: 'A' },
      }),
    ).resolves.toStrictEqual([
      expect.objectContaining({
        nodeId: 'start-1',
        nodeName: '用户提交',
        nodeType: 'start',
        assignees: [{ id: 'u1', name: '蔡杰' }],
      }),
      expect.objectContaining({
        nodeId: 'approval-1',
        nodeName: '审批',
        nodeType: 'approval',
        assignees: [{ id: 'u2', name: 'u2' }],
      }),
      expect.objectContaining({
        nodeId: 'approval-2',
        nodeName: '发起人自选审批',
        nodeType: 'approval',
        assignees: [{ id: 'u3', name: '平台管理员' }],
      }),
    ]);
  });

  it('normalizes legacy returnable node shape', async () => {
    const request = createRequest({ data: { candidates: [{ id: 'node-1', name: '发起人' }] } });

    await expect(getReturnableNodes(request, 'task-1')).resolves.toStrictEqual([
      expect.objectContaining({ nodeId: 'node-1', nodeName: '发起人' }),
    ]);
  });

  it('throws workflow business errors for initiator approver requirements', async () => {
    const request = createRequest({ code: 400, message: '流程定义未找到或未发布', data: null });

    await expect(
      getInitiatorSelectRequirements(request, {
        formUuid: 'form',
        appType: 'app',
        data: { name: 'A' },
      }),
    ).rejects.toThrow('流程定义未找到或未发布');
  });

  it('normalizes resubmit initiator approver requirements from business envelopes', async () => {
    const request = createRequest({
      code: 200,
      data: {
        nodes: [{ nodeId: 'approval-1', nodeName: '主管审批', scope: 'members' }],
      },
    });

    await expect(
      getResubmitInitiatorSelectRequirements(request, {
        taskId: 'task-1',
        formUuid: 'form',
        appType: 'app',
        data: { name: 'A' },
      }),
    ).resolves.toStrictEqual([
      expect.objectContaining({
        nodeId: 'approval-1',
        nodeName: '主管审批',
        scope: 'members',
      }),
    ]);
  });

  it('loads and deletes form data', async () => {
    const formData = { formInstanceId: 'inst-1', data: { name: 'A' } };
    const request = createRequest({ result: formData });
    const params = { formInstanceId: 'inst-1', appType: 'app', formUuid: 'form' };

    await expect(getFormData(request, params)).resolves.toBe(formData);
    expect(request).toHaveBeenLastCalledWith({
      url: '/form/queryFormDataByFormInstanceId',
      method: 'get',
      params,
    });

    await deleteFormData(request, params);
    expect(request).toHaveBeenLastCalledWith({
      url: '/app/v1/form/deleteFormData.json',
      method: 'post',
      data: { appType: 'app', formUuid: 'form', formInstId: 'inst-1' },
    });
  });

  it('loads change records and view permissions', async () => {
    const response = { records: [], total: 0, page: 1, pageSize: 20 };
    const request = createRequest({ data: response });
    const changeParams = { formUuid: 'form', appType: 'app', formInstanceId: 'inst-1' };

    await expect(getChangeRecords(request, changeParams)).resolves.toBe(response);
    expect(request).toHaveBeenLastCalledWith({
      url: '/form/getFormDataChangeRecords',
      method: 'get',
      params: changeParams,
    });

    await getViewPermission(request, changeParams);
    expect(request).toHaveBeenLastCalledWith({
      url: '/permission/form-group/view-permissions',
      method: 'get',
      params: changeParams,
    });
  });
});

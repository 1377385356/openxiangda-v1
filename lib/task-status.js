function buildTaskStatus(input = {}) {
  const execution = object(input.execution);
  const directPublish = object(input.directPublish);
  const steps = Array.isArray(execution?.steps) ? execution.steps : [];
  const completed = steps.filter(step => step.status === 'completed');
  const failed = steps.find(step => step.status === 'failed') || null;
  const running =
    steps.find(step => ['running', 'write-started'].includes(step.status)) ||
    null;
  const pending = steps.filter(step => step.status === 'pending');
  const releaseState =
    execution?.status ||
    (directPublish?.status === 'completed'
      ? 'direct-publish-completed'
      : 'not-started');
  const postCommit = object(input.postCommit);
  const remoteLease = object(input.remoteLease);
  const taskResult = object(input.taskResult);
  const integration = object(input.integration);
  const change = object(input.change);
  const sourceRevision =
    object(input.sourceRevision) ||
    object(directPublish?.sourceRevision) ||
    object(execution?.releaseSourceRevision) ||
    object(execution?.releaseContext?.releaseSourceRevision);
  const changeId =
    input.changeId || change?.id || execution?.changeId || null;
  const leaseBlocked = isRemoteLeaseBlocking({
    remoteLease,
    execution,
    changeId,
  });
  const phase = inferPhase({
    releaseState,
    steps,
    failed,
    running,
    postCommit,
    taskResult,
    integration,
    change,
  });
  const blockingLayer = inferBlockingLayer({
    failed,
    releaseState,
    remoteLease,
    integration,
    postCommit,
    leaseBlocked,
  });
  const startedAt =
    execution?.createdAt ||
    directPublish?.completedAt ||
    change?.createdAt ||
    taskResult?.recordedAt ||
    null;
  const endedAt =
    execution?.completedAt ||
    (releaseState === 'direct-publish-completed'
      ? directPublish?.completedAt
      : null) ||
    (phase === 'integration-ready' ? taskResult?.recordedAt : null);
  const now = Number.isFinite(Number(input.now))
    ? Number(input.now)
    : Date.now();
  const elapsedMs = durationBetween(startedAt, endedAt, now);
  const estimatedRemainingMs = estimateRemainingMs(
    steps,
    completed,
    pending,
    running,
  );
  const wrotePlatform = Boolean(
    directPublish?.writeAttempted ||
      execution?.writeAttempted ||
      execution?.stagedWriteOccurred ||
      completed.some(step => step.id !== 'lease-and-capture'),
  );
  const healthy =
    ['completed', 'direct-publish-completed'].includes(releaseState) &&
    (!postCommit || postCommit.status === 'completed');

  return {
    schemaVersion: 'openxiangda_task_status_v1',
    changeId,
    phase,
    healthy,
    wrotePlatform,
    elapsedMs,
    estimatedRemainingMs,
    progress: {
      completed: completed.length,
      pending: pending.length,
      total: steps.length,
      currentStep: running?.id || failed?.id || pending[0]?.id || null,
    },
    source: {
      changeStatus: change?.status || null,
      taskCommit: taskResult?.commit || sourceRevision?.baseCommit || null,
      taskReady: Boolean(taskResult || sourceRevision),
      integrated: inferIntegrated(integration),
    },
    release: {
      state: releaseState,
      appReleaseId: findAppReleaseId(steps),
      postCommitStatus: postCommit?.status || null,
      leaseActive: Boolean(remoteLease?.active),
      leaseHolder:
        remoteLease?.holder?.changeId ||
        remoteLease?.holder?.clientSessionId ||
        remoteLease?.changeId ||
        remoteLease?.clientSessionId ||
        (typeof remoteLease?.holder === 'string'
          ? remoteLease.holder
          : null) ||
        null,
    },
    blocker: blockingLayer
      ? {
          layer: blockingLayer,
          code:
            failed?.error?.code ||
            failed?.errorCode ||
            (releaseState === 'write-review-required'
              ? 'RELEASE_WRITE_REVIEW_REQUIRED'
              : null),
          message:
            failed?.error?.message ||
            failed?.error ||
            blockerMessage(blockingLayer, remoteLease),
        }
      : null,
    nextAction: nextAction({
      phase,
      releaseState,
      failed,
      remoteLease,
      postCommit,
      taskResult,
      integration,
      leaseBlocked,
    }),
  };
}

function inferPhase(input) {
  if (
    input.postCommit &&
    input.postCommit.status &&
    input.postCommit.status !== 'completed'
  ) {
    return 'health';
  }
  if (input.releaseState === 'completed') return 'healthy';
  if (input.releaseState === 'direct-publish-completed') return 'healthy';
  if (input.releaseState === 'write-review-required') return 'write-review';
  if (input.failed) return 'failed';
  if (input.running) return phaseFromStep(input.running.id);
  const firstPending = input.steps.find(step => step.status === 'pending');
  if (firstPending && input.releaseState !== 'not-started') {
    return phaseFromStep(firstPending.id);
  }
  if (input.taskResult && inferIntegrated(input.integration)) {
    return 'integration-ready';
  }
  if (input.taskResult) return 'integration';
  if (input.change?.status === 'approved') return 'coding';
  if (input.change) return 'design';
  return 'not-started';
}

function phaseFromStep(stepId) {
  const value = String(stepId || '').toLowerCase();
  if (value.includes('lease') || value.includes('capture')) return 'staging';
  if (value.includes('stage')) return 'staging';
  if (value.includes('finalize') || value.includes('activate')) {
    return 'activation';
  }
  if (value.includes('health') || value.includes('post-commit')) {
    return 'health';
  }
  return 'release';
}

function inferBlockingLayer(input) {
  const code = String(
    input.failed?.error?.code ||
      input.failed?.errorCode ||
      '',
  );
  if (input.releaseState === 'write-review-required') return 'write-result';
  if (input.postCommit?.status && input.postCommit.status !== 'completed') {
    return 'post-commit';
  }
  if (input.leaseBlocked) return 'lease';
  if (input.integration && inferIntegrated(input.integration) === false) {
    return 'git-mainline';
  }
  if (/DB|MIGRATION|CONSTRAINT/.test(code)) return 'database';
  if (/HTTP|API|CAPABILIT|CONTRACT/.test(code)) return 'platform-api';
  if (/GIT|SOURCE|MAINLINE|INTEGRATION/.test(code)) return 'git-mainline';
  if (/DEPENDENCY|PACKAGE|INSTALL/.test(code)) return 'dependencies';
  if (/BUILD|TYPECHECK|TEST/.test(code)) return 'build-test';
  if (/LEASE/.test(code)) return 'lease';
  if (input.failed) return 'release-step';
  return null;
}

function inferIntegrated(integration) {
  if (!integration) return null;
  if (typeof integration.integrated === 'boolean') {
    return integration.integrated;
  }
  const required = Array.isArray(integration.requiredCommits)
    ? integration.requiredCommits
    : [];
  if (required.length === 0) return null;
  return required.every(item => item.mergedIntoHead === true);
}

function findAppReleaseId(steps) {
  const finalize = [...steps]
    .reverse()
    .find(step => String(step.id || '').includes('app-finalize'));
  return finalize?.result?.releaseId || null;
}

function estimateRemainingMs(steps, completed, pending, running) {
  if (!steps.length || (!pending.length && !running)) return 0;
  const durations = completed
    .map(step => durationBetween(step.startedAt, step.completedAt))
    .filter(value => Number.isFinite(value) && value > 0);
  if (!durations.length) return null;
  const average =
    durations.reduce((sum, value) => sum + value, 0) / durations.length;
  return Math.round(average * (pending.length + (running ? 0.5 : 0)));
}

function durationBetween(start, end, now = Date.now()) {
  if (!start) return null;
  const started = new Date(start).getTime();
  const ended = end ? new Date(end).getTime() : now;
  if (!Number.isFinite(started) || !Number.isFinite(ended)) return null;
  return Math.max(0, ended - started);
}

function nextAction(input) {
  if (input.releaseState === 'write-review-required') {
    return '只读核对 staged child/App Release，确认安全后使用 --resume-after-review。';
  }
  if (input.postCommit?.status && input.postCommit.status !== 'completed') {
    return '等待平台自动重试；需要立即重试时执行 release app-retry <releaseId>。';
  }
  if (input.failed) {
    return `修复 ${input.failed.id || '失败步骤'} 后重跑同一条 release publish。`;
  }
  if (input.leaseBlocked) {
    const holder =
      input.remoteLease?.changeId ||
      input.remoteLease?.clientSessionId ||
      input.remoteLease?.holder?.changeId ||
      input.remoteLease?.holder?.clientSessionId ||
      input.remoteLease?.holder ||
      '另一发布任务';
    const expiry = input.remoteLease?.expiresAt
      ? `，最晚 ${input.remoteLease.expiresAt} 到期`
      : '';
    return `等待 ${holder} 释放当前应用租约${expiry}；本任务尚未写平台，可继续本地开发与测试。`;
  }
  if (input.releaseState === 'staged-resumable') {
    return '重跑同一条 release publish，从已验证的 staged child 继续。';
  }
  if (input.releaseState === 'completed') return '执行业务验收并归档 change。';
  if (input.releaseState === 'direct-publish-completed') {
    return '直接发布已完成；执行业务验收并归档 change。';
  }
  if (input.taskResult && inferIntegrated(input.integration) === false) {
    return '把 task commit 合并并推送到权威主分支，再创建 mainline bundle。';
  }
  if (input.taskResult) return '在主分支创建/更新 Integration Bundle 并发布。';
  return '完成实现和聚焦测试，提交后运行 sdd ready。';
}

function blockerMessage(layer, remoteLease) {
  const messages = {
    lease: remoteLease?.changeId
      ? `发布任务 ${remoteLease.changeId} 持有应用租约。`
      : '另一个发布任务持有应用租约。',
    'git-mainline': '任务提交尚未完整进入权威主分支。',
    'post-commit': '发布已激活，提交后动作仍在自动重试。',
    'write-result': '上次写请求结果不确定，需要只读核对。',
  };
  return messages[layer] || '当前阶段需要处理失败后才能继续。';
}

function isRemoteLeaseBlocking(input = {}) {
  const remote = object(input.remoteLease);
  if (!remote?.active) return false;
  const execution = object(input.execution);
  const context = object(execution?.releaseContext);
  if (
    remote.leaseId &&
    context?.leaseId &&
    String(remote.leaseId) === String(context.leaseId)
  ) {
    return false;
  }
  if (
    remote.clientSessionId &&
    context?.clientSessionId &&
    String(remote.clientSessionId) === String(context.clientSessionId) &&
    (!remote.changeId ||
      !input.changeId ||
      String(remote.changeId) === String(input.changeId))
  ) {
    return false;
  }
  return true;
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : null;
}

module.exports = {
  buildTaskStatus,
  findAppReleaseId,
};

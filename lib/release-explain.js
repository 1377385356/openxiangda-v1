function explainReleaseExecution(execution) {
  if (!execution) {
    return {
      state: 'not-started',
      resumable: false,
      writeReviewRequired: false,
      summary: '本地没有该 change 的 release execution journal。',
      nextAction: '先运行 release publish --dry-run 检查计划，再开始正式发布。',
    };
  }
  const steps = Array.isArray(execution.steps) ? execution.steps : [];
  const failedStep = steps.find(step => step.status === 'failed');
  const runningStep = steps.find(step =>
    ['running', 'write-started'].includes(step.status)
  );
  const pendingSteps = steps.filter(step => step.status === 'pending');
  const completedSteps = steps.filter(step => step.status === 'completed');
  const state = execution.status || 'unknown';
  const common = {
    state,
    resumable: state === 'staged-resumable',
    writeReviewRequired: state === 'write-review-required',
    progress: {
      completed: completedSteps.length,
      pending: pendingSteps.length,
      total: steps.length,
      currentStep: runningStep?.id || failedStep?.id || pendingSteps[0]?.id || null,
    },
    failedStep: failedStep
      ? {
          id: failedStep.id,
          code: failedStep.errorCode || null,
          message: failedStep.error || null,
        }
      : null,
  };
  if (state === 'completed') {
    return {
      ...common,
      summary: '本次应用原子发布已完成。',
      nextAction: '执行验收；确认无误后可归档 SDD change。',
    };
  }
  if (state === 'write-review-required') {
    return {
      ...common,
      summary: '上次写请求的结果不确定，CLI 已停止自动重试以避免重复写入。',
      nextAction:
        '先只读核对 staged child/App Release；确认可安全重试后追加 --resume-after-review。',
    };
  }
  if (state === 'staged-resumable') {
    return {
      ...common,
      summary: '已有 staged child，active head 尚未全部切换，可以从执行日志继续。',
      nextAction: '重新运行同一条 release publish 命令继续，不要另起全量发布。',
    };
  }
  if (state === 'failed') {
    return {
      ...common,
      summary: '发布在确认没有成功写入后失败，可以修复原因后重试。',
      nextAction: '修复 failedStep 后重新运行同一条 release publish 命令。',
    };
  }
  return {
    ...common,
    summary: runningStep
      ? `发布停在 ${runningStep.id}。`
      : '发布尚未完成。',
    nextAction: '使用同一 change/profile 重新运行 release publish，让执行日志决定续跑位置。',
  };
}

module.exports = { explainReleaseExecution };

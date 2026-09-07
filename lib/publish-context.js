const HEADER_NAMES = Object.freeze({
  publishLeaseId: 'x-openxiangda-publish-lease-id',
  changeBaselineId: 'x-openxiangda-change-baseline-id',
  changeId: 'x-openxiangda-change-id',
  clientSessionId: 'x-openxiangda-client-session-id',
});

const ENV_NAMES = Object.freeze({
  publishLeaseId: 'OPENXIANGDA_PUBLISH_LEASE_ID',
  changeBaselineId: 'OPENXIANGDA_CHANGE_BASELINE_ID',
  changeId: 'OPENXIANGDA_CHANGE_ID',
  clientSessionId: 'OPENXIANGDA_CLIENT_SESSION_ID',
});

function normalizePublishContext(value, options = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const context = {
    appType: normalizeOptionalString(value.appType),
    profileName: normalizeOptionalString(value.profileName || value.profile),
    publishLeaseId: normalizeOptionalString(
      value.publishLeaseId || value.leaseId
    ),
    changeBaselineId: normalizeOptionalString(
      value.changeBaselineId || value.baselineId
    ),
    changeId: normalizeOptionalString(value.changeId),
    clientSessionId: normalizeOptionalString(value.clientSessionId),
  };
  if (options.requireComplete) assertCompletePublishContext(context);
  return context;
}

function assertCompletePublishContext(value) {
  const context = normalizePublishContext(value) || {};
  const missing = [];
  if (!context.publishLeaseId) missing.push('publishLeaseId');
  if (!context.changeBaselineId) missing.push('changeBaselineId');
  if (!context.changeId) missing.push('changeId');
  if (!context.clientSessionId) missing.push('clientSessionId');
  if (missing.length > 0) {
    const error = new Error(
      `发布上下文不完整，缺少 ${missing.join(', ')}；请先执行 openxiangda release begin --change <id>`
    );
    error.code = 'PUBLISH_CONTEXT_REQUIRED';
    error.missing = missing;
    throw error;
  }
  return context;
}

function buildPublishContextHeaders(value, options = {}) {
  const context = options.requireComplete
    ? assertCompletePublishContext(value)
    : normalizePublishContext(value);
  if (!context) return {};
  return compactMappedValues(context, HEADER_NAMES);
}

function buildPublishContextEnv(value, options = {}) {
  const context = options.requireComplete
    ? assertCompletePublishContext(value)
    : normalizePublishContext(value);
  if (!context) return {};
  return compactMappedValues(context, ENV_NAMES);
}

function readPublishContextEnv(env = process.env) {
  return normalizePublishContext({
    publishLeaseId: env?.[ENV_NAMES.publishLeaseId],
    changeBaselineId: env?.[ENV_NAMES.changeBaselineId],
    changeId: env?.[ENV_NAMES.changeId],
    clientSessionId: env?.[ENV_NAMES.clientSessionId],
  });
}

function compactMappedValues(context, names) {
  const entries = [];
  for (const [field, outputName] of Object.entries(names)) {
    const value = normalizeOptionalString(context[field]);
    if (value) entries.push([outputName, value]);
  }
  return Object.fromEntries(entries);
}

function normalizeOptionalString(value) {
  const text = String(value === undefined || value === null ? '' : value).trim();
  return text || null;
}

module.exports = {
  ENV_NAMES,
  HEADER_NAMES,
  assertCompletePublishContext,
  buildPublishContextEnv,
  buildPublishContextHeaders,
  normalizePublishContext,
  readPublishContextEnv,
};

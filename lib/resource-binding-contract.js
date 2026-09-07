const crypto = require('crypto');

const RESOURCE_BINDING_KEYS = ['forms', 'dataViews'];

function normalizeResourceCodeList(value) {
  if (value === undefined || value === null) return [];
  const source = Array.isArray(value)
    ? value
    : typeof value === 'object'
      ? Object.keys(value)
      : [value];
  return Array.from(
    new Set(
      source
        .map(item => String(item || '').trim())
        .filter(Boolean)
    )
  ).sort();
}

function normalizeResourceDeclaration(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const normalized = {};
  for (const key of Object.keys(value).sort()) {
    const codes = normalizeResourceCodeList(value[key]);
    if (codes.length > 0) normalized[key] = codes;
  }
  return normalized;
}

function diffResourceDeclarations(outerResources, runtimeResources) {
  const outer = normalizeResourceDeclaration(outerResources);
  const runtime = normalizeResourceDeclaration(runtimeResources);
  const keys = Array.from(
    new Set([...Object.keys(outer), ...Object.keys(runtime)])
  ).sort();
  const differences = [];
  for (const key of keys) {
    const outerCodes = new Set(outer[key] || []);
    const runtimeCodes = new Set(runtime[key] || []);
    const missingInRuntime = [...outerCodes]
      .filter(code => !runtimeCodes.has(code))
      .sort();
    const missingInOuter = [...runtimeCodes]
      .filter(code => !outerCodes.has(code))
      .sort();
    if (missingInRuntime.length > 0 || missingInOuter.length > 0) {
      differences.push({
        resourceType: key,
        missingInRuntime,
        missingInOuter,
      });
    }
  }
  return {
    matches: differences.length === 0,
    outer,
    runtime,
    differences,
  };
}

function formatResourceDeclarationDrift(kind, code, diff) {
  const details = diff.differences.flatMap(item => {
    const parts = [];
    if (item.missingInRuntime.length > 0) {
      parts.push(
        `运行时缺少 ${item.resourceType}=[${item.missingInRuntime.join(', ')}]`
      );
    }
    if (item.missingInOuter.length > 0) {
      parts.push(
        `外层清单缺少 ${item.resourceType}=[${item.missingInOuter.join(', ')}]`
      );
    }
    return parts;
  });
  return [
    'RESOURCE_DECLARATION_DRIFT:',
    `${kind}:${code}`,
    '外层 resources 与运行时 definition resources 不一致；',
    details.join('；'),
    '。请只维护一份资源集合并同步生成两处清单，禁止发布。',
  ].join(' ');
}

function normalizeResourceBindings(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const normalized = {};
  for (const key of RESOURCE_BINDING_KEYS) {
    const source = value[key];
    if (!source) continue;
    const entries = Array.isArray(source)
      ? source.map(code => [String(code), String(code)])
      : typeof source === 'object'
        ? Object.entries(source)
        : [[String(source), String(source)]];
    const mapped = {};
    for (const [rawCode, rawBinding] of entries) {
      const code = String(rawCode || '').trim();
      const binding =
        rawBinding && typeof rawBinding === 'object'
          ? String(
              rawBinding.formUuid ||
                rawBinding.dataViewCode ||
                rawBinding.id ||
                rawBinding.uuid ||
                ''
            ).trim()
          : String(rawBinding || '').trim();
      if (code && binding) mapped[code] = binding;
    }
    const sorted = Object.fromEntries(
      Object.entries(mapped).sort(([left], [right]) =>
        left.localeCompare(right)
      )
    );
    if (Object.keys(sorted).length > 0) normalized[key] = sorted;
  }
  return normalized;
}

function diffResourceBindings(expectedValue, actualValue) {
  const expected = normalizeResourceBindings(expectedValue);
  const actual = normalizeResourceBindings(actualValue);
  const differences = [];
  for (const key of RESOURCE_BINDING_KEYS) {
    const expectedItems = expected[key] || {};
    const actualItems = actual[key] || {};
    const codes = Array.from(
      new Set([...Object.keys(expectedItems), ...Object.keys(actualItems)])
    ).sort();
    const missing = [];
    const unexpected = [];
    const changed = [];
    for (const code of codes) {
      if (expectedItems[code] && !actualItems[code]) {
        missing.push(code);
      } else if (!expectedItems[code] && actualItems[code]) {
        unexpected.push(code);
      } else if (expectedItems[code] !== actualItems[code]) {
        changed.push(code);
      }
    }
    if (missing.length > 0 || unexpected.length > 0 || changed.length > 0) {
      differences.push({
        resourceType: key,
        missing,
        unexpected,
        changed,
      });
    }
  }
  return {
    matches: differences.length === 0,
    expected,
    actual,
    differences,
  };
}

function resourceBindingContractHash(contracts) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(normalizeBindingContracts(contracts)))
    .digest('hex');
}

function normalizeBindingContracts(contracts = []) {
  return (contracts || [])
    .map(contract => ({
      kind: String(contract.kind || ''),
      code: String(contract.code || ''),
      policy:
        contract.policy === 'exact' ? 'exact' : 'contains_expected',
      expected: normalizeResourceBindings(contract.expected),
    }))
    .sort((left, right) =>
      `${left.kind}:${left.code}`.localeCompare(`${right.kind}:${right.code}`)
    );
}

function summarizeBindingDifferences(diff) {
  return diff.differences.flatMap(item => {
    const parts = [];
    if (item.missing.length > 0) {
      parts.push(`${item.resourceType}.missing=[${item.missing.join(', ')}]`);
    }
    if (item.unexpected.length > 0) {
      parts.push(
        `${item.resourceType}.unexpected=[${item.unexpected.join(', ')}]`
      );
    }
    if (item.changed.length > 0) {
      parts.push(`${item.resourceType}.changed=[${item.changed.join(', ')}]`);
    }
    return parts;
  });
}

module.exports = {
  diffResourceBindings,
  diffResourceDeclarations,
  formatResourceDeclarationDrift,
  normalizeBindingContracts,
  normalizeResourceBindings,
  normalizeResourceDeclaration,
  resourceBindingContractHash,
  summarizeBindingDifferences,
};

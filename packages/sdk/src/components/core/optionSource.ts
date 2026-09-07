import type {
  OptionItem,
  OptionSourceConfig,
  LinkedFormOptionConfig,
  DataLinkageConfig,
  FormRuntimeConfig,
  RuntimeDataQueryParams,
} from '../types';

const DEFAULT_OPTION_PAGE_SIZE = 200;

function getOptionValueFieldId(config: Pick<LinkedFormOptionConfig, 'fieldId' | 'valueFieldId'>) {
  return config.valueFieldId || config.fieldId;
}

function getOptionLabelFieldId(config: Pick<LinkedFormOptionConfig, 'fieldId' | 'labelFieldId'>) {
  return config.labelFieldId || config.fieldId;
}

function getSearchFieldId(config: LinkedFormOptionConfig) {
  return config.searchFieldId || config.labelFieldId || config.fieldId;
}

function readFieldValue(row: Record<string, any>, fieldId?: string) {
  if (!fieldId) return undefined;
  return row?.[fieldId];
}

function normalizeOptionScalar(rawValue: any): any {
  if (rawValue === undefined || rawValue === null || rawValue === '') return null;

  if (typeof rawValue === 'object' && !Array.isArray(rawValue)) {
    return rawValue.value ?? rawValue.id ?? rawValue.key ?? rawValue.label;
  }

  return rawValue;
}

function normalizeOptionLabel(rawLabel: any, rawValue: any, fallbackLabel: any, value: any) {
  if (rawLabel !== undefined && rawLabel !== null && rawLabel !== '') {
    if (typeof rawLabel === 'object' && !Array.isArray(rawLabel)) {
      return rawLabel.label ?? rawLabel.name ?? rawLabel.title ?? rawLabel.value ?? value;
    }
    return rawLabel;
  }

  if (typeof rawValue === 'object' && rawValue && !Array.isArray(rawValue)) {
    return rawValue.label ?? rawValue.name ?? rawValue.title ?? rawValue.value ?? value;
  }

  if (fallbackLabel !== undefined && fallbackLabel !== null && fallbackLabel !== '') {
    return fallbackLabel;
  }

  return value;
}

function normalizeOptionItem(
  row: Record<string, any>,
  config: Pick<LinkedFormOptionConfig, 'fieldId' | 'valueFieldId' | 'labelFieldId'> | string,
): OptionItem | null {
  const normalizedConfig =
    typeof config === 'string' ? { fieldId: config } : { ...config, fieldId: config.fieldId };
  const valueFieldId = getOptionValueFieldId(normalizedConfig);
  const labelFieldId = getOptionLabelFieldId(normalizedConfig);
  const rawValue =
    readFieldValue(row, valueFieldId) ??
    (valueFieldId !== normalizedConfig.fieldId
      ? readFieldValue(row, normalizedConfig.fieldId)
      : undefined) ??
    row?.value;
  const value = normalizeOptionScalar(rawValue);
  if (value === undefined || value === null || value === '') return null;

  const rawLabel =
    labelFieldId === valueFieldId ? undefined : readFieldValue(row, labelFieldId);
  const label = normalizeOptionLabel(rawLabel, rawValue, row?.label, value);

  return {
    value: String(value),
    label: String(label ?? value),
  };
}

function extractComparableValue(value: any): any {
  if (value === undefined || value === null || value === '') return value;
  if (Array.isArray(value)) {
    return value
      .map(extractComparableValue)
      .filter((item) => item !== undefined && item !== null && item !== '');
  }
  if (typeof value === 'object') {
    if ('start' in value || 'end' in value) {
      return [value.start, value.end].filter(
        (item) => item !== undefined && item !== null && item !== '',
      );
    }
    return (
      value.value ??
      value.id ??
      value.key ??
      value.userId ??
      value.userid ??
      value.departmentId ??
      value.deptId ??
      value.label ??
      value.name
    );
  }
  return value;
}

function normalizeFilterOperator(operator: string | undefined, value: any) {
  const normalized = operator === 'neq' ? 'ne' : operator || 'eq';
  if (
    Array.isArray(value) &&
    value.length > 0 &&
    (normalized === 'eq' || normalized === 'contains')
  ) {
    return 'in';
  }
  return normalized;
}

/**
 * 解析选项数据源，返回选项列表
 */
export async function resolveOptions(
  config: OptionSourceConfig,
  runtime: FormRuntimeConfig | undefined,
  formData: Record<string, any>,
  searchKeyword?: string,
): Promise<OptionItem[]> {
  switch (config.type) {
    case 'custom':
      return []; // custom 类型直接用 props.options
    case 'linkedForm':
      if (!config.linkedForm) return [];
      return resolveLinkedFormOptions(config.linkedForm, runtime, searchKeyword);
    case 'dataLinkage':
      if (!config.dataLinkage) return [];
      return resolveDataLinkageOptions(config.dataLinkage, runtime, formData);
    default:
      return [];
  }
}

/**
 * 表单数据源：页面加载或远程搜索时获取指定表单的字段数据作为选项
 */
export async function resolveLinkedFormOptions(
  config: LinkedFormOptionConfig,
  runtime: FormRuntimeConfig | undefined,
  searchKeyword?: string,
): Promise<OptionItem[]> {
  if (!runtime?.fetchFormData) return [];

  try {
    // 构建 filters：将 LinkedFormOptionConfig 的 filters 转换为带值的条件
    const filters: RuntimeDataQueryParams['filters'] =
      config.filters?.map((f) => ({
        fieldId: f.fieldId,
        operator: normalizeFilterOperator(f.operator, extractComparableValue(f.value)),
        value: extractComparableValue(f.value),
      })) || [];
    const trimmedKeyword = String(searchKeyword || '').trim();
    if (trimmedKeyword) {
      filters.push({
        fieldId: getSearchFieldId(config),
        operator: 'contains',
        value: trimmedKeyword,
      });
    }

    const result = await runtime.fetchFormData({
      formUuid: config.formUuid,
      appType: runtime.appType || '',
      filters,
      sort: config.sortField
        ? { field: config.sortField, order: config.sortOrder || 'asc' }
        : undefined,
      fieldId: config.fieldId,
      deduplicate: config.deduplicate,
      pageSize: config.pageSize ?? DEFAULT_OPTION_PAGE_SIZE,
    });

    // 从结果中提取选项
    const items = result.data
      .map((row: any) => normalizeOptionItem(row, config))
      .filter((item): item is OptionItem => Boolean(item));

    // 前端去重
    if (config.deduplicate) {
      const seen = new Set<string>();
      return items.filter((item) => {
        if (seen.has(item.value)) return false;
        seen.add(item.value);
        return true;
      });
    }

    return items;
  } catch (e) {
    console.error('[FormComponents] resolveLinkedFormOptions failed:', e);
    return [];
  }
}

/**
 * 数据联动：根据当前表单字段值匹配联动表单数据
 */
async function resolveDataLinkageOptions(
  config: DataLinkageConfig,
  runtime: FormRuntimeConfig | undefined,
  formData: Record<string, any>,
): Promise<OptionItem[]> {
  if (!runtime?.fetchFormData) return [];

  try {
    // 方案A：在调用处完成值注入，将 localFieldId 的当前值作为 filter value
    const filters: RuntimeDataQueryParams['filters'] = config.conditions.map((condition) => {
      const value = extractComparableValue(formData[condition.localFieldId]);
      return {
        fieldId: condition.remoteFieldId,
        operator: normalizeFilterOperator(condition.operator, value),
        value,
      };
    });

    const result = await runtime.fetchFormData({
      formUuid: config.formUuid,
      appType: runtime.appType || '',
      filters,
      conditionLogic: config.conditionLogic,
      fieldId: config.targetFieldId,
      deduplicate: config.deduplicate,
      pageSize: DEFAULT_OPTION_PAGE_SIZE,
    });

    const items = result.data
      .map((row: any) => normalizeOptionItem(row, config.targetFieldId))
      .filter((item): item is OptionItem => Boolean(item));

    // 前端去重
    if (config.deduplicate) {
      const seen = new Set<string>();
      return items.filter((item) => {
        if (seen.has(item.value)) return false;
        seen.add(item.value);
        return true;
      });
    }

    return items;
  } catch (e) {
    console.error('[FormComponents] resolveDataLinkageOptions failed:', e);
    return [];
  }
}

/**
 * 解析默认值联动（用于非选择类字段的数据联动默认值）
 */
export async function resolveDefaultValueLinkage(
  config: {
    formUuid: string;
    targetFieldId: string;
    conditions: any[];
    conditionLogic?: string;
  },
  runtime: FormRuntimeConfig | undefined,
  formData: Record<string, any>,
): Promise<any> {
  if (!runtime?.fetchFormData) return undefined;

  try {
    // 方案A：在调用处完成值注入
    const filters: RuntimeDataQueryParams['filters'] = config.conditions.map((condition: any) => {
      const value = extractComparableValue(formData[condition.localFieldId]);
      return {
        fieldId: condition.remoteFieldId,
        operator: normalizeFilterOperator(condition.operator, value),
        value,
      };
    });

    const result = await runtime.fetchFormData({
      formUuid: config.formUuid,
      appType: runtime.appType || '',
      filters,
      conditionLogic: config.conditionLogic as 'and' | 'or' | undefined,
      fieldId: config.targetFieldId,
      pageSize: DEFAULT_OPTION_PAGE_SIZE,
    });

    // 返回第一条匹配数据的目标字段值
    if (result.data.length > 0) {
      return result.data[0][config.targetFieldId] ?? result.data[0].value ?? undefined;
    }
    return undefined;
  } catch (e) {
    console.error('[FormComponents] resolveDefaultValueLinkage failed:', e);
    return undefined;
  }
}

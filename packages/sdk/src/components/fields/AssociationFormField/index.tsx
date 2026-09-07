import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Drawer, Input, Modal, Select, Space, Spin, Table, Tag } from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import type { AssociationFormFieldProps, AssociationValue } from '../../types';
import { FieldWrapper } from '../../core/FieldWrapper';
import { useFormContext } from '../../core/FormContext';
import { useDeviceDetect } from '../../hooks/useDeviceDetect';

type AssociationRecord = Record<string, any> & {
  __associationLabel: string;
  __associationValue: string | number;
};

const DEFAULT_PAGE_SIZE = 10;

const normalizeValues = (value: any): AssociationValue[] => {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value]).filter(
    (item) => item && item.value !== undefined && item.value !== null,
  );
};

const normalizeCellValue = (value: any) => {
  if (value === undefined || value === null || value === '') return '--';
  if (typeof value === 'object') {
    if ('label' in value) return String(value.label ?? '--');
    if ('name' in value) return String(value.name ?? '--');
    return JSON.stringify(value);
  }
  return String(value);
};

const normalizeSearchResult = (result: any) => {
  const payload = result?.data ?? result?.result ?? result ?? {};
  const list = Array.isArray(payload)
    ? payload
    : payload.list || payload.items || payload.records || payload.data || [];
  return {
    list: Array.isArray(list) ? list : [],
    total: payload.total ?? payload.totalCount ?? payload.count ?? list.length ?? 0,
  };
};

const stableSerialize = (value: any) => {
  try {
    return JSON.stringify(value, (_key, item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
      return Object.keys(item)
        .sort()
        .reduce<Record<string, any>>((next, key) => {
          next[key] = item[key];
          return next;
        }, {});
    });
  } catch {
    return String(value);
  }
};

export function AssociationFormField(props: AssociationFormFieldProps) {
  const {
    fieldId,
    label,
    behavior: propBehavior,
    required,
    tips,
    className,
    labelClassName,
    tipsClassName,
    inputClassName,
    placeholder,
    defaultValue,
    associationForm,
    multiple = false,
    allowClear = true,
    showSearch = true,
    onChange,
  } = props;
  const { formData, fieldBehaviors, setFieldValue, registerField, unregisterField, api } =
    useFormContext();
  const { isMobile } = useDeviceDetect();
  const behavior = propBehavior ?? fieldBehaviors[fieldId] ?? 'NORMAL';
  const rawValue = formData[fieldId];
  const value = useMemo(() => normalizeValues(rawValue), [rawValue]);
  const disabled = behavior === 'DISABLED';
  const [options, setOptions] = useState<AssociationValue[]>([]);
  const [selectLoading, setSelectLoading] = useState(false);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [tableLoading, setTableLoading] = useState(false);
  const [tableData, setTableData] = useState<AssociationRecord[]>([]);
  const [keyword, setKeyword] = useState('');
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    total: 0,
  });
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [selectedRecords, setSelectedRecords] = useState<AssociationRecord[]>([]);
  const formDataRef = useRef(formData);
  const associationFormRef = useRef(associationForm);

  useEffect(() => {
    registerField(fieldId);
    if (defaultValue !== undefined && formData[fieldId] === undefined) {
      setFieldValue(fieldId, normalizeValues(defaultValue));
    }
    return () => unregisterField(fieldId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldId]);

  useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);

  useEffect(() => {
    associationFormRef.current = associationForm;
  }, [associationForm]);

  const associationAppType = associationForm?.appType;
  const associationFormUuid = associationForm?.formUuid;
  const associationMainFieldId = associationForm?.mainFieldId;
  const canQuery = Boolean(associationAppType && associationFormUuid);
  const filterRulesKey = useMemo(
    () => stableSerialize(associationForm?.dataFilterRules || []),
    [associationForm?.dataFilterRules],
  );
  const currentFieldFilterKey = useMemo(() => {
    const rules = associationForm?.dataFilterRules || [];
    return stableSerialize(
      rules.map((rule) => {
        if (rule?.valueType !== 'currentField' || !rule.currentFieldKey) return null;
        return [rule.currentFieldKey, formData[rule.currentFieldKey]];
      }),
    );
  }, [formData, associationForm?.dataFilterRules]);
  const filterDependencyKey = useMemo(
    () => `${filterRulesKey}:${currentFieldFilterKey}`,
    [currentFieldFilterKey, filterRulesKey],
  );

  const normalizeRecord = useCallback(
    (record: Record<string, any>): AssociationRecord => {
      const mainFieldValue = associationMainFieldId ? record?.[associationMainFieldId] : undefined;
      const labelText = normalizeCellValue(mainFieldValue);
      const valueId =
        record?.formInstId ??
        record?.formInstID ??
        record?.bizObjectId ??
        record?.id ??
        record?.dataId ??
        record?.uuid ??
        labelText;
      return {
        ...record,
        __associationLabel: labelText,
        __associationValue: valueId,
      };
    },
    [associationMainFieldId],
  );

  const toValue = useCallback(
    (record: AssociationRecord): AssociationValue => ({
      label: record.__associationLabel,
      value: record.__associationValue,
      record,
    }),
    [],
  );

  const buildFilters = useCallback(() => {
    void filterDependencyKey;
    const rules = associationFormRef.current?.dataFilterRules || [];
    const currentFormData = formDataRef.current;
    return rules
      .map((rule) => {
        if (!rule?.key) return null;
        const sourceValue =
          rule.valueType === 'currentField' && rule.currentFieldKey
            ? currentFormData[rule.currentFieldKey]
            : rule.value;
        if (sourceValue === undefined || sourceValue === null || sourceValue === '') return null;
        return {
          key: rule.key,
          operator: rule.operator || 'EQ',
          componentName: rule.componentName,
          value:
            typeof sourceValue === 'object' && 'value' in sourceValue
              ? sourceValue.value
              : sourceValue,
        };
      })
      .filter(Boolean);
  }, [filterDependencyKey]);

  const fetchRecords = useCallback(
    async (params?: { currentPage?: number; pageSize?: number; searchKeyWord?: string }) => {
      if (!canQuery) return { list: [] as AssociationRecord[], total: 0 };
      const filters = buildFilters();
      const result = await api.advancedSearch({
        appType: associationAppType,
        formUuid: associationFormUuid,
        currentPage: params?.currentPage || 1,
        pageSize: params?.pageSize || DEFAULT_PAGE_SIZE,
        searchKeyWord: params?.searchKeyWord,
        ...(filters.length
          ? {
              filters: JSON.stringify(filters),
              conditionType: associationFormRef.current?.dataFilterConditionType || 'AND',
            }
          : {}),
      });
      const normalized = normalizeSearchResult(result);
      return {
        list: normalized.list.map((record: any) => normalizeRecord(record)),
        total: normalized.total,
      };
    },
    [api, associationAppType, associationFormUuid, buildFilters, canQuery, normalizeRecord],
  );

  const loadOptions = useCallback(
    async (searchKeyWord?: string) => {
      setSelectLoading(true);
      try {
        const result = await fetchRecords({ currentPage: 1, pageSize: 20, searchKeyWord });
        setOptions(result.list.map(toValue));
      } finally {
        setSelectLoading(false);
      }
    },
    [fetchRecords, toValue],
  );

  const loadTable = useCallback(
    async (next?: Partial<typeof pagination> & { searchKeyWord?: string }) => {
      setTableLoading(true);
      const current = next?.current || 1;
      const pageSize = next?.pageSize || pagination.pageSize;
      try {
        const result = await fetchRecords({
          currentPage: current,
          pageSize,
          searchKeyWord: next?.searchKeyWord ?? keyword,
        });
        setTableData(result.list);
        setPagination({ current, pageSize, total: result.total });
      } finally {
        setTableLoading(false);
      }
    },
    [fetchRecords, keyword, pagination.pageSize],
  );

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  useEffect(() => {
    setSelectedRowKeys(value.map((item) => item.value));
    setSelectedRecords(
      value
        .map((item) =>
          item.record ? normalizeRecord(item.record as Record<string, any>) : undefined,
        )
        .filter(Boolean) as AssociationRecord[],
    );
  }, [normalizeRecord, value]);

  const applyDataFilling = useCallback(
    (next: AssociationValue[]) => {
      if (!associationForm?.dataFillingEnabled && !associationForm?.dataFillingRules?.mainRules) {
        return;
      }
      const sourceRecord = next[0]?.record;
      if (!sourceRecord) return;
      (associationForm?.dataFillingRules?.mainRules || []).forEach((rule) => {
        if (!rule?.source || !rule?.target) return;
        setFieldValue(rule.target, sourceRecord[rule.source]);
      });
    },
    [associationForm?.dataFillingEnabled, associationForm?.dataFillingRules, setFieldValue],
  );

  const commitSelection = useCallback(
    (next: AssociationValue[]) => {
      const normalized = multiple ? next : next.slice(0, 1);
      setFieldValue(fieldId, normalized);
      applyDataFilling(normalized);
      onChange?.(normalized);
    },
    [applyDataFilling, fieldId, multiple, onChange, setFieldValue],
  );

  const selectorColumns: ColumnsType<AssociationRecord> = useMemo(() => {
    const configured = associationForm?.selectorColumns || [];
    if (configured.length) {
      return configured
        .map((column) => {
          if (typeof column === 'string') {
            return { title: column, dataIndex: column, key: column, ellipsis: true };
          }
          return {
            title: column.title || column.dataIndex,
            dataIndex: column.dataIndex,
            key: column.key || column.dataIndex,
            width: column.width,
            ellipsis: column.ellipsis ?? true,
            render: (cellValue: any, record: AssociationRecord) =>
              column.dataIndex === associationForm?.mainFieldId
                ? normalizeCellValue(record.__associationLabel)
                : normalizeCellValue(cellValue),
          };
        })
        .filter(Boolean) as ColumnsType<AssociationRecord>;
    }
    const mainFieldId = associationForm?.mainFieldId;
    return [
      {
        title: '主字段',
        dataIndex: mainFieldId || '__associationLabel',
        key: mainFieldId || '__associationLabel',
        ellipsis: true,
        render: (_cellValue: any, record: AssociationRecord) =>
          normalizeCellValue(record.__associationLabel),
      },
      {
        title: 'ID',
        dataIndex: '__associationValue',
        key: '__associationValue',
        ellipsis: true,
        render: (_cellValue: any, record: AssociationRecord) =>
          normalizeCellValue(record.__associationValue),
      },
    ];
  }, [associationForm?.mainFieldId, associationForm?.selectorColumns]);

  const selectOptions = useMemo(
    () =>
      [...options, ...value]
        .filter(
          (item, index, list) =>
            list.findIndex((candidate) => candidate.value === item.value) === index,
        )
        .map((item) => ({ label: item.label, value: item.value })),
    [options, value],
  );

  if (behavior === 'HIDDEN') return null;

  const readonlyContent = value.map((item) => item.label).join(', ') || '--';
  const openSelector = () => {
    if (disabled) return;
    setSelectorOpen(true);
    void loadTable({ current: 1 });
  };
  const picker = (
    <div className="sy-association-selector">
      <Input.Search
        allowClear
        enterButton="搜索"
        value={keyword}
        placeholder={associationForm?.mainFieldId ? '搜索关联数据' : '搜索'}
        onChange={(event) => {
          setKeyword(event.target.value);
          if (!event.target.value) void loadTable({ current: 1, searchKeyWord: '' });
        }}
        onSearch={(searchKeyWord) => {
          setKeyword(searchKeyWord);
          void loadTable({ current: 1, searchKeyWord });
        }}
      />
      <Table<AssociationRecord>
        rowKey="__associationValue"
        dataSource={tableData}
        columns={selectorColumns}
        loading={tableLoading}
        size="small"
        pagination={{
          current: pagination.current,
          pageSize: pagination.pageSize,
          total: pagination.total,
          onChange: (current, pageSize) => void loadTable({ current, pageSize }),
        }}
        rowSelection={{
          type: multiple ? 'checkbox' : 'radio',
          preserveSelectedRowKeys: true,
          selectedRowKeys,
          onChange: (keys, rows) => {
            setSelectedRowKeys(keys);
            setSelectedRecords(rows as AssociationRecord[]);
          },
        }}
        onChange={(nextPagination: TablePaginationConfig) => {
          void loadTable({
            current: nextPagination.current,
            pageSize: nextPagination.pageSize,
          });
        }}
        onRow={(record) => ({
          onClick: () => {
            if (multiple) {
              const exists = selectedRowKeys.includes(record.__associationValue);
              setSelectedRowKeys(
                exists
                  ? selectedRowKeys.filter((item) => item !== record.__associationValue)
                  : [...selectedRowKeys, record.__associationValue],
              );
              setSelectedRecords(
                exists
                  ? selectedRecords.filter(
                      (item) => item.__associationValue !== record.__associationValue,
                    )
                  : [...selectedRecords, record],
              );
              return;
            }
            setSelectedRowKeys([record.__associationValue]);
            setSelectedRecords([record]);
          },
          onDoubleClick: () => {
            commitSelection([toValue(record)]);
            setSelectorOpen(false);
          },
        })}
        scroll={{ x: true }}
      />
      {selectedRecords.length > 0 && (
        <div className="sy-association-selected">
          {selectedRecords.map((record) => (
            <Tag
              key={record.__associationValue}
              closable={!disabled}
              onClose={(event) => {
                event.preventDefault();
                setSelectedRowKeys((prev) =>
                  prev.filter((key) => key !== record.__associationValue),
                );
                setSelectedRecords((prev) =>
                  prev.filter((item) => item.__associationValue !== record.__associationValue),
                );
              }}
            >
              {record.__associationLabel}
            </Tag>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <FieldWrapper
      fieldId={fieldId}
      label={label}
      required={required}
      tips={tips}
      className={className}
      labelClassName={labelClassName}
      tipsClassName={tipsClassName}
    >
      {behavior === 'READONLY' ? (
        <div
          className="sy-field-readonly-value"
          data-testid={`associationformfield-readonly-${fieldId}`}
        >
          {readonlyContent}
        </div>
      ) : (
        <div className={`sy-select-with-picker ${inputClassName || ''}`}>
          <Select
            style={{ width: '100%' }}
            mode={multiple ? 'multiple' : undefined}
            allowClear={allowClear}
            showSearch={showSearch}
            filterOption={false}
            onSearch={showSearch ? loadOptions : undefined}
            disabled={disabled}
            placeholder={placeholder}
            loading={selectLoading}
            notFoundContent={selectLoading ? <Spin size="small" /> : undefined}
            options={selectOptions}
            value={multiple ? value.map((item) => item.value) : value[0]?.value}
            onChange={(nextValue) => {
              const ids = (Array.isArray(nextValue) ? nextValue : [nextValue]).filter(
                (item) => item !== undefined && item !== null,
              );
              const next = ids
                .map(
                  (id) =>
                    options.find((item) => item.value === id) ??
                    value.find((item) => item.value === id),
                )
                .filter(Boolean) as AssociationValue[];
              commitSelection(next);
            }}
            data-testid={`associationformfield-input-${fieldId}`}
          />
          <Button
            className="sy-picker-trigger"
            disabled={disabled}
            onClick={openSelector}
            data-testid={`associationformfield-picker-trigger-${fieldId}`}
          >
            选择
          </Button>
          {value.length > 0 && (
            <Button disabled={disabled} onClick={() => commitSelection([])}>
              清空
            </Button>
          )}
        </div>
      )}
      {isMobile ? (
        <Drawer
          title={associationForm?.formUuid || '选择关联数据'}
          placement="bottom"
          height="80%"
          open={selectorOpen}
          onClose={() => setSelectorOpen(false)}
          destroyOnClose
          footer={
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => setSelectorOpen(false)}>取消</Button>
              <Button
                type="primary"
                onClick={() => {
                  commitSelection(selectedRecords.map(toValue));
                  setSelectorOpen(false);
                }}
              >
                确定
              </Button>
            </Space>
          }
        >
          {picker}
        </Drawer>
      ) : (
        <Modal
          title={associationForm?.formUuid || '选择关联数据'}
          open={selectorOpen}
          width={760}
          onCancel={() => setSelectorOpen(false)}
          onOk={() => {
            commitSelection(selectedRecords.map(toValue));
            setSelectorOpen(false);
          }}
          okButtonProps={{ disabled: selectedRecords.length === 0 }}
          destroyOnClose
        >
          {picker}
        </Modal>
      )}
    </FieldWrapper>
  );
}

import { describe, expect, it, vi } from 'vitest';
import {
  advancedSearchDataManagement,
  batchApproveDataManagementRows,
  buildFilterPayload,
  deleteDataManagementRows,
  downloadDataManagementImportTemplate,
  exportDataManagementRows,
  getDataManagementConfig,
  getDataManagementSchema,
  getDataManagementTransferRecords,
  getSystemFieldsForFormType,
  importDataManagementRows,
  importPreviewDataManagementRows,
  normalizeColumnConfig,
  normalizeDataManagementFields,
  normalizeDataManagementList,
  saveDataManagementConfig,
  type DataManagementFilterGroup,
} from './dataManagementApi';
import type { FormRuntimeApi } from '../types';

describe('dataManagementApi', () => {
  it('normalizes legacy schema fields and list responses', async () => {
    const request = vi.fn().mockResolvedValue({
      data: {
        formType: 'process',
        formFields: {
          name: { label: '姓名', component_type: 'TextField' },
          section: { label: '分组', component_type: 'PageSection' },
        },
      },
    }) as FormRuntimeApi['request'];

    const result = await getDataManagementSchema(request, { appType: 'app', formUuid: 'form-1' });
    expect(result.formType).toBe('process');
    expect(result.fields).toEqual([
      expect.objectContaining({ fieldId: 'name', label: '姓名', componentName: 'TextField' }),
    ]);

    expect(
      normalizeDataManagementList({
        success: true,
        result: {
          totalCount: 2,
          data: [
            {
              formInstId: '1',
              instance_title: '实例 A',
              originatorName: 'Alice',
              originatorDepartmentName: '销售部',
              createTime: '2026-01-01 10:00:00',
              modifiedTime: '2026-01-02 10:00:00',
            },
            { id: '2' },
          ],
        },
      }),
    ).toEqual({
      total: 2,
      records: [
        expect.objectContaining({
          formInstanceId: '1',
          instanceTitle: '实例 A',
          createdByName: 'Alice',
          createdByDepartmentName: '销售部',
          createdAt: '2026-01-01 10:00:00',
          updatedAt: '2026-01-02 10:00:00',
        }),
        { id: '2' },
      ],
    });
  });

  it('normalizes fields from array, object, nested schema and skips PageSection fields', () => {
    expect(
      normalizeDataManagementFields({
        schema: {
          formType: 'normal',
          fields: [
            { id: 'title', title: '标题', component_type: 'TextField' },
            { id: 'section', label: '分组', componentName: 'PageSection' },
          ],
        },
      }),
    ).toEqual({
      formType: 'normal',
      fields: [
        expect.objectContaining({
          id: 'title',
          fieldId: 'title',
          label: '标题',
          componentName: 'TextField',
        }),
      ],
    });

    expect(
      normalizeDataManagementFields({
        formSchema: {
          fields: {
            amount: { name: '金额', componentName: 'NumberField', width: 120 },
            fallback: {},
          },
        },
      }).fields,
    ).toEqual([
      expect.objectContaining({ fieldId: 'amount', label: '金额', width: 120 }),
      expect.objectContaining({
        fieldId: 'fallback',
        label: 'fallback',
        componentName: 'TextField',
      }),
    ]);
  });

  it('normalizes React SPA v2 componentsTree payloads into strict data management schema', async () => {
    const request = vi.fn().mockResolvedValue({
      data: {
        formType: 'form',
        schema: {
          version: '2.0',
          formMeta: { title: '客户资料' },
          componentsTree: [
            {
              componentName: 'Page',
              children: [
                {
                  componentName: 'TextField',
                  id: 'customer_name_node',
                  title: '客户名称',
                  props: {
                    isFormComponent: true,
                    fieldId: 'customerName',
                    label: '客户名称',
                    required: true,
                  },
                },
              ],
            },
          ],
        },
      },
    }) as FormRuntimeApi['request'];

    const result = await getDataManagementSchema(request, {
      appType: 'APP_DEMO',
      formUuid: 'FORM_CUSTOMER',
    });

    expect(result.fields).toEqual([
      expect.objectContaining({
        fieldId: 'customerName',
        componentName: 'TextField',
        label: '客户名称',
        required: true,
      }),
    ]);
    expect(result.schema).toEqual(
      expect.objectContaining({
        version: '2.0',
        fields: [
          expect.objectContaining({
            fieldId: 'customerName',
            componentName: 'TextField',
          }),
        ],
        layout: [expect.objectContaining({ type: 'field', fieldId: 'customerName' })],
        formMeta: expect.objectContaining({
          appType: 'APP_DEMO',
          formUuid: 'FORM_CUSTOMER',
          title: '客户资料',
        }),
        template: expect.objectContaining({
          type: 'standard',
          formType: 'form',
        }),
      }),
    );
  });

  it('builds strict data management schema from formFields object payloads', () => {
    const result = normalizeDataManagementFields({
      data: {
        appType: 'APP_DEMO',
        formUuid: 'FORM_LEGACY',
        formName: '老表单',
        formFields: {
          amount: { name: '金额', componentName: 'NumberField', width: 120 },
          section: { label: '分组', componentName: 'PageSection' },
        },
      },
    });

    expect(result.fields).toEqual([
      expect.objectContaining({ fieldId: 'amount', label: '金额', componentName: 'NumberField' }),
    ]);
    expect(result.schema).toEqual(
      expect.objectContaining({
        fields: [
          expect.objectContaining({
            fieldId: 'amount',
            label: '金额',
            componentName: 'NumberField',
          }),
        ],
        layout: [expect.objectContaining({ type: 'field', fieldId: 'amount' })],
        formMeta: expect.objectContaining({
          appType: 'APP_DEMO',
          formUuid: 'FORM_LEGACY',
          title: '老表单',
        }),
        template: expect.objectContaining({
          type: 'standard',
        }),
      }),
    );
  });

  it('adds base and process system fields according to form type', () => {
    const baseFields = getSystemFieldsForFormType('normal');
    const processFields = getSystemFieldsForFormType('process');

    expect(baseFields.map((field) => field.fieldId)).toContain('createdAt');
    expect(baseFields.some((field) => field.fieldId === 'approvalResult')).toBe(false);
    expect(processFields.map((field) => field.fieldId)).toEqual(
      expect.arrayContaining(['createdAt', 'processInstanceStatus', 'approvalResult']),
    );
  });

  it('normalizes list payload aliases and non-object records defensively', () => {
    expect(
      normalizeDataManagementList({
        data: {
          records: [
            {
              form_instance_id: 'inst-1',
              processInstanceTitle: '流程标题',
              created_by_name: 'Bob',
              originatorCorpName: '研发部',
              gmtCreate: '2026-01-01',
              gmtModified: '2026-01-02',
            },
            'raw-record',
          ],
          count: '2',
        },
      }),
    ).toEqual({
      total: 2,
      records: [
        expect.objectContaining({
          formInstanceId: 'inst-1',
          instanceTitle: '流程标题',
          createdByName: 'Bob',
          createdByDepartmentName: '研发部',
          createdAt: '2026-01-01',
          updatedAt: '2026-01-02',
        }),
        'raw-record',
      ],
    });

    expect(normalizeDataManagementList({ items: [{ id: 1 }] })).toEqual({
      total: 1,
      records: [{ id: 1 }],
    });
    expect(normalizeDataManagementList({ list: 'not-array', total: 'bad-total' })).toEqual({
      total: 0,
      records: [],
    });
  });

  it('recursively unwraps advanced-search result envelopes and preserves list aliases', () => {
    expect(
      normalizeDataManagementList({
        success: true,
        code: 200,
        result: {
          result: {
            data: [{ formInstId: 'nested-1', instance_title: '嵌套记录' }],
            totalCount: 17,
            currentPage: 1,
          },
        },
      }),
    ).toEqual({
      total: 17,
      records: [expect.objectContaining({ formInstanceId: 'nested-1', instanceTitle: '嵌套记录' })],
    });

    for (const key of ['records', 'list', 'rows', 'items']) {
      expect(
        normalizeDataManagementList({ result: { result: { [key]: [{ id: key }], total: 1 } } }),
      ).toEqual({ total: 1, records: [{ id: key }] });
    }
  });

  it('builds nested filters and removes empty rules', () => {
    const group: DataManagementFilterGroup = {
      id: 'root',
      logic: 'AND',
      rules: [
        { id: 'r1', key: 'name', operator: 'contains', value: 'Alice' },
        { id: 'r2', key: 'empty', operator: 'contains', value: '' },
      ],
      conditions: [
        {
          id: 'child',
          logic: 'OR',
          rules: [{ id: 'r3', key: 'amount', operator: 'gt', value: 100 }],
          conditions: [],
        },
      ],
    };

    expect(JSON.parse(buildFilterPayload(group) || '{}')).toEqual({
      id: 'root',
      logic: 'AND',
      rules: [{ id: 'r1', key: 'name', operator: 'CONTAINS', value: 'Alice' }],
      conditions: [
        {
          id: 'child',
          logic: 'OR',
          rules: [{ id: 'r3', key: 'amount', operator: 'GT', value: 100 }],
          conditions: [],
        },
      ],
    });
  });

  it('returns undefined filter payload for empty groups and keeps falsey valid values', () => {
    expect(buildFilterPayload()).toBeUndefined();
    expect(
      buildFilterPayload({ id: 'empty', logic: 'AND', rules: [], conditions: [] }),
    ).toBeUndefined();

    expect(
      JSON.parse(
        buildFilterPayload({
          id: 'root',
          logic: 'AND',
          rules: [
            { id: 'zero', key: 'count', operator: 'eq', value: 0 },
            { id: 'false', key: 'enabled', operator: 'eq', value: false },
            { id: 'missing-key', key: '', operator: 'eq', value: 'x' },
            { id: 'missing-op', key: 'name', operator: '', value: 'x' },
          ],
          conditions: [{ id: 'child-empty', logic: 'OR', rules: [], conditions: [] }],
        }) || '{}',
      ),
    ).toEqual({
      id: 'root',
      logic: 'AND',
      rules: [
        { id: 'zero', key: 'count', operator: 'EQ', value: 0 },
        { id: 'false', key: 'enabled', operator: 'EQ', value: false },
      ],
      conditions: [],
    });
  });

  it('keeps no-value filter operators and serializes them with null value', () => {
    expect(
      JSON.parse(
        buildFilterPayload({
          id: 'root',
          logic: 'AND',
          rules: [
            { id: 'empty-date', key: 'startDate', operator: 'is_null', value: '' },
            { id: 'not-empty', key: 'owner', operator: 'IS_NOT_NULL', value: undefined },
          ],
          conditions: [],
        }) || '{}',
      ),
    ).toEqual({
      id: 'root',
      logic: 'AND',
      rules: [
        { id: 'empty-date', key: 'startDate', operator: 'IS_NULL', value: null },
        { id: 'not-empty', key: 'owner', operator: 'IS_NOT_NULL', value: null },
      ],
      conditions: [],
    });
  });

  it('normalizes column config against available fields', () => {
    const config = normalizeColumnConfig(
      {
        showFields: ['name', 'missing'],
        widths: { name: 180 },
        lockFieldIds: ['name'],
        density: 'compact',
        detailOpenMode: 'newPage',
        pageSize: 50,
      },
      [
        { id: 'name', fieldId: 'name', label: '姓名', componentName: 'TextField' },
        { id: 'amount', fieldId: 'amount', label: '金额', componentName: 'NumberField' },
      ],
    );

    expect(config.showFields).toEqual(['name']);
    expect(config.widths.name).toBe(180);
    expect(config.density).toBe('compact');
    expect(config.detailOpenMode).toBe('newPage');
    expect(config.pageSize).toBe(50);

    const defaultConfig = normalizeColumnConfig(undefined, [
      { id: 'name', fieldId: 'name', label: '姓名', componentName: 'TextField' },
      {
        id: 'createdByName',
        fieldId: 'createdByName',
        label: '创建人',
        componentName: 'TextField',
        system: true,
        displayable: true,
      },
    ]);
    expect(defaultConfig.showFields).toEqual(['name', 'createdByName']);

    const fallbackConfig = normalizeColumnConfig(
      { showFields: ['missing'], sort: 'not-array' as any, detailOpenMode: 'drawer', pageSize: 0 },
      [
        { id: 'name', fieldId: 'name', label: '姓名', componentName: 'TextField' },
        { id: 'amount', fieldId: 'amount', label: '金额', componentName: 'NumberField' },
      ],
    );
    expect(fallbackConfig.showFields).toEqual(['name', 'amount']);
    expect(fallbackConfig.sort).toEqual([]);
    expect(fallbackConfig.detailOpenMode).toBe('drawer');
    expect(fallbackConfig.pageSize).toBe(10);
  });

  it('uses legacy data management endpoints for config and advanced search', async () => {
    const request = vi
      .fn()
      .mockResolvedValue({ result: { data: [], totalCount: 0 } }) as FormRuntimeApi['request'];

    await advancedSearchDataManagement(request, {
      appType: 'crm',
      formUuid: 'form-1',
      currentPage: 2,
      pageSize: 20,
      order: [{ id: 'createTime', isAsc: 'n' }],
    });

    expect(request).toHaveBeenLastCalledWith(
      expect.objectContaining({
        url: '/crm/v1/form/advancedSearch.json',
        method: 'get',
        params: expect.objectContaining({
          formUuid: 'form-1',
          currentPage: 2,
          pageSize: 20,
          order: JSON.stringify([{ id: 'createTime', isAsc: 'n' }]),
        }),
      }),
    );

    await getDataManagementConfig(request, {
      appType: 'crm',
      formUuid: 'form-1',
      menuFormUuid: 'menu-1',
      scope: 'personal',
    });
    expect(request).toHaveBeenLastCalledWith(
      expect.objectContaining({
        url: '/crm/v1/form/dataManagement/config/personal/get.json',
        params: { formUuid: 'menu-1' },
      }),
    );

    await saveDataManagementConfig(request, {
      appType: 'crm',
      formUuid: 'form-1',
      scope: 'global',
      expectedRevision: 1,
      config: { showFields: ['name'] },
    });
    expect(request).toHaveBeenLastCalledWith(
      expect.objectContaining({
        url: '/crm/v1/form/dataManagement/config/save.json',
        method: 'post',
        data: {
          formUuid: 'form-1',
          config: { showFields: ['name'] },
          expectedRevision: 1,
        },
      }),
    );

    await downloadDataManagementImportTemplate(request, {
      appType: 'crm',
      formUuid: 'form-1',
    });
    expect(request).toHaveBeenLastCalledWith(
      expect.objectContaining({
        url: '/crm/v1/form/advancedExportTemplate.xlsx',
        method: 'get',
        responseType: 'blob',
        params: { formUuid: 'form-1' },
      }),
    );
  });

  it('keeps legacy batch approval and selected export payloads compatible', async () => {
    const request = vi.fn().mockResolvedValue({ success: true }) as FormRuntimeApi['request'];

    await batchApproveDataManagementRows(request, {
      appType: 'crm',
      formUuid: 'form-1',
      formInstanceIds: ['inst-1', 'inst-2'],
      action: 'rejected',
      comments: '资料不完整',
    });
    expect(request).toHaveBeenLastCalledWith(
      expect.objectContaining({
        url: '/workflow/approve/batch',
        method: 'post',
        data: {
          instanceIds: ['inst-1', 'inst-2'],
          action: 'rejected',
          comments: '资料不完整',
        },
      }),
    );

    await exportDataManagementRows(request, {
      appType: 'crm',
      formUuid: 'form-1',
      rawFilters: JSON.stringify([{ key: 'form_instance_id', operator: 'EQ', value: 'inst-1' }]),
      conditionType: 'OR',
      currentPage: 1,
      pageSize: 1,
      exportAll: 'n',
      exportFields: ['name', 'amount'],
    });
    expect(request).toHaveBeenLastCalledWith(
      expect.objectContaining({
        url: '/crm/v1/form/advancedExport.xlsx',
        method: 'get',
        responseType: 'blob',
        params: expect.objectContaining({
          filters: JSON.stringify([{ key: 'form_instance_id', operator: 'EQ', value: 'inst-1' }]),
          conditionType: 'OR',
          currentPage: 1,
          pageSize: 1,
          exportAll: 'n',
          exportFields: 'name,amount',
        }),
      }),
    );
  });

  it('deletes, imports and reads transfer records with legacy endpoint payloads', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ data: { result: { success: true } } })
      .mockResolvedValueOnce({ result: { previewRows: [{ id: 1 }] } })
      .mockResolvedValueOnce({ data: { imported: 2 } })
      .mockResolvedValueOnce({
        data: { result: { items: [{ id: 'job-1' }], total: 1 } },
      }) as FormRuntimeApi['request'];

    await expect(
      deleteDataManagementRows(request, {
        appType: 'crm',
        formUuid: 'form-1',
        formInstanceIds: ['inst-1'],
      }),
    ).resolves.toEqual({ success: true });
    expect(request).toHaveBeenLastCalledWith(
      expect.objectContaining({
        url: '/crm/v1/form/deleteFormData.json',
        method: 'post',
        data: {
          appType: 'crm',
          formUuid: 'form-1',
          formInstId: 'inst-1',
          formInstIds: ['inst-1'],
          formInstanceIds: ['inst-1'],
        },
      }),
    );

    await expect(
      importPreviewDataManagementRows(request, {
        appType: 'crm',
        formUuid: 'form-1',
        fileBase64: 'base64-preview',
      }),
    ).resolves.toEqual({ previewRows: [{ id: 1 }] });
    expect(request).toHaveBeenLastCalledWith(
      expect.objectContaining({
        url: '/crm/v1/form/importPreview.xlsx',
        method: 'post',
        data: { formUuid: 'form-1', fileBase64: 'base64-preview' },
      }),
    );

    await expect(
      importDataManagementRows(request, {
        appType: 'crm',
        formUuid: 'form-1',
        fileBase64: 'base64-import',
      }),
    ).resolves.toEqual({ imported: 2 });
    expect(request).toHaveBeenLastCalledWith(
      expect.objectContaining({
        url: '/crm/v1/form/import.xlsx',
        method: 'post',
        data: { formUuid: 'form-1', fileBase64: 'base64-import' },
      }),
    );

    await expect(
      getDataManagementTransferRecords(request, {
        appType: 'crm',
        formUuid: 'form-1',
        type: 'import',
        currentPage: 2,
        pageSize: 5,
      }),
    ).resolves.toEqual({ total: 1, records: [{ id: 'job-1' }] });
    expect(request).toHaveBeenLastCalledWith(
      expect.objectContaining({
        url: '/crm/v1/form/importRecords.json',
        method: 'get',
        params: {
          appType: 'crm',
          formUuid: 'form-1',
          type: 'import',
          currentPage: 2,
          pageSize: 5,
        },
      }),
    );
  });

  it('passes export defaults and query fallbacks to the legacy export endpoint', async () => {
    const request = vi.fn().mockResolvedValue(new Blob(['xlsx'])) as FormRuntimeApi['request'];

    await exportDataManagementRows(request, {
      appType: 'crm',
      formUuid: 'form-1',
      filters: {
        id: 'root',
        logic: 'AND',
        rules: [{ id: 'r1', key: 'name', operator: 'contains', value: 'Alice' }],
        conditions: [],
      },
    });

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/crm/v1/form/advancedExport.xlsx',
        responseType: 'blob',
        params: expect.objectContaining({
          filters: JSON.stringify({
            id: 'root',
            logic: 'AND',
            rules: [{ id: 'r1', key: 'name', operator: 'CONTAINS', value: 'Alice' }],
            conditions: [],
          }),
          order: '[]',
          exportAll: 'n',
          embedImages: 'n',
          exportFields: '',
        }),
      }),
    );
  });
});

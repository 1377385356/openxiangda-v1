import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveDefaultValueLinkage, resolveOptions } from './optionSource';
import type { FormRuntimeConfig, OptionSourceConfig } from '../types';

const createRuntime = (
  fetchFormData: NonNullable<FormRuntimeConfig['fetchFormData']>,
): FormRuntimeConfig => ({
  appType: 'crm',
  fetchFormData,
});

describe('optionSource', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns empty options for custom or incomplete dynamic source config', async () => {
    await expect(resolveOptions({ type: 'custom' }, undefined, {})).resolves.toEqual([]);
    await expect(resolveOptions({ type: 'linkedForm' }, undefined, {})).resolves.toEqual([]);
    await expect(resolveOptions({ type: 'dataLinkage' }, undefined, {})).resolves.toEqual([]);
    await expect(resolveOptions({ type: 'unknown' } as any, undefined, {})).resolves.toEqual([]);
  });

  it('returns empty options when runtime does not provide fetchFormData', async () => {
    const linkedConfig: OptionSourceConfig = {
      type: 'linkedForm',
      linkedForm: { formUuid: 'customer', fieldId: 'name' },
    };
    const linkageConfig: OptionSourceConfig = {
      type: 'dataLinkage',
      dataLinkage: {
        formUuid: 'customer',
        targetFieldId: 'city',
        conditions: [{ localFieldId: 'province', remoteFieldId: 'province', operator: 'eq' }],
      },
    };

    await expect(resolveOptions(linkedConfig, {}, {})).resolves.toEqual([]);
    await expect(resolveOptions(linkageConfig, {}, { province: '浙江' })).resolves.toEqual([]);
  });

  it('builds linked form query params, filters empty values and deduplicates options', async () => {
    const fetchFormData = vi.fn().mockResolvedValue({
      data: [
        { city: '杭州' },
        { city: '杭州' },
        { city: '宁波' },
        { city: '' },
        { city: { value: 'suzhou', label: '苏州' } },
        { value: 'fallback', label: 'Fallback label' },
      ],
    });
    const runtime = createRuntime(fetchFormData);

    const options = await resolveOptions(
      {
        type: 'linkedForm',
        linkedForm: {
          formUuid: 'city-form',
          fieldId: 'city',
          filters: [{ fieldId: 'enabled', operator: 'eq', value: true }],
          sortField: 'city',
          sortOrder: 'desc',
          deduplicate: true,
        },
      },
      runtime,
      {},
    );

    expect(fetchFormData).toHaveBeenCalledWith({
      formUuid: 'city-form',
      appType: 'crm',
      filters: [{ fieldId: 'enabled', operator: 'eq', value: true }],
      sort: { field: 'city', order: 'desc' },
      fieldId: 'city',
      deduplicate: true,
      pageSize: 200,
    });
    expect(options).toEqual([
      { value: '杭州', label: '杭州' },
      { value: '宁波', label: '宁波' },
      { value: 'suzhou', label: '苏州' },
      { value: 'fallback', label: 'Fallback label' },
    ]);
  });

  it('uses linked form defaults when optional filters and sort are omitted', async () => {
    const fetchFormData = vi.fn().mockResolvedValue({ data: [{ value: 100, label: '一百' }] });

    await expect(
      resolveOptions(
        {
          type: 'linkedForm',
          linkedForm: { formUuid: 'numbers', fieldId: 'amount' },
        },
        createRuntime(fetchFormData),
        {},
      ),
    ).resolves.toEqual([{ value: '100', label: '一百' }]);

    expect(fetchFormData).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: [],
        sort: undefined,
        deduplicate: undefined,
      }),
    );
  });

  it('uses separate label/value fields and appends keyword filter for remote search', async () => {
    const fetchFormData = vi.fn().mockResolvedValue({
      data: [
        { collegeCode: 'college_science', collegeName: '理学院' },
        { collegeCode: 'college_design', collegeName: '设计学院' },
      ],
    });

    const options = await resolveOptions(
      {
        type: 'linkedForm',
        linkedForm: {
          formUuid: 'college-form',
          fieldId: 'collegeName',
          valueFieldId: 'collegeCode',
          labelFieldId: 'collegeName',
          searchFieldId: 'collegeName',
          pageSize: 20,
          remoteSearch: true,
          filters: [{ fieldId: 'enabled', operator: 'eq', value: true }],
        },
      },
      createRuntime(fetchFormData),
      {},
      '学院',
    );

    expect(fetchFormData).toHaveBeenCalledWith(
      expect.objectContaining({
        formUuid: 'college-form',
        fieldId: 'collegeName',
        pageSize: 20,
        filters: [
          { fieldId: 'enabled', operator: 'eq', value: true },
          { fieldId: 'collegeName', operator: 'contains', value: '学院' },
        ],
      }),
    );
    expect(options).toEqual([
      { value: 'college_science', label: '理学院' },
      { value: 'college_design', label: '设计学院' },
    ]);
  });

  it('returns empty linked form options and logs when fetch fails', async () => {
    const error = new Error('network failed');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchFormData = vi.fn().mockRejectedValue(error);

    await expect(
      resolveOptions(
        {
          type: 'linkedForm',
          linkedForm: { formUuid: 'city-form', fieldId: 'city' },
        },
        createRuntime(fetchFormData),
        {},
      ),
    ).resolves.toEqual([]);
    expect(errorSpy).toHaveBeenCalledWith(
      '[FormComponents] resolveLinkedFormOptions failed:',
      error,
    );
  });

  it('builds data linkage query params from current form data', async () => {
    const fetchFormData = vi.fn().mockResolvedValue({
      data: [
        { city: '杭州' },
        { city: '杭州' },
        { value: '绍兴', label: '绍兴市' },
        { city: null },
      ],
    });

    const options = await resolveOptions(
      {
        type: 'dataLinkage',
        dataLinkage: {
          formUuid: 'city-form',
          targetFieldId: 'city',
          conditionLogic: 'or',
          deduplicate: true,
          conditions: [
            { localFieldId: 'province', remoteFieldId: 'province', operator: 'eq' },
            { localFieldId: 'level', remoteFieldId: 'level', operator: 'gte' },
          ],
        },
      },
      createRuntime(fetchFormData),
      { province: '浙江', level: 2 },
    );

    expect(fetchFormData).toHaveBeenCalledWith({
      formUuid: 'city-form',
      appType: 'crm',
      filters: [
        { fieldId: 'province', operator: 'eq', value: '浙江' },
        { fieldId: 'level', operator: 'gte', value: 2 },
      ],
      conditionLogic: 'or',
      fieldId: 'city',
      deduplicate: true,
      pageSize: 200,
    });
    expect(options).toEqual([
      { value: '杭州', label: '杭州' },
      { value: '绍兴', label: '绍兴市' },
    ]);
  });

  it('normalizes option and organization values before querying linked data', async () => {
    const fetchFormData = vi.fn().mockResolvedValue({ data: [{ city: '杭州' }] });

    await resolveOptions(
      {
        type: 'dataLinkage',
        dataLinkage: {
          formUuid: 'city-form',
          targetFieldId: 'city',
          conditions: [
            { localFieldId: 'stage', remoteFieldId: 'stage', operator: 'eq' },
            { localFieldId: 'owners', remoteFieldId: 'owners', operator: 'contains' },
          ],
        },
      },
      createRuntime(fetchFormData),
      {
        stage: { value: 'new', label: '新建' },
        owners: [
          { id: 'u-1', name: '张三' },
          { userid: 'u-2', name: '李四' },
        ],
      },
    );

    expect(fetchFormData).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: [
          { fieldId: 'stage', operator: 'eq', value: 'new' },
          { fieldId: 'owners', operator: 'in', value: ['u-1', 'u-2'] },
        ],
      }),
    );
  });

  it('keeps duplicate data linkage options when deduplicate is disabled', async () => {
    const fetchFormData = vi.fn().mockResolvedValue({
      data: [{ city: '杭州' }, { city: '杭州' }],
    });

    await expect(
      resolveOptions(
        {
          type: 'dataLinkage',
          dataLinkage: {
            formUuid: 'city-form',
            targetFieldId: 'city',
            conditions: [],
          },
        },
        createRuntime(fetchFormData),
        {},
      ),
    ).resolves.toEqual([
      { value: '杭州', label: '杭州' },
      { value: '杭州', label: '杭州' },
    ]);
  });

  it('returns empty data linkage options and logs when fetch fails', async () => {
    const error = new Error('linkage failed');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchFormData = vi.fn().mockRejectedValue(error);

    await expect(
      resolveOptions(
        {
          type: 'dataLinkage',
          dataLinkage: {
            formUuid: 'city-form',
            targetFieldId: 'city',
            conditions: [],
          },
        },
        createRuntime(fetchFormData),
        {},
      ),
    ).resolves.toEqual([]);
    expect(errorSpy).toHaveBeenCalledWith(
      '[FormComponents] resolveDataLinkageOptions failed:',
      error,
    );
  });

  it('resolves default value linkage from the first matched row', async () => {
    const fetchFormData = vi.fn().mockResolvedValue({
      data: [{ amount: 128, value: 99 }],
    });

    await expect(
      resolveDefaultValueLinkage(
        {
          formUuid: 'order-form',
          targetFieldId: 'amount',
          conditionLogic: 'and',
          conditions: [{ localFieldId: 'customerId', remoteFieldId: 'customer', operator: 'eq' }],
        },
        createRuntime(fetchFormData),
        { customerId: 'c-1' },
      ),
    ).resolves.toBe(128);
    expect(fetchFormData).toHaveBeenCalledWith({
      formUuid: 'order-form',
      appType: 'crm',
      filters: [{ fieldId: 'customer', operator: 'eq', value: 'c-1' }],
      conditionLogic: 'and',
      fieldId: 'amount',
      pageSize: 200,
    });
  });

  it('falls back to row.value and undefined for default value linkage edge cases', async () => {
    const fetchFormData = vi
      .fn()
      .mockResolvedValueOnce({ data: [{ value: 'fallback-value' }] })
      .mockResolvedValueOnce({ data: [] });
    const runtime = createRuntime(fetchFormData);
    const config = { formUuid: 'order-form', targetFieldId: 'amount', conditions: [] };

    await expect(resolveDefaultValueLinkage(config, runtime, {})).resolves.toBe('fallback-value');
    await expect(resolveDefaultValueLinkage(config, runtime, {})).resolves.toBeUndefined();
    await expect(resolveDefaultValueLinkage(config, {}, {})).resolves.toBeUndefined();
  });

  it('returns undefined default linkage value and logs when fetch fails', async () => {
    const error = new Error('default linkage failed');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchFormData = vi.fn().mockRejectedValue(error);

    await expect(
      resolveDefaultValueLinkage(
        { formUuid: 'order-form', targetFieldId: 'amount', conditions: [] },
        createRuntime(fetchFormData),
        {},
      ),
    ).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(
      '[FormComponents] resolveDefaultValueLinkage failed:',
      error,
    );
  });
});

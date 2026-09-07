import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LowcodePageSchema } from '../types';
import { LowcodePageRenderer } from './LowcodePageRenderer';

vi.mock('../modules/DataManagementList', async () => {
  const React = await import('react');
  return {
    DataManagementList: (props: any) => {
      void props.requestOverride?.({
        url: '/api/list',
        method: 'post',
        params: { keyword: 'a', empty: '', skipped: null },
        data: { page: 1 },
        headers: { 'x-test': '1' },
      });
      return React.createElement(
        'div',
        {
          'data-testid': 'data-list',
          'data-app-type': props.appType,
          'data-form-uuid': props.formUuid,
          'data-readonly': String(props.readonly),
          'data-full-height': String(props.fullHeight),
          'data-config-scope': props.configScope,
          'data-allow-schema-fallback': String(props.allowSchemaFallback),
        },
        props.title,
      );
    },
  };
});

vi.mock('./StandardFormPage', async () => {
  const React = await import('react');
  return {
    StandardFormPage: (props: any) =>
      React.createElement(
        'div',
        {
          'data-testid': 'form-block',
          'data-mode': props.mode,
          'data-app-type': props.appType,
          'data-form-uuid': props.formUuid,
          'data-in-drawer': String(props.inDrawer),
        },
        props.schema?.formMeta?.title,
      ),
  };
});

const basePageSchema: LowcodePageSchema = {
  schemaKind: 'page',
  pageMeta: {
    pageId: 'page-1',
    appType: 'app-a',
    title: '页面',
  },
  nodes: [],
};

describe('LowcodePageRenderer', () => {
  it('renders sections, grids, text blocks, data lists and embedded form blocks', async () => {
    const bridgeInvoke = vi.fn().mockResolvedValue({ ok: true });
    const schema: LowcodePageSchema = {
      ...basePageSchema,
      nodes: [
        {
          id: 'section-1',
          type: 'PageSection',
          props: { title: '分组标题', description: '分组说明' },
          children: [
            {
              id: 'heading-1',
              type: 'HeadingBlock',
              props: { text: '页面标题', level: 1 },
            },
            {
              id: 'text-1',
              type: 'TextBlock',
              props: { text: '页面正文' },
            },
          ],
        },
        {
          id: 'grid-1',
          type: 'PageGrid',
          props: { columns: 5, gap: 12 },
          cells: [
            {
              key: 'cell0',
              children: [
                {
                  id: 'table-1',
                  type: 'DataManagementList',
                  props: {
                    title: '数据表格',
                    formUuid: 'form-a',
                    readonly: false,
                    fullHeight: false,
                    configScope: 'global',
                  },
                },
              ],
            },
            {
              key: 'cell1',
              children: [
                {
                  id: 'form-1',
                  type: 'FormBlock',
                  props: {
                    mode: 'edit',
                    appType: 'app-b',
                    formUuid: 'form-b',
                    inDrawer: false,
                    schema: {
                      formMeta: {
                        formUuid: 'form-b',
                        appType: 'app-b',
                        title: '内嵌表单',
                      },
                      fields: [],
                    },
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    render(
      <LowcodePageRenderer
        schema={schema}
        context={{
          appType: 'runtime-app',
          mode: 'readonly',
          compatibility: { legacyFallbacks: true },
          bridge: { invoke: bridgeInvoke },
        }}
      />,
    );

    expect(screen.getByText('分组标题')).toBeInTheDocument();
    expect(screen.getByText('分组说明')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '页面标题', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('页面正文')).toBeInTheDocument();
    expect(screen.getByTestId('data-list')).toHaveAttribute('data-app-type', 'runtime-app');
    expect(screen.getByTestId('data-list')).toHaveAttribute('data-form-uuid', 'form-a');
    expect(screen.getByTestId('data-list')).toHaveAttribute('data-readonly', 'false');
    expect(screen.getByTestId('data-list')).toHaveAttribute('data-full-height', 'false');
    expect(screen.getByTestId('data-list')).toHaveAttribute('data-config-scope', 'personal');
    expect(screen.getByTestId('data-list')).toHaveAttribute('data-allow-schema-fallback', 'true');
    expect(screen.getByTestId('form-block')).toHaveAttribute('data-mode', 'edit');
    expect(screen.getByTestId('form-block')).toHaveAttribute('data-app-type', 'app-b');
    expect(screen.getByTestId('form-block')).toHaveAttribute('data-form-uuid', 'form-b');
    expect(screen.getByTestId('form-block')).toHaveAttribute('data-in-drawer', 'false');

    await waitFor(() => {
      expect(bridgeInvoke).toHaveBeenCalledWith('transport.request', {
        path: '/api/list',
        method: 'post',
        query: 'keyword=a',
        body: { page: 1 },
        headers: { 'x-test': '1' },
      });
    });
  });

  it('renders default copy, unknown nodes and skips incomplete runtime nodes', () => {
    const schema: LowcodePageSchema = {
      ...basePageSchema,
      nodes: [
        { id: 'heading-default', type: 'HeadingBlock', props: { level: 9 } },
        { id: 'text-default', type: 'TextBlock', props: {} },
        { id: 'table-missing-form', type: 'DataManagementList', props: {} },
        { id: 'form-missing-schema', type: 'FormBlock', props: {} },
        {
          id: 'unknown',
          type: 'UnknownNode',
          props: {},
          children: [{ id: 'nested-text', type: 'TextBlock', props: { text: '未知节点内容' } }],
        },
      ],
    };

    render(<LowcodePageRenderer schema={schema} />);

    expect(screen.getByRole('heading', { name: '标题', level: 4 })).toBeInTheDocument();
    expect(screen.getByText('未知节点内容')).toBeInTheDocument();
    expect(screen.queryByTestId('data-list')).not.toBeInTheDocument();
    expect(screen.queryByTestId('form-block')).not.toBeInTheDocument();
  });
});

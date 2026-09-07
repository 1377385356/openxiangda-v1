import React, { useMemo } from 'react';
import type { LowcodePageNode, LowcodePageSchema, RuntimeRequestConfig } from '../types';
import { normalizePreviewBlobResponse } from '../file-preview/capabilities';
import { DataManagementList } from '../modules/DataManagementList';
import { StandardFormPage } from './StandardFormPage';

export interface LowcodePageRuntimeContext {
  appType?: string;
  mode?: string;
  compatibility?: {
    apiContracts?: 'strict' | 'legacy';
    legacyFallbacks?: boolean;
  };
  route?: Record<string, any>;
  bridge?: {
    invoke?: (method: string, payload?: any) => Promise<any>;
  };
  [key: string]: any;
}

export interface LowcodePageRendererProps {
  schema: LowcodePageSchema;
  context?: LowcodePageRuntimeContext;
}

function nodeChildren(node: LowcodePageNode) {
  if (Array.isArray(node.children)) return node.children;
  if (Array.isArray(node.cells)) return node.cells.flatMap((cell) => cell.children || []);
  return [];
}

function createRuntimeRequest(context?: LowcodePageRuntimeContext) {
  if (typeof context?.bridge?.invoke !== 'function') return undefined;
  return async (config: RuntimeRequestConfig) => {
    const search = config.params ? new URLSearchParams() : null;
    if (search) {
      Object.entries(config.params || {}).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          search.set(key, String(value));
        }
      });
    }
    const isBinary = config.responseType === 'blob';
    const response = await context.bridge?.invoke?.(
      isBinary ? 'transport.download' : 'transport.request',
      {
      path: config.url,
      method: config.method || 'get',
      query: search?.toString(),
      body: config.data,
      headers: config.headers,
      },
    );
    return isBinary ? normalizePreviewBlobResponse(response) : response;
  };
}

export function LowcodePageRenderer({ schema, context }: LowcodePageRendererProps) {
  const appType = context?.appType || schema.pageMeta.appType;
  const requestOverride = useMemo(() => createRuntimeRequest(context), [context]);

  const renderNode = (node: LowcodePageNode): React.ReactNode => {
    const props = node.props || {};
    const children = nodeChildren(node);

    if (node.type === 'PageSection') {
      return (
        <section key={node.id} className="sy-page-section">
          {(props.title || props.description) && (
            <div className="sy-page-section-header">
              {props.title && <h2 className="sy-page-section-title">{props.title}</h2>}
              {props.description && (
                <p className="sy-page-section-description">{props.description}</p>
              )}
            </div>
          )}
          <div className="sy-page-section-body">{children.map(renderNode)}</div>
        </section>
      );
    }

    if (node.type === 'PageGrid') {
      const columns = Math.min(Math.max(Number(props.columns || 2), 1), 4);
      const style: React.CSSProperties = {
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gap: props.gap ?? 16,
      };
      return (
        <div key={node.id} className="sy-page-grid" style={style}>
          {children.map(renderNode)}
        </div>
      );
    }

    if (node.type === 'HeadingBlock') {
      const level = Math.min(Math.max(Number(props.level || 2), 1), 4);
      const tagName = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4';
      return React.createElement(
        tagName,
        { key: node.id, className: 'sy-page-heading' },
        props.text || props.title || '标题',
      );
    }

    if (node.type === 'TextBlock') {
      return (
        <p key={node.id} className="sy-page-text">
          {props.text || ''}
        </p>
      );
    }

    if (node.type === 'DataManagementList') {
      const formUuid = props.formUuid || props.relateFormUuid;
      if (!formUuid) return null;
      return (
        <DataManagementList
          key={node.id}
          appType={props.appType || appType}
          formUuid={formUuid}
          title={props.title}
          formTitle={props.formTitle}
          formType={props.formType}
          readonly={props.readonly ?? true}
          fullHeight={props.fullHeight ?? true}
          configScope="personal"
          forcedConfig={props.forcedConfig}
          showForcedConfig={props.showForcedConfig}
          maxVisibleRowActions={props.maxVisibleRowActions}
          requestOverride={requestOverride}
          allowSchemaFallback={
            props.allowSchemaFallback ?? context?.compatibility?.legacyFallbacks ?? false
          }
        />
      );
    }

    if (node.type === 'FormBlock' && props.schema) {
      return (
        <StandardFormPage
          key={node.id}
          schema={props.schema}
          mode={props.mode || context?.mode || 'submit'}
          appType={props.appType || appType}
          formUuid={props.formUuid || props.schema?.formMeta?.formUuid}
          compatibility={props.compatibility || context?.compatibility}
          inDrawer={props.inDrawer ?? true}
        />
      );
    }

    return (
      <div key={node.id} className="sy-page-unknown-node" data-node-type={node.type}>
        {children.map(renderNode)}
      </div>
    );
  };

  return <div className="sy-lowcode-page">{schema.nodes.map(renderNode)}</div>;
}

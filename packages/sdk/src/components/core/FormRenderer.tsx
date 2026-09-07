import React from 'react';
import { useFormContext } from './FormContext';
import { useComponent } from './ComponentRegistry';
import { FormGrid, FormSection, FormSteps, FormTabs } from '../layout';
import type { FieldDefinition, FormLayoutNode, LayoutVisibleWhen } from '../types';
import { evaluateCondition } from './effects';

export interface FormRendererProps {
  className?: string;
  fieldClassName?: string;
  columns?: 1 | 2 | 3 | 4;
  size?: 'compact' | 'default' | 'large';
}

const columnsClassMap: Record<number, string> = {
  1: 'sy-grid-cols-1',
  2: 'sy-grid-cols-1 md:sy-grid-cols-2',
  3: 'sy-grid-cols-1 md:sy-grid-cols-2 lg:sy-grid-cols-3',
  4: 'sy-grid-cols-1 md:sy-grid-cols-2 lg:sy-grid-cols-4',
};

const sizeClassMap: Record<string, string> = {
  compact: 'sy-gap-y-4 sy-gap-x-4',
  default: 'sy-gap-y-6 sy-gap-x-6',
  large: 'sy-gap-y-8 sy-gap-x-8',
};

const defaultFullWidthComponents = new Set(['SubFormField', 'EditorField', 'JSONField']);

function getDefaultFieldWrapperClass(
  field: Pick<FieldDefinition, 'componentName'>,
  renderContext: LayoutRenderContext,
  hasExplicitGridColumn = false,
) {
  if (renderContext === 'grid' || hasExplicitGridColumn) return undefined;
  return defaultFullWidthComponents.has(field.componentName)
    ? 'sy-layout-field-full'
    : 'sy-layout-field';
}

function shouldSpanImplicitGrid(field: Pick<FieldDefinition, 'componentName'>, columns: number) {
  return columns > 1 && defaultFullWidthComponents.has(field.componentName);
}

function getImplicitGridWrapperClass(
  field: Pick<FieldDefinition, 'componentName'>,
  columns: number,
) {
  if (columns === 1) return getDefaultFieldWrapperClass(field, 'root');
  return shouldSpanImplicitGrid(field, columns) ? 'sy-layout-field-full' : undefined;
}

function getImplicitGridStyle(field: Pick<FieldDefinition, 'componentName'>, columns: number) {
  return shouldSpanImplicitGrid(field, columns) ? { gridColumn: '1 / -1' } : undefined;
}

function isImplicitFieldOnlyLayout(layout: FormLayoutNode[] | undefined): boolean {
  return Boolean(
    layout?.length &&
    layout.every((node) => node.type === 'field' && !node.span && !node.className),
  );
}

function FieldRenderer({
  field,
  fieldClassName,
  wrapperClassName,
  style,
}: {
  field: FieldDefinition;
  fieldClassName?: string;
  wrapperClassName?: string;
  style?: React.CSSProperties;
}) {
  const Component = useComponent(field.componentName);
  if (field.behavior === 'HIDDEN') return null;

  if (!Component) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        `[FormRenderer] Component "${field.componentName}" is not registered, skipping field "${field.fieldId}".`,
      );
    }
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { fieldId, componentName: _, ...fieldProps } = field;

  const element = React.createElement(Component, {
    ...fieldProps,
    fieldId,
    className: fieldClassName ?? fieldProps.className,
  });
  return style || wrapperClassName ? (
    <div className={wrapperClassName} style={style}>
      {element}
    </div>
  ) : (
    element
  );
}

type LayoutRenderContext = 'root' | 'section' | 'grid' | 'tabs' | 'steps';

function LayoutNodeRenderer({
  node,
  fieldMap,
  fieldClassName,
  renderContext = 'root',
}: {
  node: FormLayoutNode;
  fieldMap: Map<string, FieldDefinition>;
  fieldClassName?: string;
  renderContext?: LayoutRenderContext;
}) {
  const { formData, fieldBehaviors, fieldOverrides, layoutBehaviors, dynamicOptions } =
    useFormContext();
  if (node.hidden || layoutBehaviors[node.id] === 'HIDDEN') return null;
  if (!isLayoutVisible(node.visibleWhen, formData)) return null;

  if (node.type === 'field') {
    const field = fieldMap.get(node.fieldId);
    if (!field) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[FormRenderer] layout references missing field "${node.fieldId}".`);
      }
      return null;
    }
    const mergedField = {
      ...field,
      ...(dynamicOptions[node.fieldId] ? { options: dynamicOptions[node.fieldId] } : {}),
      ...(fieldOverrides[node.fieldId] ?? {}),
      behavior: fieldBehaviors[node.fieldId] ?? field.behavior ?? 'NORMAL',
    };
    const gridColumn = node.span ? `span ${node.span} / span ${node.span}` : undefined;
    const wrapperClassName = getDefaultFieldWrapperClass(
      mergedField,
      renderContext,
      Boolean(gridColumn),
    );
    return (
      <FieldRenderer
        field={mergedField}
        fieldClassName={node.className ?? fieldClassName}
        wrapperClassName={wrapperClassName}
        style={gridColumn ? { gridColumn } : undefined}
      />
    );
  }

  if (node.type === 'section') {
    return (
      <FormSection
        title={node.title}
        description={node.description}
        variant={node.variant}
        accent={node.accent}
        iconKey={node.iconKey}
        collapsible={node.collapsible}
        defaultCollapsed={node.defaultCollapsed}
        contentClassName="sy-form-layout"
      >
        {node.children.map((child) => (
          <LayoutNodeRenderer
            key={child.id}
            node={child}
            fieldMap={fieldMap}
            fieldClassName={fieldClassName}
            renderContext="section"
          />
        ))}
      </FormSection>
    );
  }

  if (node.type === 'grid') {
    const cells = Array.isArray(node.cells) ? node.cells : [];

    return (
      <FormGrid
        columns={node.columns}
        gap={node.gap}
        columnGap={node.columnGap}
        rowGap={node.rowGap}
        columnRatios={node.columnRatios}
      >
        {cells.length > 0
          ? cells.map((cell, index) => (
              <div
                className="sy-grid-cell"
                key={cell.key ?? `${node.id}-cell-${index}`}
                aria-hidden={cell.children.length === 0}
              >
                {cell.children.map((child) => (
                  <LayoutNodeRenderer
                    key={child.id}
                    node={child}
                    fieldMap={fieldMap}
                    fieldClassName={fieldClassName}
                    renderContext="grid"
                  />
                ))}
              </div>
            ))
          : node.children.map((child) => (
              <LayoutNodeRenderer
                key={child.id}
                node={child}
                fieldMap={fieldMap}
                fieldClassName={fieldClassName}
                renderContext="grid"
              />
            ))}
      </FormGrid>
    );
  }

  if (node.type === 'tabs') {
    return (
      <FormTabs
        defaultActiveKey={node.defaultActiveKey}
        items={node.items.map((item) => ({
          key: item.key,
          label: item.label,
          children: (
            <div className="sy-form-layout">
              {item.children.map((child) => (
                <LayoutNodeRenderer
                  key={child.id}
                  node={child}
                  fieldMap={fieldMap}
                  fieldClassName={fieldClassName}
                  renderContext="tabs"
                />
              ))}
            </div>
          ),
        }))}
      />
    );
  }

  return (
    <FormSteps
      items={node.items.map((item) => ({
        key: item.key,
        title: item.title,
        description: item.description,
        children: (
          <div className="sy-form-layout">
            {item.children.map((child) => (
              <LayoutNodeRenderer
                key={child.id}
                node={child}
                fieldMap={fieldMap}
                fieldClassName={fieldClassName}
                renderContext="steps"
              />
            ))}
          </div>
        ),
      }))}
    />
  );
}

export function FormRenderer({
  className,
  fieldClassName,
  columns = 1,
  size = 'default',
}: FormRendererProps) {
  const { schema, formData, fieldBehaviors, fieldOverrides, layoutBehaviors, dynamicOptions } =
    useFormContext();

  const gridClass = columnsClassMap[columns];
  const gapClass = sizeClassMap[size];
  const containerClassName = ['sy-form-renderer', 'sy-grid', gridClass, gapClass, className]
    .filter(Boolean)
    .join(' ');
  const fieldMap = React.useMemo(() => {
    return new Map(
      schema.fields.map((field) => [
        field.fieldId,
        {
          ...field,
          ...(dynamicOptions[field.fieldId] ? { options: dynamicOptions[field.fieldId] } : {}),
          ...(fieldOverrides[field.fieldId] ?? {}),
          behavior: fieldBehaviors[field.fieldId] ?? field.behavior ?? 'NORMAL',
        },
      ]),
    );
  }, [schema.fields, fieldBehaviors, fieldOverrides, dynamicOptions]);

  if (isImplicitFieldOnlyLayout(schema.layout)) {
    return (
      <div className={containerClassName} data-testid="form-renderer">
        {schema.layout?.map((node) => {
          if (node.type !== 'field') return null;
          if (node.hidden || layoutBehaviors[node.id] === 'HIDDEN') return null;
          if (!isLayoutVisible(node.visibleWhen, formData)) return null;
          const field = fieldMap.get(node.fieldId);
          if (!field) {
            if (process.env.NODE_ENV !== 'production') {
              console.warn(`[FormRenderer] layout references missing field "${node.fieldId}".`);
            }
            return null;
          }
          return (
            <FieldRenderer
              key={node.id}
              field={field}
              fieldClassName={fieldClassName}
              wrapperClassName={getImplicitGridWrapperClass(field, columns)}
              style={getImplicitGridStyle(field, columns)}
            />
          );
        })}
      </div>
    );
  }

  if (schema.layout && schema.layout.length > 0) {
    const layoutClassName = ['sy-form-renderer', 'sy-form-layout', className]
      .filter(Boolean)
      .join(' ');
    return (
      <div className={layoutClassName} data-testid="form-renderer">
        {schema.layout.map((node) => (
          <LayoutNodeRenderer
            key={node.id}
            node={node}
            fieldMap={fieldMap}
            fieldClassName={fieldClassName}
            renderContext="root"
          />
        ))}
      </div>
    );
  }

  return (
    <div className={containerClassName} data-testid="form-renderer">
      {schema.fields.map((field) => {
        const mergedField = fieldMap.get(field.fieldId) ?? field;
        return (
          <FieldRenderer
            key={field.fieldId}
            field={mergedField}
            fieldClassName={fieldClassName}
            wrapperClassName={getImplicitGridWrapperClass(mergedField, columns)}
            style={getImplicitGridStyle(mergedField, columns)}
          />
        );
      })}
    </div>
  );
}

function isLayoutVisible(
  visibleWhen: LayoutVisibleWhen | LayoutVisibleWhen[] | undefined,
  formData: Record<string, any>,
): boolean {
  if (!visibleWhen) return true;
  const conditions = Array.isArray(visibleWhen) ? visibleWhen : [visibleWhen];
  return conditions.every((condition) => evaluateCondition(condition, formData));
}

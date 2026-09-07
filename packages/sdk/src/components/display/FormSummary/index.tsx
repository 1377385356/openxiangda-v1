import React from 'react';
import { useFormContext } from '../../core/FormContext';
import type { FieldDefinition } from '../../types';
import { normalizeRichTextHtml } from '../../utils/richText';

export interface FormSummaryProps {
  className?: string;
  labelClassName?: string;
  valueClassName?: string;
  columns?: 1 | 2 | 3;
  fields?: string[];
}

const columnClasses: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 md:grid-cols-2',
  3: 'grid-cols-1 md:grid-cols-3',
};

export function FormSummary({
  className,
  labelClassName,
  valueClassName,
  columns = 2,
  fields,
}: FormSummaryProps) {
  const { schema, formData } = useFormContext();

  const displayFields = fields
    ? schema.fields.filter((f) => fields.includes(f.fieldId))
    : schema.fields;

  const colClass = columnClasses[columns];

  const getText = (item: any): string => {
    if (item === null || item === undefined || item === '') return '';
    if (typeof item !== 'object') return String(item);
    return String(
      item.label ||
        item.name ||
        item.title ||
        item.fullAddress ||
        item.text ||
        item.value ||
        item.id ||
        '',
    );
  };

  const formatObject = (value: Record<string, any>): React.ReactNode => {
    if (value.start || value.end) {
      return [value.start, value.end].filter(Boolean).join(' ~ ') || '--';
    }
    const text = getText(value);
    if (text) return text;
    return <pre className="sy-summary-json">{JSON.stringify(value, null, 2)}</pre>;
  };

  const formatValue = (field: FieldDefinition, value: any): React.ReactNode => {
    if (value === null || value === undefined || value === '') return '--';
    if (field.componentName === 'EditorField') {
      const html = normalizeRichTextHtml(value);
      if (!html) return '--';
      return (
        <span
          className="sy-editor-readonly sy-summary-richtext"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    }
    if (field.componentName === 'JSONField') {
      return typeof value === 'string' ? (
        value
      ) : (
        <pre className="sy-summary-json">{JSON.stringify(value, null, 2)}</pre>
      );
    }
    if (field.componentName === 'CascadeDateField' && typeof value === 'object') {
      return formatObject(value);
    }
    if (Array.isArray(value)) {
      if (value.length === 0) return '--';
      return value
        .map((item) => {
          if (Array.isArray(item)) return item.map(getText).filter(Boolean).join(' / ');
          if (typeof item === 'object') return getText(item) || JSON.stringify(item);
          return String(item);
        })
        .filter(Boolean)
        .join(', ');
    }
    if (typeof value === 'object') return formatObject(value);
    return String(value);
  };

  return (
    <div className={className ?? `grid ${colClass} gap-4`} data-testid="form-summary">
      {displayFields.map((field) => (
        <div
          key={field.fieldId}
          className="flex flex-col"
          data-testid={`summary-field-${field.fieldId}`}
        >
          <span className={labelClassName ?? 'text-sm text-gray-500 mb-1'}>{field.label}</span>
          <div className={valueClassName ?? 'text-sm text-gray-900'}>
            {formatValue(field, formData[field.fieldId])}
          </div>
        </div>
      ))}
    </div>
  );
}

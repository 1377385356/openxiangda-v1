import React, { useEffect, useRef, useState } from 'react';
import { Input } from 'antd';
import type { JSONFieldProps } from '../../types';
import { FieldWrapper } from '../../core/FieldWrapper';
import { useFormContext } from '../../core/FormContext';

const formatJson = (value: any, indent = 2) => {
  if (value === undefined || value === null || value === '') return '--';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, indent);
  } catch {
    return String(value);
  }
};

const formatJsonForEditing = (value: any, indent = 2) => {
  if (value === undefined || value === null || value === '') return '';
  try {
    return JSON.stringify(value, null, indent);
  } catch {
    return String(value);
  }
};

const parseJson = (text: string) => {
  if (!text.trim()) return { value: undefined, error: undefined };
  try {
    return { value: JSON.parse(text), error: undefined };
  } catch {
    return { value: undefined, error: '请输入有效的 JSON' };
  }
};

export function JSONField(props: JSONFieldProps) {
  const {
    fieldId,
    label,
    behavior: propBehavior,
    required,
    tips,
    className,
    labelClassName,
    tipsClassName,
    readonlyClassName,
    inputClassName,
    placeholder = '请输入有效的 JSON',
    defaultValue,
    indent = 2,
    rows = 8,
    renderer,
    editor,
    onChange,
    onBlur,
  } = props;
  const { formData, fieldBehaviors, setFieldValue, setFieldError, registerField, unregisterField } =
    useFormContext();
  const behavior = propBehavior ?? fieldBehaviors[fieldId] ?? 'NORMAL';
  const value = formData[fieldId];
  const [editorText, setEditorText] = useState(() => formatJsonForEditing(value, indent));
  const [parseError, setParseError] = useState<string | undefined>();
  const editingRef = useRef(false);

  useEffect(() => {
    registerField(fieldId);
    if (defaultValue !== undefined && formData[fieldId] === undefined) {
      setFieldValue(fieldId, defaultValue);
    }
    return () => unregisterField(fieldId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldId]);

  useEffect(() => {
    if (editingRef.current) return;
    setEditorText(formatJsonForEditing(value, indent));
    setParseError(undefined);
  }, [indent, value]);

  if (behavior === 'HIDDEN') return null;

  const renderContext = {
    fieldId,
    label,
    value,
    formattedValue: formatJson(value, indent),
    behavior,
  };
  const updateValue = (nextValue: any) => {
    setFieldValue(fieldId, nextValue);
    onChange?.(nextValue);
  };
  const handleTextChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextText = event.target.value;
    editingRef.current = true;
    setEditorText(nextText);
    const parsed = parseJson(nextText);
    setParseError(parsed.error);
    setFieldError(fieldId, parsed.error);
    if (!parsed.error) updateValue(parsed.value);
  };
  const handleStructuredChange = (nextValue: any) => {
    editingRef.current = true;
    setEditorText(formatJsonForEditing(nextValue, indent));
    setParseError(undefined);
    setFieldError(fieldId, null);
    updateValue(nextValue);
  };
  const handleEditorError = (error?: string) => {
    setParseError(error);
    setFieldError(fieldId, error);
  };
  const handleBlur = () => {
    editingRef.current = false;
    const parsed = parseJson(editorText);
    setParseError(parsed.error);
    setFieldError(fieldId, parsed.error);
    if (!parsed.error) {
      setEditorText(formatJsonForEditing(parsed.value, indent));
      onBlur?.(parsed.value);
      return;
    }
    onBlur?.(value);
  };

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
        renderer ? (
          renderer(renderContext)
        ) : (
          <pre
            className={readonlyClassName || 'sy-field-readonly-value'}
            data-testid={`jsonfield-readonly-${fieldId}`}
          >
            {renderContext.formattedValue}
          </pre>
        )
      ) : editor ? (
        editor({
          ...renderContext,
          disabled: behavior === 'DISABLED',
          error: parseError,
          onChange: handleStructuredChange,
          onError: handleEditorError,
        })
      ) : (
        <div>
          <Input.TextArea
            className={inputClassName}
            data-testid={`jsonfield-input-${fieldId}`}
            value={editorText}
            placeholder={placeholder}
            rows={rows}
            disabled={behavior === 'DISABLED'}
            status={parseError ? 'error' : undefined}
            aria-invalid={Boolean(parseError)}
            spellCheck={false}
            onFocus={() => {
              editingRef.current = true;
            }}
            onChange={handleTextChange}
            onBlur={handleBlur}
          />
          {parseError && (
            <div className="sy-field-error" role="alert" data-testid={`jsonfield-error-${fieldId}`}>
              {parseError}
            </div>
          )}
        </div>
      )}
    </FieldWrapper>
  );
}

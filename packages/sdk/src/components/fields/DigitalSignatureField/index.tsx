import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Modal, Space } from 'antd';
import type {
  DigitalSignatureFieldProps,
  DigitalSignatureValue,
  SignaturePoint,
} from '../../types';
import { FieldWrapper } from '../../core/FieldWrapper';
import { useFormContext } from '../../core/FormContext';

const CANVAS_HEIGHT = 260;

const computeSHA512 = async (text: string) => {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buffer = await crypto.subtle.digest('SHA-512', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buffer))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(index);
    hash |= 0;
  }
  return `fallback-${Math.abs(hash).toString(16)}`;
};

export function DigitalSignatureField(props: DigitalSignatureFieldProps) {
  const {
    fieldId,
    label,
    behavior: propBehavior,
    required,
    tips,
    className,
    labelClassName,
    tipsClassName,
    defaultValue,
    bucketName = 'signatures',
    allowClear = true,
    onChange,
  } = props;
  const { formData, fieldBehaviors, setFieldValue, registerField, unregisterField, api } =
    useFormContext();
  const behavior = propBehavior ?? fieldBehaviors[fieldId] ?? 'NORMAL';
  const value = formData[fieldId] as DigitalSignatureValue | undefined;
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drawn, setDrawn] = useState(false);
  const [error, setError] = useState('');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const pointsRef = useRef<SignaturePoint[]>([]);

  useEffect(() => {
    registerField(fieldId);
    if (defaultValue !== undefined && formData[fieldId] === undefined) {
      setFieldValue(fieldId, defaultValue);
    }
    return () => unregisterField(fieldId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldId]);

  const prepareCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cssWidth = Math.max(1, rect.width || canvas.parentElement?.clientWidth || 640);
    const cssHeight = CANVAS_HEIGHT;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    canvas.width = Math.floor(cssWidth * dpr);
    canvas.height = Math.floor(cssHeight * dpr);
    canvas.style.width = '100%';
    canvas.style.height = `${cssHeight}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cssWidth, cssHeight);
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111827';
  }, []);

  useEffect(() => {
    if (!open) return;
    pointsRef.current = [];
    setDrawn(false);
    setError('');
    requestAnimationFrame(() => requestAnimationFrame(prepareCanvas));
  }, [open, prepareCanvas]);

  if (behavior === 'HIDDEN') return null;

  const setValue = (next?: DigitalSignatureValue) => {
    setFieldValue(fieldId, next);
    onChange?.(next);
  };

  const getPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const scaleX = rect.width ? canvas.width / rect.width : dpr;
    const scaleY = rect.height ? canvas.height / rect.height : dpr;
    return {
      x: ((event.clientX - rect.left) * scaleX) / dpr,
      y: ((event.clientY - rect.top) * scaleY) / dpr,
      t: Date.now(),
    };
  };

  const stopDrawing = (event?: React.PointerEvent<HTMLCanvasElement>) => {
    event?.preventDefault();
    if (event?.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
    drawingRef.current = false;
  };

  const clearCanvas = () => {
    pointsRef.current = [];
    setDrawn(false);
    setError('');
    prepareCanvas();
  };

  const save = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!pointsRef.current.length) {
      setError('请先完成签名');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('生成签名图片失败');
      const file = new File([blob], `signature-${Date.now()}.png`, { type: 'image/png' });
      const uploaded = await api.uploadFile(file, bucketName);
      const payload: Omit<DigitalSignatureValue, 'hash'> = {
        url: uploaded.url,
        bucketName: uploaded.bucketName || bucketName,
        objectName: uploaded.objectName,
        previewUrl: uploaded.previewUrl || uploaded.url,
        points: pointsRef.current.slice(),
        timestamp: Date.now(),
      };
      const hash = await computeSHA512(JSON.stringify(payload));
      setValue({ ...payload, hash });
      setOpen(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '签名保存失败');
    } finally {
      setSaving(false);
    }
  };

  const previewUrl = value?.previewUrl || value?.url;

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
      <div className="sy-signature-field" data-testid={`digitalsignaturefield-${fieldId}`}>
        {previewUrl ? (
          <button
            type="button"
            className="sy-signature-preview"
            onClick={() => setOpen(behavior !== 'READONLY')}
            disabled={behavior === 'READONLY'}
          >
            <img src={previewUrl} alt={label} />
          </button>
        ) : (
          <span className="sy-field-readonly-value">--</span>
        )}
        {value?.hash && (
          <div className="sy-signature-hash">SHA-512: {value.hash.slice(0, 24)}...</div>
        )}
        {behavior !== 'READONLY' && (
          <Space>
            <Button disabled={behavior === 'DISABLED'} onClick={() => setOpen(true)}>
              {previewUrl ? '重新签名' : '开始签名'}
            </Button>
            {allowClear && (
              <Button disabled={behavior === 'DISABLED'} onClick={() => setValue(undefined)}>
                清空
              </Button>
            )}
          </Space>
        )}
        <Modal
          open={open}
          title={label}
          onCancel={() => setOpen(false)}
          onOk={save}
          confirmLoading={saving}
          okButtonProps={{ disabled: !drawn }}
          width={720}
          destroyOnClose
          afterOpenChange={(nextOpen) => {
            if (nextOpen) requestAnimationFrame(() => requestAnimationFrame(prepareCanvas));
          }}
        >
          <div className="sy-signature-canvas-wrap">
            <canvas
              ref={canvasRef}
              style={{
                width: '100%',
                height: CANVAS_HEIGHT,
                border: '1px solid #d9d9d9',
                touchAction: 'none',
                userSelect: 'none',
              }}
              onPointerDown={(event) => {
                event.preventDefault();
                event.currentTarget.setPointerCapture?.(event.pointerId);
                drawingRef.current = true;
                const point = getPoint(event);
                pointsRef.current.push(point);
                const ctx = event.currentTarget.getContext('2d');
                if (ctx) {
                  ctx.beginPath();
                  ctx.fillStyle = '#111827';
                  if (typeof ctx.arc === 'function') {
                    ctx.arc(point.x, point.y, 0.8, 0, Math.PI * 2);
                    ctx.fill();
                  } else {
                    ctx.fillRect(point.x, point.y, 1, 1);
                  }
                }
                setDrawn(true);
              }}
              onPointerMove={(event) => {
                event.preventDefault();
                if (!drawingRef.current) return;
                const canvas = canvasRef.current;
                const ctx = canvas?.getContext('2d');
                const last = pointsRef.current[pointsRef.current.length - 1];
                const next = getPoint(event);
                if (ctx && last) {
                  ctx.beginPath();
                  ctx.moveTo(last.x, last.y);
                  ctx.lineTo(next.x, next.y);
                  ctx.stroke();
                }
                pointsRef.current.push(next);
              }}
              onPointerUp={(event) => {
                stopDrawing(event);
              }}
              onPointerCancel={stopDrawing}
              onPointerLeave={stopDrawing}
              data-testid={`digitalsignaturefield-canvas-${fieldId}`}
            />
            {error && <div className="sy-field-error">{error}</div>}
            <Button onClick={clearCanvas} disabled={saving}>
              清空画布
            </Button>
          </div>
        </Modal>
      </div>
    </FieldWrapper>
  );
}

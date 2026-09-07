import React, { useEffect, useState } from 'react';
import { Button, Space } from 'antd';
import type { LocationFieldProps, LocationValue } from '../../types';
import { FieldWrapper } from '../../core/FieldWrapper';
import { useFormContext } from '../../core/FormContext';

const getDingTalkApi = () => {
  if (typeof window === 'undefined') return undefined;
  return (window as any).dd || (window as any).dingtalk || (window as any).DingTalkPC;
};

const isDingTalkEnvironment = () => {
  if (typeof navigator === 'undefined') return false;
  return /DingTalk/i.test(navigator.userAgent || '') || Boolean(getDingTalkApi());
};

const normalizeDingTalkLocation = (res: any): LocationValue => ({
  latitude: Number(res.latitude),
  longitude: Number(res.longitude),
  address: res.address || res.snippet || res.title || res.poiName,
  city: res.city,
  district: res.adName || res.district,
  province: res.province,
  name: res.title || res.poiName || res.address,
  accuracy: res.accuracy ? Number(res.accuracy) : undefined,
  source: 'dingTalk',
  time: Date.now(),
});

export function LocationField(props: LocationFieldProps) {
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
    allowClear = true,
    locateButtonText = '获取定位',
    clearButtonText = '清空',
    onChange,
  } = props;
  const { formData, fieldBehaviors, setFieldValue, registerField, unregisterField, api } =
    useFormContext();
  const behavior = propBehavior ?? fieldBehaviors[fieldId] ?? 'NORMAL';
  const value = formData[fieldId] as LocationValue | undefined;
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    registerField(fieldId);
    if (defaultValue !== undefined && formData[fieldId] === undefined) {
      setFieldValue(fieldId, defaultValue);
    }
    return () => unregisterField(fieldId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldId]);

  if (behavior === 'HIDDEN') return null;

  const setValue = (next?: LocationValue) => {
    setFieldValue(fieldId, next);
    onChange?.(next);
  };

  const ensureDingTalkReady = async () => {
    const dingTalk = getDingTalkApi();
    if (!dingTalk) throw new Error('当前环境不支持钉钉定位');
    if (typeof dingTalk.config !== 'function') return dingTalk;
    const currentUrl =
      typeof window !== 'undefined' ? window.location.href.split('#')[0] : undefined;
    const signature = currentUrl ? await api.getDingTalkSignature(currentUrl) : undefined;
    dingTalk.config({
      agentId: signature?.agentId,
      corpId: signature?.corpId,
      timeStamp: signature?.timeStamp || signature?.timestamp,
      nonceStr: signature?.nonceStr,
      signature: signature?.signature,
      jsApiList: ['getLocation', 'locateInMap', 'device.geolocation.get', 'biz.map.locate'],
    });
    await new Promise<void>((resolve, reject) => {
      if (typeof dingTalk.ready !== 'function') {
        resolve();
        return;
      }
      dingTalk.ready(() => resolve());
      if (typeof dingTalk.error === 'function') dingTalk.error((err: any) => reject(err));
      setTimeout(resolve, 3000);
    });
    return dingTalk;
  };

  const locateWithDingTalk = async () => {
    const dingTalk = await ensureDingTalkReady();
    return new Promise<LocationValue>((resolve, reject) => {
      const options = {
        type: 1,
        useCache: true,
        coordinate: '1',
        cacheTimeout: 20,
        withReGeocode: true,
        targetAccuracy: '200',
        success: (res: any) => resolve(normalizeDingTalkLocation(res)),
        fail: (err: any) => reject(err || new Error('定位失败')),
        complete: () => undefined,
      };
      if (typeof dingTalk.getLocation === 'function') {
        dingTalk.getLocation(options);
        return;
      }
      if (typeof dingTalk.device?.geolocation?.get === 'function') {
        dingTalk.device.geolocation.get(options);
        return;
      }
      reject(new Error('当前钉钉版本不支持定位'));
    });
  };

  const locateWithBrowser = async () =>
    new Promise<LocationValue>((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('当前浏览器不支持定位'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            source: 'browser',
            time: Date.now(),
          });
        },
        (geoError) => reject(geoError || new Error('定位失败')),
        { enableHighAccuracy: true, timeout: 10000 },
      );
    });

  const locate = async () => {
    setLocating(true);
    setError('');
    try {
      const next = isDingTalkEnvironment()
        ? await locateWithDingTalk().catch(() => locateWithBrowser())
        : await locateWithBrowser();
      setValue(next);
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : '定位失败');
    } finally {
      setLocating(false);
    }
  };

  const display = value
    ? value.address || value.name || `${value.latitude.toFixed(6)}, ${value.longitude.toFixed(6)}`
    : '--';

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
      <div className="sy-location-field" data-testid={`locationfield-${fieldId}`}>
        <div className="sy-field-readonly-value">{display}</div>
        {value?.accuracy !== undefined && (
          <div className="sy-location-meta">精度约 {Math.round(value.accuracy)} 米</div>
        )}
        {error && <div className="sy-field-error">{error}</div>}
        {behavior !== 'READONLY' && (
          <Space>
            <Button
              type="primary"
              loading={locating}
              disabled={behavior === 'DISABLED'}
              onClick={locate}
            >
              {locateButtonText}
            </Button>
            {allowClear && (
              <Button
                disabled={behavior === 'DISABLED'}
                onClick={() => {
                  setError('');
                  setValue(undefined);
                }}
              >
                {clearButtonText}
              </Button>
            )}
          </Space>
        )}
      </div>
    </FieldWrapper>
  );
}

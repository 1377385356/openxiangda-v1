import React, { type ReactNode } from 'react';
import { ConfigProvider as MobileConfigProvider } from 'antd-mobile';
import { antdMobileChineseLocale } from '../../utils/dateLocale';

export function MobileLocaleProvider({ children }: { children: ReactNode }) {
  return <MobileConfigProvider locale={antdMobileChineseLocale}>{children}</MobileConfigProvider>;
}

import dayjs from 'dayjs';
import antdZhCN from 'antd/locale/zh_CN.js';
import antdDatePickerZhCN from 'antd/lib/date-picker/locale/zh_CN.js';
import antdMobileZhCN from 'antd-mobile/es/locales/zh-CN.js';
import 'dayjs/locale/zh-cn.js';

let localeReady = false;

export function ensureChineseDateLocale() {
  if (!localeReady || dayjs.locale() !== 'zh-cn') {
    dayjs.locale('zh-cn');
    localeReady = true;
  }
}

ensureChineseDateLocale();

export const antdChineseLocale = antdZhCN;
export const antdDatePickerChineseLocale = antdDatePickerZhCN;
export const antdMobileChineseLocale = antdMobileZhCN;

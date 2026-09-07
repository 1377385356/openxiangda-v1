import dayjs, { type Dayjs } from 'dayjs';
import type { DateRestrictionConfig } from '../../types';

/**
 * 根据日期限制配置生成 antd DatePicker 的 disabledDate 函数
 */
export function getDisabledDate(
  restriction?: DateRestrictionConfig,
): ((current: Dayjs) => boolean) | undefined {
  if (!restriction || restriction.type === 'none') return undefined;

  return (current: Dayjs) => {
    switch (restriction.type) {
      case 'todayAndAfter':
        return current.isBefore(dayjs().startOf('day'));
      case 'todayAndBefore':
        return current.isAfter(dayjs().endOf('day'));
      case 'custom': {
        const beforeStart = restriction.customStart
          ? current.isBefore(dayjs(restriction.customStart).startOf('day'))
          : false;
        const afterEnd = restriction.customEnd
          ? current.isAfter(dayjs(restriction.customEnd).endOf('day'))
          : false;
        return beforeStart || afterEnd;
      }
      default:
        return false;
    }
  };
}

/**
 * 根据日期限制配置计算 min/max 日期（用于移动端 antd-mobile DatePicker）
 */
export function getDateMinMax(restriction?: DateRestrictionConfig): { min?: Date; max?: Date } {
  if (!restriction || restriction.type === 'none') return {};

  switch (restriction.type) {
    case 'todayAndAfter':
      return { min: dayjs().startOf('day').toDate() };
    case 'todayAndBefore':
      return { max: dayjs().endOf('day').toDate() };
    case 'custom': {
      const result: { min?: Date; max?: Date } = {};
      if (restriction.customStart) {
        result.min = dayjs(restriction.customStart).startOf('day').toDate();
      }
      if (restriction.customEnd) {
        result.max = dayjs(restriction.customEnd).endOf('day').toDate();
      }
      return result;
    }
    default:
      return {};
  }
}

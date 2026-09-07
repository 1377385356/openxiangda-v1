import dayjs from 'dayjs';
import './dateLocale';

export function formatHasTime(format?: string) {
  return Boolean(format && /[HhmsSA]/.test(format));
}

export function getDateDisplayFormat(dateFormat?: string, showTime?: boolean) {
  if (dateFormat) return dateFormat;
  return showTime ? 'YYYY-MM-DD HH:mm:ss' : 'YYYY-MM-DD';
}

export function shouldShowDateTime(dateFormat?: string, showTime?: boolean) {
  if (dateFormat) return formatHasTime(dateFormat);
  return Boolean(showTime);
}

export function formatDateValue(value: unknown, dateFormat?: string, showTime?: boolean) {
  if (value === undefined || value === null || value === '') return '--';
  const date = dayjs(value as string | number | Date);
  if (!date.isValid()) return String(value);
  return date.format(getDateDisplayFormat(dateFormat, showTime));
}

export function normalizeDateRangeValue(value: unknown): { start: any; end: any } | null {
  if (Array.isArray(value)) {
    return { start: value[0] ?? '', end: value[1] ?? '' };
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, any>;
    return {
      start: record.start ?? record.startTime ?? record.begin ?? record[0] ?? '',
      end: record.end ?? record.endTime ?? record.finish ?? record[1] ?? '',
    };
  }
  return null;
}

export function dateRangeToSubmitValue(value: unknown): [any, any] | null {
  const range = normalizeDateRangeValue(value);
  if (!range) return null;
  const start = range.start === '' || range.start === undefined ? null : range.start;
  const end = range.end === '' || range.end === undefined ? null : range.end;
  if (start === null && end === null) return null;
  return [start, end];
}

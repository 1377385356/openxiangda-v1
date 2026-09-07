import dayjs from 'dayjs';
import { describe, expect, it, vi } from 'vitest';
import { getDateMinMax, getDisabledDate } from './dateRestrictionUtils';

describe('dateRestrictionUtils', () => {
  it('does not restrict dates when config is empty or none', () => {
    expect(getDisabledDate()).toBeUndefined();
    expect(getDisabledDate({ type: 'none' })).toBeUndefined();
    expect(getDateMinMax()).toEqual({});
    expect(getDateMinMax({ type: 'none' })).toEqual({});
  });

  it('restricts today and future dates for todayAndAfter', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-16T10:00:00+08:00'));

    const disabledDate = getDisabledDate({ type: 'todayAndAfter' })!;
    expect(disabledDate(dayjs('2026-05-15'))).toBe(true);
    expect(disabledDate(dayjs('2026-05-16'))).toBe(false);
    expect(disabledDate(dayjs('2026-05-17'))).toBe(false);
    expect(getDateMinMax({ type: 'todayAndAfter' }).min).toEqual(
      dayjs('2026-05-16').startOf('day').toDate(),
    );

    vi.useRealTimers();
  });

  it('restricts today and past dates for todayAndBefore', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-16T10:00:00+08:00'));

    const disabledDate = getDisabledDate({ type: 'todayAndBefore' })!;
    expect(disabledDate(dayjs('2026-05-15'))).toBe(false);
    expect(disabledDate(dayjs('2026-05-16'))).toBe(false);
    expect(disabledDate(dayjs('2026-05-17'))).toBe(true);
    expect(getDateMinMax({ type: 'todayAndBefore' }).max).toEqual(
      dayjs('2026-05-16').endOf('day').toDate(),
    );

    vi.useRealTimers();
  });

  it('restricts custom start and end date range', () => {
    const disabledDate = getDisabledDate({
      type: 'custom',
      customStart: '2026-05-10',
      customEnd: '2026-05-20',
    })!;

    expect(disabledDate(dayjs('2026-05-09'))).toBe(true);
    expect(disabledDate(dayjs('2026-05-10'))).toBe(false);
    expect(disabledDate(dayjs('2026-05-20'))).toBe(false);
    expect(disabledDate(dayjs('2026-05-21'))).toBe(true);

    expect(
      Object.fromEntries(
        Object.entries(
          getDateMinMax({
            type: 'custom',
            customStart: '2026-05-10',
            customEnd: '2026-05-20',
          }),
        ).map(([key, value]) => [key, dayjs(value).format('YYYY-MM-DD HH:mm:ss')]),
      ),
    ).toEqual({
      min: '2026-05-10 00:00:00',
      max: '2026-05-20 23:59:59',
    });
  });

  it('supports one-sided custom ranges and unknown restriction types', () => {
    const minOnly = getDisabledDate({ type: 'custom', customStart: '2026-05-10' })!;
    const maxOnly = getDisabledDate({ type: 'custom', customEnd: '2026-05-20' })!;

    expect(minOnly(dayjs('2026-05-09'))).toBe(true);
    expect(minOnly(dayjs('2026-05-21'))).toBe(false);
    expect(maxOnly(dayjs('2026-05-09'))).toBe(false);
    expect(maxOnly(dayjs('2026-05-21'))).toBe(true);
    expect(getDateMinMax({ type: 'custom', customStart: '2026-05-10' })).toEqual({
      min: dayjs('2026-05-10').startOf('day').toDate(),
    });
    expect(getDateMinMax({ type: 'unexpected' as any })).toEqual({});
    expect(getDisabledDate({ type: 'unexpected' as any })!(dayjs('2026-05-10'))).toBe(false);
  });
});

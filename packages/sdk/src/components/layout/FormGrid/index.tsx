import React from 'react';

export interface FormGridProps {
  columns?: 1 | 2 | 3 | 4;
  gap?: number | string;
  columnGap?: number | string;
  rowGap?: number | string;
  columnRatios?: number[];
  className?: string;
  children: React.ReactNode;
}

const columnClasses: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 md:grid-cols-2',
  3: 'grid-cols-1 md:grid-cols-3',
  4: 'grid-cols-1 md:grid-cols-4',
};

const gapClasses: Record<number, string> = {
  0: 'gap-0',
  1: 'gap-1',
  2: 'gap-2',
  3: 'gap-3',
  4: 'gap-4',
  5: 'gap-5',
  6: 'gap-6',
  8: 'gap-8',
};

function toCssGap(value: number | string | undefined, fallback: number | string) {
  const resolved = value ?? fallback;
  if (typeof resolved === 'number') return `${resolved}px`;
  const text = String(resolved).trim();
  if (/^-?\d+(\.\d+)?$/.test(text)) return `${text}px`;
  return text;
}

export function FormGrid({
  columns = 2,
  gap = 4,
  columnGap,
  rowGap,
  columnRatios,
  className,
  children,
}: FormGridProps) {
  if (columnGap !== undefined || rowGap !== undefined || columnRatios?.length) {
    const ratios =
      columnRatios && columnRatios.length > 0
        ? columnRatios
        : Array.from({ length: columns }, () => 1);
    return (
      <div
        className={className ?? 'grid'}
        style={{
          display: 'grid',
          gridTemplateColumns: ratios.map((ratio) => `${ratio}fr`).join(' '),
          columnGap: toCssGap(columnGap, gap),
          rowGap: toCssGap(rowGap, gap),
        }}
        data-testid="form-grid"
      >
        {children}
      </div>
    );
  }

  const colClass = columnClasses[columns];
  const numericGap =
    typeof gap === 'number' ? gap : Number.isFinite(Number(gap)) ? Number(gap) : undefined;
  const gapClass = numericGap !== undefined ? (gapClasses[numericGap] ?? `gap-${numericGap}`) : '';

  return (
    <div className={className ?? `grid ${colClass} ${gapClass}`} data-testid="form-grid">
      {children}
    </div>
  );
}

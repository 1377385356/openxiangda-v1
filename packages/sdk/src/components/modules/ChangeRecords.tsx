import React from 'react';
import type { ChangeRecord } from '../types';
import { RecordChangePanel } from './RecordChangePanel';

export interface ChangeRecordsProps {
  records?: ChangeRecord[];
  loading?: boolean;
  defaultExpanded?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  onExpand?: () => void;
  className?: string;
  renderItem?: (record: ChangeRecord) => React.ReactNode;
}

export const ChangeRecords: React.FC<ChangeRecordsProps> = ({
  records = [],
  loading = false,
  defaultExpanded = false,
  hasMore = false,
  onLoadMore,
  onExpand,
  className = '',
  renderItem,
}) => {
  if (renderItem) {
    return (
      <section
        className={`rounded-lg border border-ant-border-secondary bg-ant-bg-container ${className}`}
      >
        <div className="border-b border-ant-border-secondary px-5 py-4 font-semibold">变更记录</div>
        <div className="p-5">
          {records.length === 0 ? (
            <p className="m-0 text-center text-sm text-ant-text-tertiary">
              {loading ? '加载中...' : '暂无变更记录'}
            </p>
          ) : (
            <div className="space-y-2">
              {records.map((record) => (
                <div key={record.id}>{renderItem(record)}</div>
              ))}
            </div>
          )}
          {hasMore && (
            <button
              type="button"
              className="mt-4 w-full rounded-md border border-ant-border-secondary py-2 text-sm text-ant-primary"
              onClick={onLoadMore}
              disabled={loading}
            >
              {loading ? '加载中...' : '加载更多'}
            </button>
          )}
        </div>
      </section>
    );
  }

  return (
    <RecordChangePanel
      records={records}
      loading={loading}
      defaultExpanded={defaultExpanded}
      hasMore={hasMore}
      onLoadMore={onLoadMore}
      onRefresh={onExpand}
      onExpand={onExpand}
      className={className}
    />
  );
};

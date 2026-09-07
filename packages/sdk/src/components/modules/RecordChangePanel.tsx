import React, { useState } from 'react';
import { Button, Empty, Pagination, Skeleton, Tag, Tooltip } from 'antd';
import {
  ArrowRightOutlined,
  DownOutlined,
  HistoryOutlined,
  ReloadOutlined,
  UpOutlined,
} from '@ant-design/icons';
import type { ChangeRecord } from '../types';

export interface RecordChangePanelProps {
  records?: ChangeRecord[];
  loading?: boolean;
  total?: number;
  page?: number;
  pageSize?: number;
  defaultExpanded?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  onRefresh?: () => void;
  onExpand?: () => void;
  onPageChange?: (page: number, pageSize: number) => void;
  className?: string;
}

const sourceLabels: Record<string, string> = {
  frontend: '前端',
  integration: '集成',
  automation: '自动化',
  import: '导入',
};

const typeLabels: Record<string, string> = {
  create: '新增',
  update: '修改',
  delete: '删除',
};

function formatValue(value: any): React.ReactNode {
  if (value === null || value === undefined || value === '')
    return <span className="text-ant-text-tertiary">空</span>;
  if (Array.isArray(value)) {
    return (
      <span className="inline-flex flex-wrap gap-1">
        {value.map((item, index) => (
          <Tag key={`${index}-${String(item)}`} className="m-0">
            {String(
              typeof item === 'object' ? item.label || item.value || JSON.stringify(item) : item,
            )}
          </Tag>
        ))}
      </span>
    );
  }
  if (typeof value === 'object') {
    const label = value.label ?? value.value;
    return label ? String(label) : <code className="text-xs">{JSON.stringify(value)}</code>;
  }
  return String(value);
}

function getInitial(name?: string) {
  return (
    String(name || '?')
      .trim()
      .slice(0, 1)
      .toUpperCase() || '?'
  );
}

export const RecordChangePanel: React.FC<RecordChangePanelProps> = ({
  records = [],
  loading = false,
  total,
  page = 1,
  pageSize = 20,
  defaultExpanded = false,
  hasMore = false,
  onLoadMore,
  onRefresh,
  onExpand,
  onPageChange,
  className = '',
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const count = total ?? records.length;

  const handleToggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (next) onExpand?.();
  };

  return (
    <section
      className={`rounded-lg border border-ant-border-secondary bg-ant-bg-container ${className}`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-ant-border-secondary px-5 py-4">
        <button
          type="button"
          className="flex min-w-0 items-center gap-2 bg-transparent p-0 text-left"
          onClick={handleToggle}
        >
          <HistoryOutlined className="text-ant-primary" />
          <span className="font-semibold text-ant-text">变更记录</span>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-ant-text-tertiary">
            {count} 条
          </span>
          {expanded ? <UpOutlined className="text-xs" /> : <DownOutlined className="text-xs" />}
        </button>
        {expanded && (
          <Button
            type="text"
            size="small"
            icon={<ReloadOutlined />}
            onClick={onRefresh}
            disabled={loading}
          >
            刷新
          </Button>
        )}
      </div>

      {expanded ? (
        <div className="p-5">
          {loading && records.length === 0 ? (
            <Skeleton active paragraph={{ rows: 3 }} />
          ) : records.length === 0 ? (
            <Empty description="暂无变更记录" />
          ) : (
            <div className="space-y-4">
              {records.map((record) => {
                const changes =
                  record.changes && record.changes.length > 0
                    ? record.changes
                    : [
                        {
                          fieldKey: record.fieldId,
                          fieldLabel: record.fieldLabel,
                          beforeValue: record.oldValue,
                          afterValue: record.newValue,
                        },
                      ];
                const operator = record.operatorName || (record.changeSource ? '系统' : '未知');
                const operatedAt = record.operatedAt || record.createdAt || '-';
                return (
                  <article
                    key={record.id || record.operationId}
                    className="rounded-md border border-ant-border-secondary p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-semibold text-blue-700">
                          {getInitial(operator)}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-ant-text">
                            {operator}
                            {record.operatorDepartmentName && (
                              <span className="ml-2 font-normal text-ant-text-tertiary">
                                {record.operatorDepartmentName}
                              </span>
                            )}
                          </span>
                          <span className="block text-xs text-ant-text-tertiary">
                            变更 {record.changedCount || changes.length} 项 · {operatedAt}
                          </span>
                        </span>
                      </div>
                      <span className="flex flex-wrap justify-end gap-2">
                        {record.changeType && (
                          <Tag>{typeLabels[record.changeType] || record.changeType}</Tag>
                        )}
                        {record.changeSource && (
                          <Tag color="blue">
                            {sourceLabels[record.changeSource] || record.changeSource}
                          </Tag>
                        )}
                        {record.operationId && (
                          <Tooltip title={`操作ID：${record.operationId}`}>
                            <Tag>{record.operationId.slice(0, 8)}</Tag>
                          </Tooltip>
                        )}
                      </span>
                    </div>
                    <div className="mt-4 space-y-3">
                      {changes.map((change) => (
                        <div
                          key={change.fieldKey || change.fieldLabel}
                          className="grid gap-2 md:grid-cols-[160px_1fr]"
                        >
                          <div className="text-sm font-medium text-ant-text-secondary">
                            {change.fieldLabel || change.fieldKey || '-'}
                          </div>
                          <div className="grid min-w-0 grid-cols-[1fr_auto_1fr] items-start gap-2 text-sm">
                            <div className="min-w-0 rounded bg-red-50 px-2 py-1 text-red-700">
                              {formatValue(change.beforeValue)}
                            </div>
                            <ArrowRightOutlined className="mt-1 text-xs text-ant-text-tertiary" />
                            <div className="min-w-0 rounded bg-emerald-50 px-2 py-1 text-emerald-700">
                              {formatValue(change.afterValue)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          {onPageChange && count > pageSize ? (
            <div className="mt-4 flex justify-end">
              <Pagination
                size="small"
                current={page}
                pageSize={pageSize}
                total={count}
                onChange={onPageChange}
                showSizeChanger
              />
            </div>
          ) : hasMore ? (
            <Button block className="mt-4" onClick={onLoadMore} loading={loading}>
              加载更多
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="px-5 py-4 text-sm text-ant-text-tertiary">点击展开查看变更记录</div>
      )}
    </section>
  );
};

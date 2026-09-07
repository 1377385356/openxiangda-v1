import React from 'react';
import { Button } from 'antd';
import { EditOutlined } from '@ant-design/icons';

export interface DraftManagerProps {
  hasDraft: boolean;
  draftTimestamp?: number | null;
  onRestore: () => void;
  onDiscard: () => void;
  className?: string;
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  return `${days}天前`;
}

export const DraftManager: React.FC<DraftManagerProps> = ({
  hasDraft,
  draftTimestamp,
  onRestore,
  onDiscard,
  className = '',
}) => {
  if (!hasDraft) return null;

  const timeLabel = draftTimestamp ? formatRelativeTime(draftTimestamp) : null;

  return (
    <div
      className={`bg-blue-50 border border-blue-200 rounded-lg p-4 animate-[slideDown_0.3s_ease-out] ${className}`}
    >
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 text-sm text-blue-700">
          <EditOutlined className="text-blue-500" />
          <span>
            检测到未提交的草稿
            {timeLabel && <span className="text-blue-500 ml-1">（保存于 {timeLabel}）</span>}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button type="text" size="small" onClick={onDiscard} className="!text-gray-500">
            丢弃
          </Button>
          <Button type="primary" size="small" onClick={onRestore}>
            恢复填写
          </Button>
        </div>
      </div>
    </div>
  );
};

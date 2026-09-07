import React from 'react';
import { Avatar } from 'antd';
import { ApartmentOutlined, CalendarOutlined, FileTextOutlined } from '@ant-design/icons';
import type { StatusMeta } from '../types';

export interface SummaryPanelMetaItem {
  key: string;
  label: string;
  value?: React.ReactNode;
  icon?: React.ReactNode;
}

export interface SummaryPanelProps {
  title?: React.ReactNode;
  eyebrow?: React.ReactNode;
  showEyebrow?: boolean;
  status?: StatusMeta;
  creator?: { name?: string; avatar?: string; department?: string };
  createdAt?: React.ReactNode;
  metaItems?: SummaryPanelMetaItem[];
  className?: string;
  children?: React.ReactNode;
}

const toneClasses: Record<StatusMeta['tone'], string> = {
  brand: 'bg-blue-50 text-blue-700 border-blue-200',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  danger: 'bg-red-50 text-red-700 border-red-200',
  neutral: 'bg-gray-50 text-gray-600 border-gray-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
};

export const SummaryPanel: React.FC<SummaryPanelProps> = ({
  title = '详情',
  eyebrow,
  showEyebrow = true,
  status,
  creator,
  createdAt,
  metaItems,
  className = '',
  children,
}) => {
  const defaultItems: SummaryPanelMetaItem[] = [
    {
      key: 'creator',
      label: '创建人',
      value: creator?.name || '未知用户',
      icon: creator?.avatar ? (
        <Avatar size={24} src={creator.avatar} />
      ) : (
        <Avatar size={24}>{creator?.name?.slice(0, 1) || '表'}</Avatar>
      ),
    },
    {
      key: 'department',
      label: '所属部门',
      value: creator?.department || '-',
      icon: <ApartmentOutlined />,
    },
    {
      key: 'createdAt',
      label: '创建时间',
      value: createdAt || '-',
      icon: <CalendarOutlined />,
    },
  ];
  const items = metaItems || defaultItems;
  const mobileCreatorName = creator?.name || '未知用户';
  const mobileCreatorText = creator?.department
    ? `${mobileCreatorName}（${creator.department}）`
    : mobileCreatorName;
  const showMobileIdentity =
    className.includes('sy-detail-summary-panel') && (creator || createdAt);

  return (
    <section
      className={`rounded-lg border border-ant-border-secondary bg-ant-bg-container ${className}`}
    >
      <div className="sy-summary-panel-content p-5 md:p-6">
        {(showEyebrow || status) && (
          <div className="sy-summary-status-row mb-2 flex items-center justify-between gap-3">
            {showEyebrow ? (
              <div className="min-w-0 text-sm text-ant-text-tertiary">
                {eyebrow || (
                  <span className="inline-flex items-center gap-2">
                    <FileTextOutlined />
                    数据实例
                  </span>
                )}
              </div>
            ) : (
              <span />
            )}
            {status && (
              <span
                className={`inline-flex min-h-6 items-center rounded-md border px-2.5 text-xs font-medium ${
                  toneClasses[status.tone] || toneClasses.neutral
                }`}
              >
                {status.label}
              </span>
            )}
          </div>
        )}
        <h1 className="sy-summary-title m-0 break-words text-2xl font-semibold leading-9 text-ant-text md:text-[28px]">
          {title}
        </h1>
        {showMobileIdentity && (
          <div className="sy-summary-mobile-identity">
            {creator && (
              <div className="sy-summary-mobile-person">
                <span className="sy-summary-mobile-avatar">
                  {creator.avatar ? (
                    <Avatar size={22} src={creator.avatar} />
                  ) : (
                    <Avatar size={22}>{creator.name?.slice(0, 1) || '表'}</Avatar>
                  )}
                </span>
                <span className="sy-summary-mobile-person-name">{mobileCreatorText}</span>
              </div>
            )}
            {createdAt && <div className="sy-summary-mobile-time">{createdAt}</div>}
          </div>
        )}
        {items.length > 0 && (
          <div className="sy-summary-meta-list mt-5 grid grid-cols-1 gap-4 md:grid-cols-4">
            {items.map((item) => (
              <div key={item.key} className="sy-summary-meta-item flex min-w-0 items-center gap-3">
                {item.icon && (
                  <span className="sy-summary-meta-icon inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-ant-text-secondary">
                    {item.icon}
                  </span>
                )}
                <span className="sy-summary-meta-body min-w-0">
                  <span className="sy-summary-meta-label block text-xs leading-5 text-ant-text-tertiary">
                    {item.label}
                  </span>
                  <span className="sy-summary-meta-value block break-words text-sm font-medium leading-6 text-ant-text">
                    {item.value || '-'}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
        {children && <div className="mt-5">{children}</div>}
      </div>
    </section>
  );
};

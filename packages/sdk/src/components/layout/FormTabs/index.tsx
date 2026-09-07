import React, { useState } from 'react';

export interface FormTabItem {
  key: string;
  label: string;
  children: React.ReactNode;
}

export interface FormTabsProps {
  items: FormTabItem[];
  defaultActiveKey?: string;
  className?: string;
  tabClassName?: string;
}

export function FormTabs({ items, defaultActiveKey, className, tabClassName }: FormTabsProps) {
  const [activeKey, setActiveKey] = useState(defaultActiveKey || items[0]?.key || '');

  const activeItem = items.find((item) => item.key === activeKey);

  return (
    <div className={className ?? 'w-full'} data-testid="form-tabs">
      <div
        className={tabClassName ?? 'flex border-b border-gray-200 overflow-x-auto'}
        role="tablist"
        data-testid="form-tabs-nav"
      >
        {items.map((item) => (
          <button
            key={item.key}
            role="tab"
            type="button"
            aria-selected={activeKey === item.key}
            className={
              activeKey === item.key
                ? 'px-4 py-2 text-sm font-medium text-blue-600 border-b-2 border-blue-600 whitespace-nowrap'
                : 'px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 whitespace-nowrap'
            }
            onClick={() => setActiveKey(item.key)}
            data-testid={`form-tab-${item.key}`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="pt-4" role="tabpanel" data-testid="form-tabs-content">
        {activeItem?.children}
      </div>
    </div>
  );
}

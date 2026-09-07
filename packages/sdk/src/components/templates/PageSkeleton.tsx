import React from 'react';
import { Skeleton } from 'antd';

export interface PageSkeletonProps {
  type: 'submit' | 'detail' | 'process';
}

const CardSkeleton: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">{children}</div>
);

const SummaryCardSkeleton: React.FC = () => (
  <CardSkeleton>
    <div className="flex items-start justify-between">
      <div className="flex-1">
        <Skeleton.Input active size="large" style={{ width: 200 }} />
        <div className="mt-2">
          <Skeleton.Input active size="small" style={{ width: 80 }} />
        </div>
      </div>
      <Skeleton.Button active size="small" shape="round" style={{ width: 60 }} />
    </div>
    <div className="flex items-center gap-3 mt-4">
      <Skeleton.Avatar active size="small" />
      <Skeleton.Input active size="small" style={{ width: 120 }} />
    </div>
  </CardSkeleton>
);

const FormGridSkeleton: React.FC = () => (
  <CardSkeleton>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton.Input active size="small" style={{ width: 80 }} />
          <Skeleton.Input active block style={{ width: '100%' }} />
        </div>
      ))}
    </div>
  </CardSkeleton>
);

const ActionBarSkeleton: React.FC = () => (
  <div className="fixed bottom-0 left-0 right-0 backdrop-blur-lg bg-white/80 border-t border-gray-200 px-6 py-3">
    <div className="flex items-center justify-end gap-3">
      <Skeleton.Button active style={{ width: 80 }} />
      <Skeleton.Button active style={{ width: 80 }} />
    </div>
  </div>
);

const TimelineSkeleton: React.FC = () => (
  <CardSkeleton>
    <Skeleton.Input active size="medium" style={{ width: 100, marginBottom: 16 }} />
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex gap-4">
          <div className="flex flex-col items-center">
            <div className="w-3 h-3 rounded-full bg-gray-200 animate-pulse" />
            {i < 2 && <div className="w-0.5 flex-1 bg-gray-200 mt-1" />}
          </div>
          <div className="flex-1 pb-4">
            <Skeleton active paragraph={{ rows: 1 }} title={{ width: '60%' }} />
          </div>
        </div>
      ))}
    </div>
  </CardSkeleton>
);

export const PageSkeleton: React.FC<PageSkeletonProps> = ({ type }) => {
  if (type === 'submit') {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton.Input active size="large" style={{ width: 200 }} />
          <Skeleton.Input active size="small" style={{ width: 300 }} />
        </div>
        <FormGridSkeleton />
        <ActionBarSkeleton />
      </div>
    );
  }

  if (type === 'detail') {
    return (
      <div className="space-y-6">
        <SummaryCardSkeleton />
        <FormGridSkeleton />
        <ActionBarSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SummaryCardSkeleton />
      <FormGridSkeleton />
      <TimelineSkeleton />
      <ActionBarSkeleton />
    </div>
  );
};

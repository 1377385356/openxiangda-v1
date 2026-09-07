import React from 'react';
import { Alert, Empty, Spin } from 'antd';

export interface RuntimePageShellProps {
  children: React.ReactNode;
  actions?: React.ReactNode;
  loading?: boolean;
  loadingTip?: string;
  accessDenied?: boolean;
  error?: React.ReactNode;
  empty?: React.ReactNode;
  className?: string;
  contentClassName?: string;
  maxWidth?: number | string;
  inDrawer?: boolean;
}

export const RuntimePageShell: React.FC<RuntimePageShellProps> = ({
  children,
  actions,
  loading = false,
  loadingTip = '正在加载页面...',
  accessDenied = false,
  error,
  empty,
  className = '',
  contentClassName = '',
  maxWidth = 1120,
  inDrawer = false,
}) => {
  const maxWidthStyle = typeof maxWidth === 'number' ? `${maxWidth}px` : maxWidth;

  const renderState = () => {
    if (loading) {
      return (
        <div className="min-h-[360px] flex items-center justify-center">
          <Spin tip={loadingTip} />
        </div>
      );
    }
    if (accessDenied) {
      return <Empty description="无权限查看详情" />;
    }
    if (error) {
      return <Alert type="error" showIcon message="页面加载失败" description={error} />;
    }
    if (empty) {
      return <>{empty}</>;
    }
    return children;
  };

  return (
    <div
      className={`sy-runtime-page flex min-h-screen flex-col bg-ant-bg-layout text-ant-text ${className}`}
    >
      <div
        className={`sy-runtime-page__content mx-auto flex w-full flex-1 flex-col p-0 md:px-6 md:py-6 md:pb-8 ${
          inDrawer ? 'md:px-4 md:py-4' : ''
        } ${contentClassName}`}
        style={{ maxWidth: maxWidthStyle }}
      >
        {renderState()}
      </div>
      {actions}
    </div>
  );
};

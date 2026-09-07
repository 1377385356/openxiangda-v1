import React from 'react';
import { Modal, Skeleton, Button } from 'antd';
import { CheckCircleOutlined, UserOutlined } from '@ant-design/icons';
import type { ProcessRoute } from '../types';

export interface ProcessPreviewProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  routes: ProcessRoute[];
  loading?: boolean;
}

export const ProcessPreview: React.FC<ProcessPreviewProps> = ({
  open,
  onClose,
  onConfirm,
  routes,
  loading = false,
}) => {
  const routeList = Array.isArray(routes) ? routes : [];

  return (
    <Modal
      getContainer={false}
      title="流程预览"
      open={open}
      onCancel={onClose}
      width={520}
      footer={
        <div className="flex justify-end gap-3">
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" onClick={onConfirm} loading={loading}>
            确认提交
          </Button>
        </div>
      }
    >
      {loading && routeList.length === 0 ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : routeList.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">暂无流程节点</p>
      ) : (
        <div className="py-2">
          {routeList.map((route, index) => {
            const isLast = index === routeList.length - 1;
            return (
              <div key={route.nodeId} className="flex gap-3">
                {/* Left timeline */}
                <div className="flex flex-col items-center">
                  <div className="w-6 h-6 rounded-full bg-blue-50 border-2 border-blue-400 flex items-center justify-center flex-shrink-0">
                    <CheckCircleOutlined className="text-blue-500 text-xs" />
                  </div>
                  {!isLast && <div className="w-0.5 flex-1 bg-blue-200 mt-1" />}
                </div>

                {/* Right content */}
                <div className={`flex-1 ${isLast ? 'pb-0' : 'pb-5'}`}>
                  <div className="text-sm font-medium text-gray-900">{route.nodeName}</div>
                  {route.assignees && route.assignees.length > 0 && (
                    <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                      <UserOutlined className="text-gray-400 text-xs" />
                      {route.assignees.map((assignee) => (
                        <span
                          key={assignee.id}
                          className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded"
                        >
                          {assignee.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
};

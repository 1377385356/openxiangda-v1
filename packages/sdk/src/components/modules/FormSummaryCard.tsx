import React from 'react';

export interface FormSummaryCardProps {
  title?: string;
  formInstanceId?: string;
  creator?: { name: string; avatar?: string; department?: string };
  createdAt?: string;
  status?: { label: string; tone: 'brand' | 'success' | 'danger' | 'neutral' | 'warning' };
  className?: string;
  children?: React.ReactNode;
}

const toneClasses: Record<string, string> = {
  brand: 'bg-blue-50 text-blue-600',
  success: 'bg-green-50 text-green-600',
  danger: 'bg-red-50 text-red-600',
  neutral: 'bg-gray-100 text-gray-500',
  warning: 'bg-amber-50 text-amber-600',
};

export const FormSummaryCard: React.FC<FormSummaryCardProps> = ({
  title,
  formInstanceId,
  creator,
  createdAt,
  status,
  className = '',
  children,
}) => {
  const shortId = formInstanceId ? formInstanceId.slice(0, 8) : null;

  const renderAvatar = () => {
    if (!creator) return null;
    if (creator.avatar) {
      return (
        <img
          src={creator.avatar}
          alt={creator.name}
          className="w-7 h-7 rounded-full object-cover"
        />
      );
    }
    const initial = creator.name.charAt(0);
    return (
      <span className="w-7 h-7 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-medium">
        {initial}
      </span>
    );
  };

  return (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-100 p-6 ${className}`}>
      <div className="flex items-start justify-between">
        {/* Left */}
        <div className="min-w-0 flex-1">
          {title && <h2 className="text-xl font-semibold text-gray-900 truncate">{title}</h2>}
          {shortId && <span className="text-xs text-gray-400 mt-0.5 inline-block">#{shortId}</span>}
        </div>
        {/* Right - Status Badge */}
        {status && (
          <span
            className={`px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${toneClasses[status.tone] || toneClasses.neutral}`}
          >
            {status.label}
          </span>
        )}
      </div>

      {/* Creator info */}
      {creator && (
        <div className="flex items-center gap-2 mt-4 text-sm text-gray-600">
          {renderAvatar()}
          <span className="font-medium">{creator.name}</span>
          {creator.department && (
            <>
              <span className="text-gray-300">·</span>
              <span>{creator.department}</span>
            </>
          )}
          {createdAt && (
            <>
              <span className="text-gray-300">·</span>
              <span className="text-gray-400">{createdAt}</span>
            </>
          )}
        </div>
      )}

      {children && <div className="mt-4">{children}</div>}
    </div>
  );
};

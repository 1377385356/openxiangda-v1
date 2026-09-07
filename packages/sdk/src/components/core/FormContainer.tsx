import React from 'react';

/** Simple className merge utility */
function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

export interface FormContainerProps {
  title?: string;
  description?: string;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  className?: string;
}

const maxWidthClassMap: Record<string, string> = {
  sm: 'sy-form-container-sm',
  md: 'sy-form-container-md',
  lg: 'sy-form-container-lg',
  xl: 'sy-form-container-xl',
  full: 'sy-form-container-full',
};

export function FormContainer({
  title,
  description,
  children,
  maxWidth = 'md',
  className,
}: FormContainerProps) {
  const sizeClass = maxWidthClassMap[maxWidth];

  return (
    <div className={cn('sy-form-container', sizeClass, className)}>
      {(title || description) && (
        <div className="sy-form-header">
          {title && <h2 className="sy-form-title">{title}</h2>}
          {description && <p className="sy-form-description">{description}</p>}
        </div>
      )}
      <div className="sy-form-body">{children}</div>
    </div>
  );
}

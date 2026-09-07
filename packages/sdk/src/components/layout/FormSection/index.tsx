import {
  CalendarOutlined,
  DesktopOutlined,
  FileTextOutlined,
  UserOutlined,
} from '@ant-design/icons';
import React, { useState } from 'react';

export type FormSectionVariant = 'plain' | 'card';
export type FormSectionAccent = 'blue' | 'green';
export type FormSectionIconKey = 'user' | 'calendar' | 'file' | 'device';

export interface FormSectionProps {
  title: string;
  description?: string;
  variant?: FormSectionVariant;
  accent?: FormSectionAccent;
  icon?: React.ReactNode;
  iconKey?: FormSectionIconKey;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  className?: string;
  titleClassName?: string;
  contentClassName?: string;
  children: React.ReactNode;
}

const sectionIconMap: Record<FormSectionIconKey, React.ComponentType> = {
  user: UserOutlined,
  calendar: CalendarOutlined,
  file: FileTextOutlined,
  device: DesktopOutlined,
};

function cn(...classes: Array<string | undefined | false>) {
  return classes.filter(Boolean).join(' ');
}

export function FormSection({
  title,
  description,
  variant = 'plain',
  accent = 'blue',
  icon,
  iconKey,
  collapsible = false,
  defaultCollapsed = false,
  className,
  titleClassName,
  contentClassName,
  children,
}: FormSectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const handleToggle = () => {
    if (collapsible) {
      setCollapsed((prev) => !prev);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!collapsible) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleToggle();
    }
  };

  const IconComponent = icon === undefined && iconKey ? sectionIconMap[iconKey] : undefined;
  const resolvedIcon = icon !== undefined ? icon : IconComponent ? <IconComponent /> : undefined;

  return (
    <section
      className={cn(
        'sy-form-section',
        `sy-form-section-${variant}`,
        `sy-form-section-accent-${accent}`,
        className,
      )}
      data-testid="form-section"
      data-collapsed={collapsed ? 'true' : 'false'}
    >
      <div
        className={cn('sy-form-section-header', titleClassName)}
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        role={collapsible ? 'button' : undefined}
        aria-expanded={collapsible ? !collapsed : undefined}
        tabIndex={collapsible ? 0 : undefined}
        data-testid="form-section-header"
      >
        <div className="sy-form-section-heading">
          {variant === 'plain' && (
            <span className="sy-form-section-marker" data-testid="form-section-marker" />
          )}
          {variant === 'card' && resolvedIcon && (
            <span className="sy-form-section-icon" data-testid="form-section-icon">
              {resolvedIcon}
            </span>
          )}
          <div className="sy-form-section-title-block">
            <h3 className="sy-form-section-title">{title}</h3>
            {description && (
              <p className="sy-form-section-description" data-testid="form-section-description">
                {description}
              </p>
            )}
          </div>
        </div>
        {collapsible && (
          <span
            className="sy-form-section-arrow"
            data-testid="form-section-arrow"
            style={{ transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
          >
            ▼
          </span>
        )}
      </div>
      {!collapsed && (
        <div
          className={cn('sy-form-section-content', contentClassName)}
          data-testid="form-section-content"
        >
          {children}
        </div>
      )}
    </section>
  );
}

// frontend/shared/ui/auth/SecurityAlert.tsx

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type SecurityAlertVariant = 'info' | 'success' | 'warning' | 'danger';

interface SecurityAlertProps {
  variant?: SecurityAlertVariant;
  title?: string;
  children: ReactNode;
  className?: string;
}

const ICONS: Record<SecurityAlertVariant, ReactNode> = {
  info: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8h.01M11 12h1v4h1" strokeLinecap="round" />
    </svg>
  ),
  success: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  warning: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a1 1 0 0 0 .9 1.5h18.6a1 1 0 0 0 .9-1.5L13.7 3.9a1 1 0 0 0-1.8 0Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  danger: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M15 9l-6 6M9 9l6 6" strokeLinecap="round" />
    </svg>
  ),
};

const VARIANT_CLASSES: Record<SecurityAlertVariant, string> = {
  info: 'badge-info',
  success: 'badge-success',
  warning: 'badge-warning',
  danger: 'badge-danger',
};

/**
 * Inline alert used across auth flows for security notices ("new
 * device detected", password rules, MFA guidance, account status).
 * Distinct from toast/snackbar notifications — this is meant to sit
 * inline within a form, not float over the page.
 */
export function SecurityAlert({ variant = 'info', title, children, className }: SecurityAlertProps) {
  return (
    <div
      role={variant === 'danger' || variant === 'warning' ? 'alert' : 'status'}
      className={cn('alert-base', VARIANT_CLASSES[variant], className)}
    >
      <span className="mt-0.5 shrink-0">{ICONS[variant]}</span>
      <div>
        {title && <p className="font-medium mb-0.5">{title}</p>}
        <div className="text-current/90">{children}</div>
      </div>
    </div>
  );
}
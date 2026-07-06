// frontend/shared/ui/auth/AuthLayout.tsx

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface AuthLayoutProps {
  children: ReactNode;
  /** Optional footer content rendered below the card (links, legal text). */
  footer?: ReactNode;
  className?: string;
}

/**
 * Full-viewport shell shared by every authentication page (login,
 * register, forgot/reset password, MFA, verification, error states).
 * Provides the branded gradient background and vertical centering; the
 * actual content goes in <AuthCard>.
 */
export function AuthLayout({ children, footer, className }: AuthLayoutProps) {
  return (
    <div className={cn('auth-shell px-4 py-12', className)}>
      <div className="flex flex-col items-center w-full gap-6">
        {children}
        {footer && <div className="text-center text-caption text-muted-foreground">{footer}</div>}
      </div>
    </div>
  );
}
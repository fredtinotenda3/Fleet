// frontend/shared/ui/auth/AuthCard.tsx

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface AuthCardProps {
  /** Short product mark shown above the title, e.g. "FLEET PLATFORM". */
  eyebrow?: string;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

function FleetMark() {
  return (
    <div
      className="flex items-center justify-center w-10 h-10 rounded-lg text-primary-foreground"
      style={{ background: 'var(--primary)' }}
      aria-hidden="true"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 13h13l3 4h2M3 13V8a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v9M3 13v4h2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="7" cy="18" r="1.5" />
        <circle cx="17" cy="18" r="1.5" />
      </svg>
    </div>
  );
}

/**
 * The branded card body used inside <AuthLayout>. Centralizes the
 * Fleet Platform mark, eyebrow, title, and description so every auth
 * page (login, MFA, password reset, ...) presents identically.
 */
export function AuthCard({ eyebrow = 'FLEET PLATFORM', title, description, children, className }: AuthCardProps) {
  return (
    <div className={cn('auth-card', className)}>
      <div className="flex flex-col items-center gap-3 mb-6 text-center">
        <FleetMark />
        <div>
          <p className="text-label text-muted-foreground">{eyebrow}</p>
          <h1 className="mt-1 text-h2 text-foreground">{title}</h1>
          {description && <p className="mt-1 text-body-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}
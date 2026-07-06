// frontend/shared/ui/auth/PasswordInput.tsx

'use client';

import { forwardRef, useState, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface PasswordInputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

const EyeIcon = ({ open }: { open: boolean }) =>
  open ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path
        d="M3 3l18 18M10.6 10.6a3 3 0 0 0 4.24 4.24M9.9 4.24A10.4 10.4 0 0 1 12 4c6.5 0 10 8 10 8a17.7 17.7 0 0 1-3.4 4.6M6.6 6.6C4 8.3 2 12 2 12a17.7 17.7 0 0 0 4.06 5.06"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

/**
 * Drop-in replacement for a plain password <Input>, adding a
 * show/hide toggle. Forwarded ref + spread props keep it compatible
 * with react-hook-form's register().
 */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, error, ...props }, ref) => {
    const [visible, setVisible] = useState(false);

    return (
      <div className="relative">
        <input
          ref={ref}
          type={visible ? 'text' : 'password'}
          className={cn('input-base pr-10', error && 'input-error', className)}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute inset-y-0 right-0 flex items-center justify-center w-10 transition-colors text-muted-foreground hover:text-foreground"
          aria-label={visible ? 'Hide password' : 'Show password'}
          tabIndex={-1}
        >
          <EyeIcon open={visible} />
        </button>
      </div>
    );
  }
);
PasswordInput.displayName = 'PasswordInput';
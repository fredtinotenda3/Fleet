// frontend/shared/errors/AppError.tsx

'use client';

import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/frontend/shared/ui/primitives/button';

interface AppErrorProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  showHomeLink?: boolean;
}

export function AppError({
  title = 'Something went wrong',
  message = 'An unexpected error occurred. You can try again, or head back to the dashboard.',
  onRetry,
  showHomeLink = true,
}: AppErrorProps) {
  return (
    <div
      role="alert"
      className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-6 py-16 text-center"
    >
      <div className="flex items-center justify-center rounded-full h-14 w-14 bg-danger-bg">
        <AlertTriangle className="w-6 h-6 text-danger" aria-hidden="true" />
      </div>
      <div>
        <h2 className="text-h2 text-foreground">{title}</h2>
        <p className="mx-auto mt-1.5 max-w-md text-body-sm text-muted-foreground">{message}</p>
      </div>
      <div className="flex items-center gap-2">
        {onRetry && (
          <Button onClick={onRetry} variant="default">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Try again
          </Button>
        )}
        {showHomeLink && (
          <Button render={<Link href="/dashboard" />} nativeButton={false} variant="outline">
            <Home className="h-3.5 w-3.5" aria-hidden="true" />
            Back to dashboard
          </Button>
        )}
      </div>
    </div>
  );
}

// frontend/shared/loading/PageLoader.tsx

'use client';

import { Loader2 } from 'lucide-react';

interface PageLoaderProps {
  /** Accessible label announced to screen readers and shown under the spinner. */
  label?: string;
  /** Render inline (fills parent) instead of a full-viewport overlay. */
  fullScreen?: boolean;
  className?: string;
}

export function PageLoader({ label = 'Loading', fullScreen = true, className }: PageLoaderProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={[
        'flex flex-col items-center justify-center gap-3 text-muted-foreground',
        fullScreen ? 'min-h-[60vh] w-full' : 'w-full py-12',
        className ?? '',
      ].join(' ')}
    >
      <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
      <span className="text-body-sm">{label}</span>
    </div>
  );
}

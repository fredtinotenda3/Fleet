
// frontend/shared/loading/SuspenseWrapper.tsx

import * as React from 'react';
import { PageLoader } from './PageLoader';
import { ErrorBoundary } from '@/frontend/shared/errors/ErrorBoundary';

interface SuspenseWrapperProps {
  children: React.ReactNode;
  label?: string;
  fullScreen?: boolean;
}

export function SuspenseWrapper({ children, label, fullScreen }: SuspenseWrapperProps) {
  return (
    <ErrorBoundary>
      <React.Suspense fallback={<PageLoader label={label} fullScreen={fullScreen} />}>
        {children}
      </React.Suspense>
    </ErrorBoundary>
  );
}
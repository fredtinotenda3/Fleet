// app/(protected)/error.tsx

'use client';

import { useEffect } from 'react';
import { AppError } from '@/frontend/shared/errors/AppError';

export default function ProtectedError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
     
    console.error('[ProtectedError]', error);
  }, [error]);

  return <AppError onRetry={reset} />;
}
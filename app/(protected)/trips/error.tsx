// app/(protected)/trips/error.tsx

'use client';

import { useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/frontend/shared/ui/primitives/button';

export default function TripsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[TripsError]', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed p-12 text-center">
      <h2 className="text-lg font-semibold text-foreground">Trips didn&apos;t load</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        The trips list took too long to respond. Try again, or narrow your date range if this
        keeps happening.
      </p>
      <Button onClick={() => reset()} size="sm">
        <RefreshCw className="h-3.5 w-3.5" />
        Try again
      </Button>
    </div>
  );
}
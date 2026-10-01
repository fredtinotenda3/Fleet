// app/(protected)/workorders/error.tsx

'use client';

import { useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/frontend/shared/ui/primitives/button';

export default function WorkOrdersError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[WorkOrdersError]', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 p-12 text-center border border-dashed rounded-lg">
      <h2 className="text-lg font-semibold text-foreground">Work orders didn&apos;t load</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        The work orders page took too long to respond. Try again in a moment.
      </p>
      <Button onClick={() => reset()} size="sm">
        <RefreshCw className="h-3.5 w-3.5" />
        Try again
      </Button>
    </div>
  );
}
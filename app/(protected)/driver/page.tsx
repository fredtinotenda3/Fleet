// app/(protected)/driver/page.tsx
'use client';

import * as React from 'react';
import Link from 'next/link';
import { History } from 'lucide-react';
import { DVIRForm } from '@/frontend/modules/dvir/components/DVIRForm';
import { OfflineQueueBadge } from '@/frontend/modules/dvir/components/OfflineQueueBadge';
import { initDVIRSync } from '@/frontend/modules/dvir/lib/sync';

export default function DriverInspectionPage() {
  React.useEffect(() => initDVIRSync(), []);

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Vehicle Inspection</h1>
          <p className="text-sm text-muted-foreground">Check every item before you drive.</p>
        </div>
        <Link href="/driver/history" className="flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm text-muted-foreground hover:bg-muted">
          <History className="size-4" />
          History
        </Link>
      </div>

      <div className="mb-4">
        <OfflineQueueBadge />
      </div>

      <DVIRForm />
    </div>
  );
}

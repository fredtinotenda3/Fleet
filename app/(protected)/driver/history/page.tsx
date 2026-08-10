// app/(protected)/driver/history/page.tsx
'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Clock, Trash2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/frontend/shared/ui/data-display/card';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { getQueuedInspections, discardQueuedInspection } from '@/frontend/modules/dvir/lib/sync';
import type { DVIRInspectionSummary, DVIRQueuedSubmission } from '@/frontend/modules/dvir/types';

const STATUS_LABEL: Record<DVIRInspectionSummary['overallStatus'], string> = {
  pass: 'Pass',
  defects_found: 'Defects found',
  out_of_service: 'Out of service',
};

function StatusBadge({ status }: { status: DVIRInspectionSummary['overallStatus'] }) {
  if (status === 'pass') {
    return (
      <Badge variant="outline" className="gap-1 text-emerald-600">
        <CheckCircle2 className="size-3" /> {STATUS_LABEL[status]}
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" className="gap-1">
      <XCircle className="size-3" /> {STATUS_LABEL[status]}
    </Badge>
  );
}

export default function DriverHistoryPage() {
  const [inspections, setInspections] = React.useState<DVIRInspectionSummary[]>([]);
  const [queued, setQueued] = React.useState<DVIRQueuedSubmission[]>([]);
  const [loading, setLoading] = React.useState(true);

  const loadQueued = React.useCallback(async () => {
    setQueued(await getQueuedInspections());
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/dvir?limit=25');
        const json = await res.json();
        if (!cancelled && json.success) setInspections(json.data || []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    void loadQueued();
    return () => {
      cancelled = true;
    };
  }, [loadQueued]);

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-4 flex items-center gap-2">
        <Link href="/driver" className="flex size-9 items-center justify-center rounded-lg hover:bg-muted">
          <ArrowLeft className="size-4" />
        </Link>
        <h1 className="text-xl font-semibold">Inspection history</h1>
      </div>

      {queued.length > 0 && (
        <div className="mb-5 space-y-2">
          <p className="text-xs font-medium uppercase text-muted-foreground">Pending sync</p>
          {queued.map((q) => (
            <Card key={q.clientInspectionId} className={cn(q.permanentFailure && 'ring-2 ring-destructive')}>
              <CardContent className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium">{q.license_plate}</p>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="size-3" />
                    {q.permanentFailure ? q.lastError || 'Could not sync' : 'Waiting for connection...'}
                  </p>
                </div>
                {q.permanentFailure && (
                  <button
                    type="button"
                    onClick={async () => {
                      await discardQueuedInspection(q.clientInspectionId);
                      void loadQueued();
                    }}
                    className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
                    aria-label="Discard"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : inspections.length === 0 ? (
        <p className="text-sm text-muted-foreground">No inspections submitted yet.</p>
      ) : (
        <div className="space-y-2">
          {inspections.map((insp) => (
            <Card key={insp._id}>
              <CardContent className="py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{insp.license_plate}</p>
                  <StatusBadge status={insp.overallStatus} />
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {insp.type === 'pre_trip' ? 'Pre-trip' : 'Post-trip'} &middot; {new Date(insp.submittedAt).toLocaleString()}
                </p>
                {insp.items.some((i) => i.status === 'defect') && (
                  <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                    {insp.items
                      .filter((i) => i.status === 'defect')
                      .map((i) => (
                        <li key={i.category}>&bull; {i.label}: {i.description}</li>
                      ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

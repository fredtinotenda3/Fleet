// frontend/modules/transport-cost/pages/NormalizationReviewQueuePage.tsx
//
// OLIVINE LIVE OPERATING MODEL, SLICE 5, task #58 (frontend half). The
// FIRST frontend consumer of Phase O2's review queue -- the backend
// (matcher, commands, handlers, routes) has existed since O1/O2 and was
// fully reachable via API, but with no UI, a pending transporter/vehicle
// identity was invisible outside a raw command invocation (see
// app/api/transport-cost/normalization-review/route.ts's own header).
// NO new backend logic here: every action below calls exactly one
// existing, already-tested command through exactly one existing route.
//
// SCOPE DECISION, documented: "Confirm match" only offers the matcher's
// own suggested candidate (candidateEntityId/candidateScore) -- it does
// not yet offer picking a DIFFERENT existing transporter/vehicle as the
// match. A reviewer who disagrees with the suggested candidate (or has
// none) still has "Confirm as new" and "Reject" available, so no
// decision is unreachable; "match a different existing identity" is a
// real gap, tracked in the gap-analysis doc, not silently dropped.

'use client';

import { useState } from 'react';
import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { Separator } from '@/frontend/shared/ui/data-display/separator';
import { Card, CardContent } from '@/frontend/shared/ui/data-display/card';
import { SearchSelect } from '@/frontend/shared/ui/forms/SearchSelect';
import { describeQueryError } from '@/frontend/shared/ui/patterns';
import { useSessionStore } from '@/frontend/shared/store/session.store';
import { Permission, permissionService } from '@/server/permissions/roles';
import { useNormalizationReviewQueue } from '../hooks/useTransportCost';
import {
  useConfirmReviewMatch,
  useConfirmReviewNew,
  useRejectReviewItem,
} from '../hooks/useTransportCostMutations';
import { transportCostApi } from '../services/transport-cost.api';
import type { NormalizationKind, NormalizationReviewItem, BusinessStream } from '../types';

const PAGE_SIZE = 20;

const BUSINESS_STREAM_OPTIONS: Array<{ value: BusinessStream; label: string }> = [
  { value: 'olivine', label: 'Olivine' },
  { value: 'hypery', label: 'Hypery' },
  { value: 'surface-wilmar', label: 'Surface Wilmar' },
];

function ReviewItemCard({ item, canDecide }: { item: NormalizationReviewItem; canDecide: boolean }) {
  const confirmMatch = useConfirmReviewMatch();
  const confirmNew = useConfirmReviewNew();
  const rejectItem = useRejectReviewItem();
  const [transporterPartnerId, setTransporterPartnerId] = useState<string | undefined>(undefined);
  const [businessStream, setBusinessStream] = useState<BusinessStream | ''>('');

  const isMutating = confirmMatch.isPending || confirmNew.isPending || rejectItem.isPending;

  async function handleReject() {
    const reason = window.prompt(
      `Reject "${item.rawValue}"? This raw value will NOT be normalized and its ${item.sourceRecordIds.length} waiting record(s) will remain unresolved.\n\nReason:`
    );
    if (reason === null) return;
    if (!reason.trim()) {
      window.alert('A reason is required to reject a review item.');
      return;
    }
    await rejectItem.mutateAsync({ reviewItemId: item._id!, reason: reason.trim() });
  }

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline">{item.kind}</Badge>
            <span className="font-medium text-body-sm text-foreground">{item.rawValue}</span>
            {item.isMultiPlate && <Badge variant="secondary" title="This raw value came from a multi-plate cell -- always routed to review.">multi-plate</Badge>}
          </div>
          <span className="text-caption text-muted-foreground">
            {item.sourceRecordIds.length} record{item.sourceRecordIds.length === 1 ? '' : 's'} waiting
          </span>
        </div>

        {canDecide && (
          <>
            <Separator />
            <div className="flex flex-wrap items-center gap-2">
              {item.candidateEntityId && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isMutating}
                  title={`Suggested match, similarity ${item.candidateScore !== undefined ? Math.round(item.candidateScore * 100) : '?'}%`}
                  onClick={() => confirmMatch.mutate({ reviewItemId: item._id!, resolvedEntityId: item.candidateEntityId! })}
                >
                  Confirm match{item.candidateScore !== undefined ? ` (${Math.round(item.candidateScore * 100)}%)` : ''}
                </Button>
              )}

              {item.kind === 'transporter' ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isMutating}
                  onClick={() => confirmNew.mutate({ reviewItemId: item._id! })}
                >
                  Confirm as new transporter
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="w-56">
                    <SearchSelect
                      placeholder="Transporter for this vehicle…"
                      value={transporterPartnerId}
                      onChange={setTransporterPartnerId}
                      search={(q) => transportCostApi.searchTransporters(q)}
                      disabled={isMutating}
                    />
                  </div>
                  <select
                    className="h-8 rounded-md border border-input bg-background px-2 text-body-sm"
                    value={businessStream}
                    onChange={(e) => setBusinessStream(e.target.value as BusinessStream | '')}
                    disabled={isMutating}
                  >
                    <option value="">Business stream (optional)</option>
                    {BUSINESS_STREAM_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isMutating || !transporterPartnerId}
                    title={!transporterPartnerId ? 'Select the transporter this vehicle belongs to first.' : undefined}
                    onClick={() =>
                      confirmNew.mutate({
                        reviewItemId: item._id!,
                        transporterPartnerId,
                        businessStream: businessStream || undefined,
                      })
                    }
                  >
                    Confirm as new vehicle
                  </Button>
                </div>
              )}

              <Button size="sm" variant="ghost" className="text-destructive" disabled={isMutating} onClick={handleReject}>
                Reject
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function NormalizationReviewQueuePage() {
  const user = useSessionStore((s) => s.user);
  const roles = user?.roles ?? [];
  const canDecide = permissionService.hasPermission(roles, Permission.TRANSPORT_COST_NORMALIZE);

  const [kindFilter, setKindFilter] = useState<NormalizationKind | undefined>(undefined);
  const [page, setPage] = useState(1);

  const { data: result, isLoading, isError, error, refetch } = useNormalizationReviewQueue({
    kind: kindFilter,
    page,
    limit: PAGE_SIZE,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Identity review queue"
        description="Transporter and vehicle identities awaiting a human decision before any record referencing them can post to the finance ledger."
        breadcrumbs={[{ label: 'Transport cost' }, { label: 'Review queue' }]}
      />

      <div className="flex items-center gap-1.5">
        <Button size="sm" variant={kindFilter === undefined ? 'default' : 'outline'} onClick={() => { setKindFilter(undefined); setPage(1); }}>
          All
        </Button>
        <Button size="sm" variant={kindFilter === 'transporter' ? 'default' : 'outline'} onClick={() => { setKindFilter('transporter'); setPage(1); }}>
          Transporters
        </Button>
        <Button size="sm" variant={kindFilter === 'vehicle' ? 'default' : 'outline'} onClick={() => { setKindFilter('vehicle'); setPage(1); }}>
          Vehicles
        </Button>
      </div>

      {isError && (
        <div className="p-4 text-center text-body-sm text-destructive">
          {describeQueryError(error)}
          <div className="mt-2">
            <Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button>
          </div>
        </div>
      )}

      {isLoading && <p className="py-8 text-center text-body-sm text-muted-foreground">Loading&hellip;</p>}

      {!isLoading && !isError && (result?.data.length ?? 0) === 0 && (
        <p className="py-8 text-center text-body-sm text-muted-foreground">Nothing waiting on review.</p>
      )}

      {!isLoading && !isError && (
        <div className="space-y-3">
          {result?.data.map((item) => (
            <ReviewItemCard key={item._id} item={item} canDecide={canDecide} />
          ))}
        </div>
      )}

      {result && result.pagination.totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-caption text-muted-foreground">
            Page {result.pagination.page} of {result.pagination.totalPages} &middot; {result.pagination.total} item(s)
          </p>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={!result.pagination.hasPrev} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Previous
            </Button>
            <Button size="sm" variant="outline" disabled={!result.pagination.hasNext} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// frontend/modules/fuel/pages/FuelDetailPage.tsx

'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft, Pencil, Trash2, CheckCircle2, AlertTriangle, MinusCircle } from 'lucide-react';
import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { PageLoader } from '@/frontend/shared/loading/PageLoader';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useSessionStore } from '@/frontend/shared/store/session.store';
import { Permission, permissionService } from '@/server/permissions/roles';
import { useFuelLog, useFuelLedgerReconciliation } from '../hooks/useFuel';
import { useDeleteFuelLog } from '../hooks/useFuelMutations';
import { canManageFuel, canDeleteFuel } from '../utils';
import { formatDate } from '@/shared/utils/date.utils';
import { formatCurrency } from '@/shared/utils/currency.utils';
import { FUEL_ROUTES } from '../routes';
import { TRIP_ROUTES } from '@/frontend/modules/trips/routes';

interface FuelDetailPageProps {
  fuelLogId: string;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-body-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

/**
 * Same row shape as DetailRow, but the value navigates somewhere useful
 * instead of sitting inert. MODULE CONNECTIVITY UPGRADE (UX audit): this
 * page used to render the vehicle plate and trip id as plain text --
 * dead ends an operator could not act on, unlike Vehicle Detail's own
 * cross-linked layout. Mirrors the Button-as-link convention already
 * used on MaintenanceDetailPage/ExpenseDetailPage's "Vehicle" card.
 */
function DetailLinkRow({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 text-body-sm">
      <span className="text-muted-foreground">{label}</span>
      <Button variant="link" size="sm" className="h-auto p-0 font-medium" onClick={onClick}>
        {value}
      </Button>
    </div>
  );
}

/**
 * MODULE CONNECTIVITY UPGRADE (fuel/GL reconciliation gap). Mirrors the
 * status-badge convention GLReconciliationPage already established
 * (CheckCircle2/text-success for matched, AlertTriangle/text-warning for
 * a variance) so the same visual language means the same thing in both
 * places, rather than inventing a second one for this page.
 */
function LedgerStatusBadge({ status }: { status: 'matched' | 'stale' | 'not_posted' }) {
  if (status === 'matched') {
    return (
      <span className="inline-flex items-center gap-1.5 text-success">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
        Posted · matches current cost
      </span>
    );
  }
  if (status === 'stale') {
    return (
      <span className="inline-flex items-center gap-1.5 text-warning">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
        Posted · no longer matches cost
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      <MinusCircle className="h-3.5 w-3.5" aria-hidden="true" />
      Not posted to ledger
    </span>
  );
}

export function FuelDetailPage({ fuelLogId }: FuelDetailPageProps) {
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const roles = user?.roles ?? [];
  const canManage = canManageFuel(roles);
  const canDelete = canDeleteFuel(roles);
  const hasFinanceView = permissionService.hasPermission(roles, Permission.FINANCE_VIEW);

  const { data: log, isLoading, isError } = useFuelLog(fuelLogId);
  const deleteFuelLog = useDeleteFuelLog();
  const {
    data: reconciliation,
    isLoading: isReconciliationLoading,
    isError: isReconciliationError,
  } = useFuelLedgerReconciliation(fuelLogId, hasFinanceView);

  if (isLoading) return <PageLoader label="Loading fuel entry" />;

  if (isError || !log) {
    return (
      <EmptyState
        title="Fuel entry not found"
        description="This entry may have been removed or you don't have access to it."
        action={{ label: 'Back to fuel logs', onClick: () => router.push(FUEL_ROUTES.list) }}
      />
    );
  }

  async function handleDelete() {
    if (!window.confirm(`Delete this fuel entry for ${log!.license_plate}?`)) return;
    await deleteFuelLog.mutateAsync({ id: fuelLogId, soft: true });
    router.push(FUEL_ROUTES.list);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Fuel entry · ${log.license_plate}`}
        description={formatDate(log.date, 'MMM dd, yyyy')}
        breadcrumbs={[
          { label: 'Fuel', href: FUEL_ROUTES.dashboard },
          { label: 'Logs', href: FUEL_ROUTES.list },
          { label: log.license_plate },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push(FUEL_ROUTES.list)}>
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </Button>
            {canManage && (
              <Button size="sm" onClick={() => router.push(FUEL_ROUTES.edit(fuelLogId))}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
            )}
            {canDelete && (
              <Button variant="destructive" size="sm" onClick={handleDelete}>
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
            )}
          </div>
        }
      />

      {log.is_full_tank && <Badge variant="outline" className="border-success text-success">Full tank</Badge>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Fuel entry overview</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <DetailLinkRow
              label="Vehicle"
              value={log.license_plate}
              onClick={() => router.push(FUEL_ROUTES.vehicleHistory(log.license_plate))}
            />
            <DetailRow label="Date" value={formatDate(log.date)} />
            <DetailRow label="Volume" value={`${log.fuel_volume} ${log.unit?.symbol ?? 'L'}`} />
            <DetailRow label="Cost" value={formatCurrency(log.cost, { currency: log.currency || 'USD' })} />
            <DetailRow label="Odometer" value={log.odometer != null ? log.odometer.toLocaleString() : 'N/A'} />
            {log.tripId && (
              <DetailLinkRow
                label="Linked trip"
                value="View trip"
                onClick={() => router.push(TRIP_ROUTES.detail(log.tripId as string))}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Additional details</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <DetailRow label="Station" value={log.station_name || 'Not recorded'} />
            <DetailRow label="Fuel type" value={log.fuel_type || 'Not recorded'} />
            <DetailRow label="Full tank" value={log.is_full_tank ? 'Yes' : 'No'} />
            {/*
              log.driver is NOT who fuelled the vehicle on this date -- it's
              the vehicle's CURRENT Operational Hub assignment, resolved by
              FuelRepository.enrichFuelLogs (see FuelLog.driver's doc
              comment). The log's own transaction-time driver_id has no
              resolved name anywhere in this codebase today, so showing
              nothing would be more honest than guessing -- but silently
              dropping driver context entirely was one of the UX audit's
              named gaps. The label says exactly what the value is, so an
              operator never reads it as "who bought this fuel."
            */}
            {log.driver?.name && <DetailRow label="Vehicle's current driver" value={log.driver.name} />}
            {log.receipt_url && (
              <div className="flex items-center justify-between gap-4 text-body-sm">
                <span className="text-muted-foreground">Receipt</span>
                <a href={log.receipt_url} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
                  View receipt
                </a>
              </div>
            )}
          </CardContent>
        </Card>

        {hasFinanceView && (
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle>Financial posting</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {isReconciliationLoading ? (
                <p className="text-body-sm text-muted-foreground">Checking ledger status…</p>
              ) : isReconciliationError ? (
                <p className="text-body-sm text-muted-foreground">Couldn&apos;t load the ledger status for this entry.</p>
              ) : reconciliation ? (
                <>
                  <LedgerStatusBadge status={reconciliation.status} />
                  {reconciliation.posting && (
                    <>
                      <DetailRow
                        label="Posted amount"
                        value={formatCurrency(reconciliation.posting.amount, { currency: reconciliation.posting.currency })}
                      />
                      <DetailRow label="GL account code" value={reconciliation.posting.glAccountCode ?? 'Unmapped'} />
                      <DetailRow label="Posted on" value={formatDate(reconciliation.posting.postedAt)} />
                      {reconciliation.status === 'stale' && reconciliation.varianceFromCurrentCost != null && (
                        <DetailRow
                          label="Variance from current cost"
                          value={formatCurrency(reconciliation.varianceFromCurrentCost, {
                            currency: reconciliation.posting.currency,
                          })}
                        />
                      )}
                    </>
                  )}
                  {reconciliation.status === 'not_posted' && reconciliation.notPostedReason && (
                    <p className="text-body-sm text-muted-foreground">{reconciliation.notPostedReason}</p>
                  )}
                  <p className="text-caption text-muted-foreground">
                    Fuel volume has no ledger counterpart -- only this entry&apos;s own recorded volume exists; the
                    ledger tracks financial value only.
                  </p>
                </>
              ) : null}
            </CardContent>
          </Card>
        )}

        {log.notes && (
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
            <CardContent><p className="whitespace-pre-wrap text-body-sm text-foreground">{log.notes}</p></CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
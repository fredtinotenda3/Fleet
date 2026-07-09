// frontend/modules/fuel/pages/FuelDetailPage.tsx

'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { PageLoader } from '@/frontend/shared/loading/PageLoader';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useSessionStore } from '@/frontend/shared/store/session.store';
import { useFuelLog } from '../hooks/useFuel';
import { useDeleteFuelLog } from '../hooks/useFuelMutations';
import { canManageFuel, canDeleteFuel } from '../utils';
import { formatDate } from '@/shared/utils/date.utils';
import { formatCurrency } from '@/shared/utils/currency.utils';
import { FUEL_ROUTES } from '../routes';

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

export function FuelDetailPage({ fuelLogId }: FuelDetailPageProps) {
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const roles = user?.roles ?? [];
  const canManage = canManageFuel(roles);
  const canDelete = canDeleteFuel(roles);

  const { data: log, isLoading, isError } = useFuelLog(fuelLogId);
  const deleteFuelLog = useDeleteFuelLog();

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
            <DetailRow label="Vehicle" value={log.license_plate} />
            <DetailRow label="Date" value={formatDate(log.date)} />
            <DetailRow label="Volume" value={`${log.fuel_volume} ${log.unit?.symbol ?? 'L'}`} />
            <DetailRow label="Cost" value={formatCurrency(log.cost, { currency: log.currency || 'USD' })} />
            <DetailRow label="Odometer" value={log.odometer != null ? log.odometer.toLocaleString() : 'N/A'} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Additional details</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <DetailRow label="Station" value={log.station_name || 'Not recorded'} />
            <DetailRow label="Fuel type" value={log.fuel_type || 'Not recorded'} />
            <DetailRow label="Full tank" value={log.is_full_tank ? 'Yes' : 'No'} />
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
//app/(protected)/fuel/logs/[id]/edit/page.tsx

'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { PageLoader } from '@/frontend/shared/loading/PageLoader';
import { FuelForm } from '@/frontend/modules/fuel/components/FuelForm';
import { useFuelLog } from '@/frontend/modules/fuel/hooks/useFuel';
import { useUpdateFuelLog } from '@/frontend/modules/fuel/hooks/useFuelMutations';
import { FUEL_ROUTES } from '@/frontend/modules/fuel/routes';
import type { FuelFormValues } from '@/frontend/modules/fuel/schemas';

export default function EditFuelLogPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: log, isLoading } = useFuelLog(id);
  const updateFuelLog = useUpdateFuelLog(id);

  if (isLoading) return <PageLoader label="Loading fuel entry" />;
  if (!log) return null;

  async function handleSubmit(values: FuelFormValues) {
    await updateFuelLog.mutateAsync(values);
    router.push(FUEL_ROUTES.detail(id));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Edit fuel entry"
        breadcrumbs={[
          { label: 'Fuel', href: FUEL_ROUTES.dashboard },
          { label: 'Logs', href: FUEL_ROUTES.list },
          { label: log.license_plate, href: FUEL_ROUTES.detail(id) },
          { label: 'Edit' },
        ]}
      />
      <div className="p-4 max-w-form-wide surface-card">
        <FuelForm
          defaultValues={{
            license_plate: log.license_plate,
            unit_id: log.unit_id,
            date: new Date(log.date),
            fuel_volume: log.fuel_volume,
            cost: log.cost,
            currency: log.currency ?? 'USD',
            odometer: log.odometer,
            is_full_tank: log.is_full_tank ?? false,
            station_name: log.station_name ?? '',
            fuel_type: log.fuel_type ?? '',
            notes: log.notes ?? '',
            receipt_url: log.receipt_url ?? '',
          }}
          onSubmit={handleSubmit}
          onCancel={() => router.push(FUEL_ROUTES.detail(id))}
          submitLabel="Save changes"
        />
      </div>
    </div>
  );
}
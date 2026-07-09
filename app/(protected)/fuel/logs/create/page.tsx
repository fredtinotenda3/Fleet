'use client';

import { useRouter } from 'next/navigation';
import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { FuelForm } from '@/frontend/modules/fuel/components/FuelForm';
import { useCreateFuelLog } from '@/frontend/modules/fuel/hooks/useFuelMutations';
import { FUEL_ROUTES } from '@/frontend/modules/fuel/routes';
import type { FuelFormValues } from '@/frontend/modules/fuel/schemas';

export default function CreateFuelLogPage() {
  const router = useRouter();
  const createFuelLog = useCreateFuelLog();

  async function handleSubmit(values: FuelFormValues) {
    const log = await createFuelLog.mutateAsync(values);
    router.push(FUEL_ROUTES.detail(log._id!));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Log fuel entry"
        breadcrumbs={[
          { label: 'Fuel', href: FUEL_ROUTES.dashboard },
          { label: 'Logs', href: FUEL_ROUTES.list },
          { label: 'Create' },
        ]}
      />
      <div className="p-4 max-w-form-wide surface-card">
        <FuelForm onSubmit={handleSubmit} onCancel={() => router.push(FUEL_ROUTES.list)} submitLabel="Log fuel entry" />
      </div>
    </div>
  );
}
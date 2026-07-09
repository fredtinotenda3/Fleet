// frontend/modules/maintenance/pages/ServiceCalendarPage.tsx

'use client';

import { useRouter } from 'next/navigation';
import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { ServiceCalendar } from '../components/ServiceCalendar';
import { MAINTENANCE_ROUTES } from '../routes';

export function ServiceCalendarPage() {
  const router = useRouter();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Service calendar"
        description="Monthly view of scheduled and overdue maintenance."
        breadcrumbs={[{ label: 'Maintenance', href: MAINTENANCE_ROUTES.dashboard }, { label: 'Calendar' }]}
      />
      <div className="p-4 surface-card">
        <ServiceCalendar onSelectRecord={(record) => router.push(MAINTENANCE_ROUTES.detail(record._id))} />
      </div>
    </div>
  );
}
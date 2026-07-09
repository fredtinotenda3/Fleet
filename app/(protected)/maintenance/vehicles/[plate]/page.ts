// app/(protected)/maintenance/vehicles/[plate]/page.tsx

import { VehicleMaintenanceHistoryPage } from '@/frontend/modules/maintenance';

interface PageProps {
  params: Promise<{ plate: string }>;
}

export default async function Page({ params }: PageProps) {
  const { plate } = await params;
  return <VehicleMaintenanceHistoryPage licensePlate={decodeURIComponent(plate)} />;
}
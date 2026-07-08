//app/(protected)/vehicles/[id]/page.tsx

import { VehicleDetailPage } from '@/frontend/modules/vehicles/pages/VehicleDetailPage';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function Page({ params }: PageProps) {
  const { id } = await params;
  return <VehicleDetailPage vehicleId={id} />;
}
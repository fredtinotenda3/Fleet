// app/(protected)/trips/vehicles/[plate]/page.tsx

import { VehicleTripHistoryPage } from '@/frontend/modules/trips/pages/VehicleTripHistoryPage';

interface PageProps {
  params: Promise<{ plate: string }>;
}

export default async function Page({ params }: PageProps) {
  const { plate } = await params;
  return <VehicleTripHistoryPage licensePlate={decodeURIComponent(plate)} />;
}

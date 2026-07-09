//app/(protected)/fuel/vehicles/[plate]/page.tsx

import { VehicleFuelHistoryPage } from '@/frontend/modules/fuel/pages/VehicleFuelHistoryPage';

export default async function Page({ params }: { params: Promise<{ plate: string }> }) {
  const { plate } = await params;
  return <VehicleFuelHistoryPage licensePlate={decodeURIComponent(plate)} />;
}
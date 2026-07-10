
// app/(protected)/expenses/vehicles/[plate]/page.tsx

import { VehicleExpenseHistoryPage } from '@/frontend/modules/expenses/pages/VehicleExpenseHistoryPage';

interface PageProps {
  params: Promise<{ plate: string }>;
}

export default async function Page({ params }: PageProps) {
  const { plate } = await params;
  return <VehicleExpenseHistoryPage licensePlate={decodeURIComponent(plate)} />;
}
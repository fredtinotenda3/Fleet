//app/(protected)/fuel/logs/[id]/page.tsx

import { FuelDetailPage } from '@/frontend/modules/fuel/pages/FuelDetailPage';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FuelDetailPage fuelLogId={id} />;
}
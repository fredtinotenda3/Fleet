// app/(protected)/maintenance/[id]/page.tsx

import { MaintenanceDetailPage } from '@/frontend/modules/maintenance';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function Page({ params }: PageProps) {
  const { id } = await params;
  return <MaintenanceDetailPage id={id} />;
}
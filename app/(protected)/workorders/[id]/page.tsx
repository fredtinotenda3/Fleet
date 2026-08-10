// app/(protected)/workorders/[id]/page.tsx

import { WorkOrderDetailPage } from '@/frontend/modules/workorders';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function Page({ params }: PageProps) {
  const { id } = await params;
  return <WorkOrderDetailPage id={id} />;
}
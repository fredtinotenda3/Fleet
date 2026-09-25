// app/(protected)/transport-cost/operations/[id]/page.tsx

import { TransportOperationDetailPage } from '@/frontend/modules/transport-cost/pages/TransportOperationDetailPage';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function Page({ params }: PageProps) {
  const { id } = await params;
  return <TransportOperationDetailPage sourceRecordId={id} />;
}

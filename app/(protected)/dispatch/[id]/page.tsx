// app/(protected)/dispatch/[id]/page.tsx

import { DispatchDetailPage } from '@/frontend/modules/dispatch';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function Page({ params }: PageProps) {
  const { id } = await params;
  return <DispatchDetailPage id={id} />;
}

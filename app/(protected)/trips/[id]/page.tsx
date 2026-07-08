// app/(protected)/trips/[id]/page.tsx

import { TripDetailPage } from '@/frontend/modules/trips/pages/TripDetailPage';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function Page({ params }: PageProps) {
  const { id } = await params;
  return <TripDetailPage tripId={id} />;
}
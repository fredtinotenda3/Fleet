// app/(protected)/drivers/[id]/scorecard/page.tsx

import { DriverScorecardPage } from '@/frontend/modules/ai/pages';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function Page({ params }: PageProps) {
  const { id } = await params;
  return <DriverScorecardPage driverId={id} />;
}

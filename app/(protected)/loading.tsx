// app/(protected)/loading.tsx

import { PageLoader } from '@/frontend/shared/loading/PageLoader';

export default function ProtectedLoading() {
  return <PageLoader label="Loading" />;
}
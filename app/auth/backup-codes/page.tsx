
// app/auth/backup-codes/page.tsx

import { RouteGuard } from '@/frontend/shared/guards/RouteGuard';
import { BackupCodesPage } from '@/frontend/modules/auth/pages/BackupCodesPage';

export default function Page() {
  return (
    <RouteGuard>
      <BackupCodesPage />
    </RouteGuard>
  );
}


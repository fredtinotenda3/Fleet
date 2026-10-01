import { PermissionGuard } from '@/frontend/shared/guards/PermissionGuard';
import { Permission } from '@/server/permissions/roles';
import ExecutiveDashboard from '@/frontend/modules/reports/pages/ExecutiveDashboard';

export default function ReportsPage() {
  return (
    <PermissionGuard
      permission={Permission.REPORT_VIEW}
      fallback={<div className="p-6 text-sm text-muted-foreground">You don&apos;t have access to reports.</div>}
    >
      <ExecutiveDashboard />
    </PermissionGuard>
  );
}
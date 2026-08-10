// frontend/modules/workorders/pages/WorkOrderListPage.tsx
//
// This is the page the Command Centre / DVIR notification link
// (`/workorders?license_plate=...`, generated server-side in
// needs-attention.service.ts and dvir.service.ts -- not modified
// here) has been 404ing against. When that query param is present and
// resolves to exactly one work order, this page forwards straight to
// that work order's detail page instead of making the user pick it out
// of a filtered list of one -- see the effect below. Multiple matches
// (a vehicle with more than one open work order) fall through to the
// normal filtered list so the user can choose.

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { useSessionStore } from '@/frontend/shared/store/session.store';
import { WorkOrderFilters } from '../components/WorkOrderFilters';
import { WorkOrderTable } from '../components/WorkOrderTable';
import { AssignMechanicDialog } from '../components/AssignMechanicDialog';
import { useWorkOrderList } from '../hooks/useWorkOrders';
import { useAssignMechanic } from '../hooks/useWorkOrderMutations';
import { canAssignWorkOrders } from '../utils';
import { WORKORDER_ROUTES } from '../routes';
import type { WorkOrder, WorkOrderFilters as WorkOrderFiltersType, AssignMechanicPayload } from '../types';

const PAGE_SIZE = 10;

export function WorkOrderListPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const licensePlateParam = searchParams.get('license_plate') ?? undefined;

  const user = useSessionStore((s) => s.user);
  const roles = user?.roles ?? [];
  const canAssign = canAssignWorkOrders(roles);

  const [filters, setFilters] = useState<WorkOrderFiltersType>({ license_plate: licensePlateParam });
  const [page, setPage] = useState(1);
  const [assignTarget, setAssignTarget] = useState<WorkOrder | null>(null);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [autoRedirectChecked, setAutoRedirectChecked] = useState(false);

  const listParams = useMemo(() => ({ ...filters, page, limit: PAGE_SIZE }), [filters, page]);
  const { data: result, isLoading } = useWorkOrderList(listParams);

  const assignMechanic = useAssignMechanic(assignTarget?._id ?? '');

  // Deep-link forwarding: a plate with exactly one matching work order
  // goes straight to its detail page. Runs once per incoming plate
  // (guarded by autoRedirectChecked) so it doesn't fight the user if
  // they clear the filter afterwards.
  useEffect(() => {
    if (!licensePlateParam || autoRedirectChecked || isLoading || !result) return;
    setAutoRedirectChecked(true);
    if (result.data.length === 1) {
      router.replace(WORKORDER_ROUTES.detail(result.data[0]._id!));
    }
  }, [licensePlateParam, autoRedirectChecked, isLoading, result, router]);

  function handleFiltersChange(next: WorkOrderFiltersType) {
    setFilters(next);
    setPage(1);
  }

  function openAssign(workOrder: WorkOrder) {
    setAssignTarget(workOrder);
    setAssignDialogOpen(true);
  }

  async function handleAssign(values: AssignMechanicPayload) {
    await assignMechanic.mutateAsync(values);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Work orders"
        description="Repairs and inspections raised against your fleet, from driver defects, scheduled maintenance, or manual entry."
        breadcrumbs={[{ label: 'Work orders' }]}
      />

      <div className="p-4 space-y-4 surface-card">
        <WorkOrderFilters filters={filters} onChange={handleFiltersChange} />
        <WorkOrderTable
          result={result}
          isLoading={isLoading}
          onPageChange={setPage}
          onView={(workOrder) => router.push(WORKORDER_ROUTES.detail(workOrder._id!))}
          onAssign={openAssign}
          canAssign={canAssign}
        />
      </div>

      <AssignMechanicDialog
        open={assignDialogOpen}
        workOrder={assignTarget}
        onOpenChange={setAssignDialogOpen}
        onSubmit={handleAssign}
        isSubmitting={assignMechanic.isPending}
      />
    </div>
  );
}
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
import dynamic from 'next/dynamic';
import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { describeQueryError } from '@/frontend/shared/ui/patterns';
import { useSessionStore } from '@/frontend/shared/store/session.store';
import { WorkOrderFilterBar } from '../components/WorkOrderFilterBar';
import { WorkOrderTable } from '../components/WorkOrderTable';
import { AssignMechanicDialog } from '../components/AssignMechanicDialog';
// Loaded on click. The create form pulls the whole vehicle picker, which
// nobody browsing the work-order list needs until they raise a job.
const WorkOrderModal = dynamic(
  () => import('../components/WorkOrderModal').then((m) => m.WorkOrderModal),
  { ssr: false }
);
import { useWorkOrderList } from '../hooks/useWorkOrders';
import { useAssignMechanic, useCreateWorkOrder } from '../hooks/useWorkOrderMutations';
import { canAssignWorkOrders, canCreateWorkOrders } from '../utils';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Plus } from 'lucide-react';
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
  /**
   * Until now nothing in the UI could raise a work order. They arrived
   * only from a DVIR defect, a maintenance reminder, or an attention
   * item -- so `POST /api/workorders` shipped, permission-gated and
   * tested, reachable by other code and by nobody in a workshop. See
   * WorkOrderForm for why that is an origin story rather than a design.
   */
  const canCreate = canCreateWorkOrders(roles);

  const [filters, setFilters] = useState<WorkOrderFiltersType>({ license_plate: licensePlateParam });
  const [page, setPage] = useState(1);
  const [assignTarget, setAssignTarget] = useState<WorkOrder | null>(null);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [autoRedirectChecked, setAutoRedirectChecked] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const listParams = useMemo(() => ({ ...filters, page, limit: PAGE_SIZE }), [filters, page]);
  const { data: result, isLoading, isError, error, refetch } = useWorkOrderList(listParams);

  // Drives the empty state's branch: "no work orders at all" (a workshop that
  // has not raised any yet) versus "no work orders match your filters" (the
  // operator hiding their own backlog). Rendering the same message for both is
  // what made a quiet workshop and an over-filtered list look identical.
  const hasFilters = Object.values(filters).some(
    (value) => value !== undefined && value !== null && value !== ''
  );

  const assignMechanic = useAssignMechanic(assignTarget?._id ?? '');
  const createWorkOrder = useCreateWorkOrder();

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
        actions={
          canCreate ? (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              New work order
            </Button>
          ) : undefined
        }
      />

      <div className="p-4 space-y-4 surface-card">
        <WorkOrderFilterBar filters={filters} onChange={handleFiltersChange} />
        <WorkOrderTable
          result={result}
          isLoading={isLoading}
          isError={isError}
          errorMessage={describeQueryError(error)}
          onRetry={() => refetch()}
          hasFilters={hasFilters}
          onClearFilters={() => handleFiltersChange({})}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
          onView={(workOrder) => router.push(WORKORDER_ROUTES.detail(workOrder._id!))}
          onAssign={openAssign}
          canAssign={canAssign}
          // The empty state's create button has been dead since this
          // module shipped -- WorkOrderTable's own prop doc says so.
          onCreate={canCreate ? () => setCreateOpen(true) : undefined}
        />
      </div>

      {createOpen && (
        <WorkOrderModal
          open
          // Prefilled from the current filter when the page was reached
          // by a `?license_plate=` deep link, so a job raised from a
          // vehicle-filtered list lands on that vehicle.
          defaultLicensePlate={filters.license_plate}
          isSubmitting={createWorkOrder.isPending}
          onOpenChange={setCreateOpen}
          onSubmit={(values) => createWorkOrder.mutateAsync(values)}
        />
      )}

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
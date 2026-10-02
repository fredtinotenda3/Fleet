// frontend/modules/dispatch/pages/DispatchListPage.tsx
//
// Mirrors WorkOrderListPage.tsx's structure (filter bar + table + create
// modal + assign dialog), simplified where Dispatch genuinely differs:
// no `?license_plate=` deep-link forwarding (nothing links into Dispatch
// that way yet -- the Command Centre's dispatch attention items link
// straight to a job's detail page instead, via NeedsAttentionItem.href).

'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { describeQueryError } from '@/frontend/shared/ui/patterns';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { useSessionStore } from '@/frontend/shared/store/session.store';
import { DispatchFilterBar } from '../components/DispatchFilterBar';
import { DispatchTable } from '../components/DispatchTable';
import { AssignDispatchDialog } from '../components/AssignDispatchDialog';
// Loaded on click, same rationale as WorkOrderModal's dynamic import --
// nobody browsing the list needs the create form until they raise a job.
const DispatchModal = dynamic(
  () => import('../components/DispatchModal').then((m) => m.DispatchModal),
  { ssr: false }
);
import { useDispatchList } from '../hooks/useDispatch';
import { useAssignDispatchJob, useCreateDispatchJob } from '../hooks/useDispatchMutations';
import { canAssignDispatch, canCreateDispatch } from '../utils';
import { DISPATCH_ROUTES } from '../routes';
import type { DispatchJob, DispatchFilters, AssignDispatchPayload } from '../types';

const PAGE_SIZE = 10;

export function DispatchListPage() {
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const roles = user?.roles ?? [];
  const canAssign = canAssignDispatch(roles);
  const canCreate = canCreateDispatch(roles);

  const [filters, setFilters] = useState<DispatchFilters>({});
  const [page, setPage] = useState(1);
  const [assignTarget, setAssignTarget] = useState<DispatchJob | null>(null);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const listParams = useMemo(() => ({ ...filters, page, limit: PAGE_SIZE }), [filters, page]);
  const { data: result, isLoading, isError, error, refetch } = useDispatchList(listParams);

  const hasFilters = Object.values(filters).some(
    (value) => value !== undefined && value !== null && value !== ''
  );

  const assignJob = useAssignDispatchJob(assignTarget?._id ?? '');
  const createDispatchJob = useCreateDispatchJob();

  function handleFiltersChange(next: DispatchFilters) {
    setFilters(next);
    setPage(1);
  }

  function openAssign(job: DispatchJob) {
    setAssignTarget(job);
    setAssignDialogOpen(true);
  }

  async function handleAssign(values: AssignDispatchPayload) {
    await assignJob.mutateAsync(values);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dispatch"
        description="Operational demand assigned to a vehicle and driver, tracked through execution to its trip, cost and outcome."
        breadcrumbs={[{ label: 'Dispatch' }]}
        actions={
          canCreate ? (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              New dispatch job
            </Button>
          ) : undefined
        }
      />

      <div className="p-4 space-y-4 surface-card">
        <DispatchFilterBar filters={filters} onChange={handleFiltersChange} />
        <DispatchTable
          result={result}
          isLoading={isLoading}
          isError={isError}
          errorMessage={describeQueryError(error)}
          onRetry={() => refetch()}
          hasFilters={hasFilters}
          onClearFilters={() => handleFiltersChange({})}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
          onView={(job) => router.push(DISPATCH_ROUTES.detail(job._id!))}
          onAssign={openAssign}
          canAssign={canAssign}
          onCreate={canCreate ? () => setCreateOpen(true) : undefined}
        />
      </div>

      {createOpen && (
        <DispatchModal
          open
          isSubmitting={createDispatchJob.isPending}
          onOpenChange={setCreateOpen}
          onSubmit={(values) => createDispatchJob.mutateAsync(values)}
        />
      )}

      <AssignDispatchDialog
        open={assignDialogOpen}
        job={assignTarget}
        onOpenChange={setAssignDialogOpen}
        onSubmit={handleAssign}
        isSubmitting={assignJob.isPending}
      />
    </div>
  );
}

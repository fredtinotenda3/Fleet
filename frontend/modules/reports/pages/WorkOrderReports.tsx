// frontend/modules/reports/pages/WorkOrderReports.tsx
//
// WAVE 3, R.3.6 -- Work Order Reporting. Before this page, there was no
// work-order KPI/reporting surface anywhere in the product:
// WorkOrderListPage.tsx is a pure CRUD list, and WorkOrderRepository's
// own countByStatusInScope (which its doc comment claimed backed "the
// Workshop Manager dashboard's workload widget") had zero callers
// anywhere in the codebase -- see the audit note on that method.
//
// This page follows ExecutiveDashboard.tsx's established pattern
// exactly (same date-range control shape, same StatsCard grid, same
// isForbiddenError-driven Restricted/Error/Loading handling) rather
// than inventing a second dashboard visual language.
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { LoadingState } from '@/shared/ui/feedback/LoadingState';
import { StatsCard } from '@/shared/ui/cards/StatsCard';
import { WorkOrderBarChart, type WorkOrderBarChartDatum } from '../components/charts/WorkOrderBarChart';
import { useWorkOrderStats } from '@/frontend/modules/workorders/hooks/useWorkOrders';
import { WORK_ORDER_STATUSES, WORK_ORDER_STATUS_LABELS } from '@/frontend/modules/workorders/types';
import type { Priority } from '@/frontend/modules/workorders/types';
import { WORKORDER_ROUTES } from '@/frontend/modules/workorders/routes';
import { formatCurrency } from '@/shared/utils/currency.utils';
import { isForbiddenError } from '@/shared/utils/api-client.utils';
import { DATE_PRESETS, type DatePreset } from '../schemas/executiveDashboard';
import { resolveDateRange } from '../utils/resolveDatePreset';
import { REPORTS_ROUTES } from '../routes';
import Link from 'next/link';

const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  last7Days: 'Last 7 days',
  last30Days: 'Last 30 days',
  thisMonth: 'This month',
  lastMonth: 'Last month',
  thisQuarter: 'This quarter',
  lastQuarter: 'Last quarter',
  thisYear: 'This year',
  lastYear: 'Last year',
  custom: 'Custom range',
};

const PRIORITY_ORDER: Priority[] = ['low', 'medium', 'high', 'critical'];
const PRIORITY_LABELS: Record<Priority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

interface WorkOrderReportsFilter {
  datePreset: DatePreset;
  dateFrom?: string;
  dateTo?: string;
}

const DEFAULT_FILTER: WorkOrderReportsFilter = { datePreset: 'last30Days' };

export default function WorkOrderReports() {
  const router = useRouter();
  const [filter, setFilter] = useState<WorkOrderReportsFilter>(DEFAULT_FILTER);

  // Created-date (openedAt) filter -- see WorkOrderRepository.getStatsInScope's
  // doc comment for why openedAt (not completedAt) is the field a date
  // range narrows on, matching the "created date" semantics every other
  // date-ranged report in this module uses.
  const dateRange = resolveDateRange(filter.datePreset, { dateFrom: filter.dateFrom, dateTo: filter.dateTo });
  const stats = useWorkOrderStats(dateRange);

  // R.3.6, same reasoning as R.3.1's Fleet Summary hardening: /reports/*
  // is gated by REPORT_VIEW, a broader permission than WORKORDER_VIEW
  // (DEPARTMENT_MANAGER/SUPERVISOR/ACCOUNTANT/AUDITOR/VIEWER hold
  // REPORT_VIEW without WORKORDER_VIEW -- see server/permissions/
  // roles.ts). A 403 here is an expected, permission-driven outcome for
  // those roles, not a system failure -- "Restricted" must be shown,
  // never a fabricated "0 work orders."
  const isRestricted = isForbiddenError(stats.error);

  if (stats.isLoading) {
    return <LoadingState />;
  }

  if (isRestricted) {
    return (
      <div className="flex flex-col gap-4 items-center justify-center py-12">
        <p className="text-muted-foreground">You don&apos;t have permission to view work order reports.</p>
      </div>
    );
  }

  if (stats.isError) {
    return (
      <div className="flex flex-col gap-4 items-center justify-center py-12">
        <p className="text-destructive">Failed to load work order reports.</p>
        <button
          onClick={() => stats.refetch()}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border rounded-md hover:bg-accent"
        >
          <RefreshCw className="h-4 w-4" /> Retry
        </button>
      </div>
    );
  }

  const data = stats.data;

  const statusChartData: WorkOrderBarChartDatum[] = data
    ? WORK_ORDER_STATUSES.map((status) => ({
        name: WORK_ORDER_STATUS_LABELS[status],
        count: data.statusCounts[status] ?? 0,
        filterValue: status,
      }))
    : [];

  const priorityChartData: WorkOrderBarChartDatum[] = data
    ? PRIORITY_ORDER.map((priority) => ({
        name: PRIORITY_LABELS[priority],
        count: data.priorityCounts[priority] ?? 0,
        filterValue: priority,
      }))
    : [];

  const workshopChartData: WorkOrderBarChartDatum[] = (data?.byWorkshop ?? []).map((w) => ({
    name: w.orgUnitName ?? 'No branch on record',
    count: w.count,
  }));

  const turnaroundCoverageNote =
    data && data.turnaround.sampleSize > 0
      ? data.turnaround.completedMissingTimestamps > 0
        ? `Based on ${data.turnaround.sampleSize} of ${data.turnaround.sampleSize + data.turnaround.completedMissingTimestamps} completed work orders with a recorded completion time.`
        : `Based on all ${data.turnaround.sampleSize} completed work orders in range.`
      : undefined;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Work Order Reports"
        description="Workload, completion, and cost across your workshop(s)."
        actions={
          <button
            type="button"
            onClick={() => stats.refetch()}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium border rounded-md hover:bg-accent"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        }
      />

      {/* Date range control, identical pattern to ExecutiveDashboard.tsx's --
          filters on openedAt (created date). */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="workorder-date-preset" className="block mb-1 text-xs font-medium text-muted-foreground">
            Date range (created)
          </label>
          <select
            id="workorder-date-preset"
            value={filter.datePreset}
            onChange={(e) => setFilter({ ...filter, datePreset: e.target.value as DatePreset })}
            className="px-3 py-2 text-sm border rounded-md bg-background"
          >
            {DATE_PRESETS.map((preset) => (
              <option key={preset} value={preset}>
                {DATE_PRESET_LABELS[preset]}
              </option>
            ))}
          </select>
        </div>
        {filter.datePreset === 'custom' && (
          <>
            <div>
              <label htmlFor="workorder-date-from" className="block mb-1 text-xs font-medium text-muted-foreground">
                From
              </label>
              <input
                id="workorder-date-from"
                type="date"
                value={filter.dateFrom?.slice(0, 10) ?? ''}
                onChange={(e) =>
                  setFilter({
                    ...filter,
                    dateFrom: e.target.value ? new Date(`${e.target.value}T00:00:00.000Z`).toISOString() : undefined,
                  })
                }
                className="px-3 py-2 text-sm border rounded-md bg-background"
              />
            </div>
            <div>
              <label htmlFor="workorder-date-to" className="block mb-1 text-xs font-medium text-muted-foreground">
                To
              </label>
              <input
                id="workorder-date-to"
                type="date"
                value={filter.dateTo?.slice(0, 10) ?? ''}
                onChange={(e) =>
                  setFilter({
                    ...filter,
                    dateTo: e.target.value ? new Date(`${e.target.value}T23:59:59.999Z`).toISOString() : undefined,
                  })
                }
                className="px-3 py-2 text-sm border rounded-md bg-background"
              />
            </div>
          </>
        )}
      </div>

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatsCard title="Total Work Orders" value={data.totalCount} color="blue" />
            <StatsCard title="Open" value={data.openCount} color="orange" />
            <StatsCard title="Completed" value={data.completedCount} color="green" />
            <StatsCard title="Cancelled" value={data.cancelledCount} color="red" />
            <StatsCard
              title="Overdue"
              value="Unavailable"
              description="Work orders have no due-date/SLA field in this data model, so overdue cannot be truthfully derived."
              color="yellow"
            />
            <StatsCard title="Total Cost" value={formatCurrency(data.totalCost)} color="purple" />
            <StatsCard
              title="Avg Turnaround"
              value={data.turnaround.averageHours != null ? `${data.turnaround.averageHours.toFixed(1)}h` : 'Unavailable'}
              description={
                data.turnaround.averageHours != null
                  ? turnaroundCoverageNote
                  : 'No completed work orders with a recorded completion time in range.'
              }
              color="indigo"
            />
            <StatsCard
              title="Assigned / Unassigned"
              value={`${data.assignedCount} / ${data.unassignedCount}`}
              color="pink"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <WorkOrderBarChart
              title="Work Orders by Status"
              data={statusChartData}
              isLoading={false}
              emptyMessage="No work orders in range."
              restrictedMessage="Restricted -- you do not have permission to view work order data."
              highlightNames={[WORK_ORDER_STATUS_LABELS.cancelled]}
              onBarClick={(entry) => router.push(WORKORDER_ROUTES.byStatus(entry.filterValue ?? entry.name))}
              exportFilenamePrefix="work-orders-by-status"
              exportColumnLabel="Status"
            />
            <WorkOrderBarChart
              title="Work Orders by Priority"
              data={priorityChartData}
              isLoading={false}
              emptyMessage="No work orders in range."
              restrictedMessage="Restricted -- you do not have permission to view work order data."
              highlightNames={[PRIORITY_LABELS.critical]}
              onBarClick={(entry) => router.push(WORKORDER_ROUTES.byPriority(entry.filterValue ?? entry.name))}
              exportFilenamePrefix="work-orders-by-priority"
              exportColumnLabel="Priority"
            />
          </div>

          <div className="grid grid-cols-1 gap-6">
            <WorkOrderBarChart
              title="Work Orders by Workshop"
              data={workshopChartData}
              isLoading={false}
              emptyMessage="No work orders in range."
              restrictedMessage="Restricted -- you do not have permission to view work order data."
              exportFilenamePrefix="work-orders-by-workshop"
              exportColumnLabel="Workshop"
            />
          </div>
        </>
      )}

      <div className="flex flex-wrap gap-4 text-sm">
        <Link href={`${REPORTS_ROUTES.builder.new}?dataSource=workorders`} className="text-primary hover:underline">
          Build a custom work order report
        </Link>
        <Link href={WORKORDER_ROUTES.list} className="text-primary hover:underline">
          View all work orders
        </Link>
      </div>
    </div>
  );
}

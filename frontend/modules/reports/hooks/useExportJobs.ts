// frontend/modules/reports/hooks/useExportJobs.ts
//
// Paginated execution history for the Export Center. Polls while any
// tracked execution is still pending/processing so status flips to
// completed/failed without a manual refresh.
//
// FIX (Critical — same _id/id mismatch as useSavedReports.ts): raw items
// from reportExecutionsApi.list() only have `_id` (see ReportExecution in
// frontend/modules/reports/types/index.ts), but ReportExecutionLike
// declared `id: string` and nothing normalized it. Every execution.id in
// ExportJobsTable was undefined -> duplicate/missing React keys, broken
// downloads (download(undefined, ...)), and activeIds.includes(execution.id)
// never matching a real tracked id (since exportStore tracks the true
// _id returned by generate()), so the "stop polling on terminal status"
// effect could never find its row.

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportExecutionsApi } from '../services/reports.api';
import { exportExecutionKeys } from './useExportReport';
import { useActiveExportExecutionIds } from '../store/exportStore';
import type { ExecutionStatus } from '../utils/exportFormatters';

const POLL_INTERVAL_MS = 4000;
const PAGE_SIZE = 20;

interface ReportExecutionLike {
  id: string;
  status: ExecutionStatus;
  format: string;
  fileName?: string;
  fileSizeBytes?: number;
  createdAt: string;
  completedAt?: string;
  reportDefinitionId: string;
  reportName?: string;
  error?: string;
}

function withId<T extends { _id?: string; id?: string }>(item: T): T & { id: string } {
  return { ...item, id: item.id ?? item._id ?? '' };
}

export function useExportJobs() {
  const [page, setPage] = useState(1);
  const activeIds = useActiveExportExecutionIds();

  const jobsQuery = useQuery({
    queryKey: exportExecutionKeys.list(page, PAGE_SIZE),
    queryFn: () => reportExecutionsApi.list(page, PAGE_SIZE),
    refetchInterval: activeIds.length > 0 ? POLL_INTERVAL_MS : false,
  });

  const rawExecutions = ((jobsQuery.data as { items?: unknown[]; data?: unknown[] } | undefined)
    ?.items ??
    (jobsQuery.data as { data?: unknown[] } | undefined)?.data ??
    []) as Array<Record<string, unknown>>;

  const executions = rawExecutions.map((e) =>
    withId(e as { _id?: string; id?: string }),
  ) as unknown as ReportExecutionLike[];

  const totalPages = Math.max(
    1,
    Math.ceil(
      (((jobsQuery.data as { total?: number; totalCount?: number } | undefined)?.total ??
        (jobsQuery.data as { totalCount?: number } | undefined)?.totalCount ??
        executions.length) as number) / PAGE_SIZE,
    ),
  );

  return {
    executions,
    isLoading: jobsQuery.isLoading,
    isError: jobsQuery.isError,
    error: jobsQuery.error,
    page,
    totalPages,
    goToPage: setPage,
    refetch: jobsQuery.refetch,
  };
}
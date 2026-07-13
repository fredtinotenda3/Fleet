// frontend/modules/reports/hooks/useExportJobs.ts
//
// Paginated execution history for the Export Center. Polls while any
// tracked execution is still pending/processing so status flips to
// completed/failed without a manual refresh.

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

export function useExportJobs() {
  const [page, setPage] = useState(1);
  const activeIds = useActiveExportExecutionIds();

  const jobsQuery = useQuery({
    queryKey: exportExecutionKeys.list(page, PAGE_SIZE),
    queryFn: () => reportExecutionsApi.list(page, PAGE_SIZE),
    refetchInterval: activeIds.length > 0 ? POLL_INTERVAL_MS : false,
  });

  const executions = ((jobsQuery.data as { items?: ReportExecutionLike[]; data?: ReportExecutionLike[] } | undefined)
    ?.items ??
    (jobsQuery.data as { data?: ReportExecutionLike[] } | undefined)?.data ??
    []) as ReportExecutionLike[];

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
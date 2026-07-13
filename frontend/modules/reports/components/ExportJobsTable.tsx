// frontend/modules/reports/components/ExportJobsTable.tsx
//
// Renders the execution history backing the Export Center. Data and polling
// come from useExportJobs (poll-while-pending is handled there via
// exportStore's active-id set); this component's only extra job is to drop
// executions from that active set once they reach a terminal status, so
// polling naturally stops.

'use client';

import { useEffect } from 'react';
import { Download, RefreshCw, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { useExportJobs } from '../hooks/useExportJobs';
import { useActiveExportExecutionIds, exportStore } from '../store/exportStore';
import { reportExecutionsApi } from '../services/reports.api';
import { buildExportFileName, formatFileSize } from '../utils/exportFormatters';
import { EXPORT_FORMAT_LABELS, type ExportFormat } from '../schemas/exportConfig';
import { ExportJobStatusBadge } from './ExportJobStatusBadge';
import { LoadingState } from '@/shared/ui/feedback/LoadingState';

export function ExportJobsTable() {
  const { executions, isLoading, isError, error, page, totalPages, goToPage, refetch } = useExportJobs();
  const activeIds = useActiveExportExecutionIds();

  // Stop polling for anything that has reached a terminal state.
  useEffect(() => {
    executions.forEach((execution) => {
      if (activeIds.includes(execution.id) && (execution.status === 'completed' || execution.status === 'failed')) {
        exportStore.untrackExecution(execution.id);
      }
    });
  }, [executions, activeIds]);

  async function handleDownload(executionId: string, reportName: string, format: string, createdAt: string) {
    const fileName = buildExportFileName(reportName, format as ExportFormat, new Date(createdAt));
    try {
      await reportExecutionsApi.download(executionId, fileName);
    } catch (err) {
      console.error('[ExportJobsTable] Download failed:', err);
    }
  }

  if (isLoading) {
    return <LoadingState />;
  }

  if (isError) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm border rounded-md border-destructive/30 bg-destructive/5 text-destructive">
        <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span>Couldn&apos;t load export history{error instanceof Error ? `: ${error.message}` : '.'}</span>
        <button
          type="button"
          onClick={() => refetch()}
          className="inline-flex items-center gap-1 px-2 py-1 ml-auto text-xs font-medium border rounded-md hover:bg-muted"
        >
          <RefreshCw className="w-3 h-3" aria-hidden="true" />
          Retry
        </button>
      </div>
    );
  }

  if (executions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 py-12 text-center border border-dashed rounded-md">
        <p className="text-sm font-medium">No exports yet</p>
        <p className="text-xs text-muted-foreground">Exports you generate from a saved report will show up here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto border rounded-md">
        <table className="w-full text-sm">
          <thead className="text-xs tracking-wide uppercase bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium">Report</th>
              <th className="px-4 py-2.5 text-left font-medium">Format</th>
              <th className="px-4 py-2.5 text-left font-medium">Status</th>
              <th className="px-4 py-2.5 text-left font-medium">Size</th>
              <th className="px-4 py-2.5 text-left font-medium">Created</th>
              <th className="px-4 py-2.5 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {executions.map((execution) => (
              <tr key={execution.id} className="hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">{execution.reportName ?? 'Untitled report'}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {EXPORT_FORMAT_LABELS[execution.format as ExportFormat] ?? execution.format}
                </td>
                <td className="px-4 py-3">
                  <ExportJobStatusBadge status={execution.status} />
                  {execution.status === 'failed' && execution.error && (
                    <p className="max-w-xs mt-1 text-xs truncate text-destructive" title={execution.error}>
                      {execution.error}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {execution.fileSizeBytes ? formatFileSize(execution.fileSizeBytes) : '—'}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(execution.createdAt).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right">
                  {execution.status === 'completed' ? (
                    <button
                      type="button"
                      onClick={() =>
                        handleDownload(
                          execution.id,
                          execution.reportName ?? 'report',
                          execution.format,
                          execution.createdAt,
                        )
                      }
                      className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
                    >
                      <Download className="h-3.5 w-3.5" aria-hidden="true" />
                      Download
                    </button>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => goToPage(page - 1)}
              className="inline-flex items-center gap-1 px-2 py-1 font-medium border rounded-md disabled:cursor-not-allowed disabled:opacity-40 hover:bg-muted"
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => goToPage(page + 1)}
              className="inline-flex items-center gap-1 px-2 py-1 font-medium border rounded-md disabled:cursor-not-allowed disabled:opacity-40 hover:bg-muted"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
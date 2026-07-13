// frontend/modules/reports/hooks/useExportReport.ts
//
// Kicks off a report export via reportExecutionsApi.generate (which respects
// the report definition's saved filters/sort/grouping/org scope server-side
// in report-execution.service.ts), tracks it in exportStore for immediate
// UI feedback, and downloads the resulting file once ready.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { reportExecutionsApi } from '../services/reports.api';
import type { ExportConfig } from '../schemas/exportConfig';
import { buildExportFileName } from '../utils/exportFormatters';
import { exportStore } from '../store/exportStore';

export const exportExecutionKeys = {
  all: ['reports', 'executions'] as const,
  list: (page: number, limit: number) => [...exportExecutionKeys.all, 'list', page, limit] as const,
};

export function useExportReport() {
  const queryClient = useQueryClient();

  const generateMutation = useMutation({
    mutationFn: (config: ExportConfig) =>
      reportExecutionsApi.generate({
        reportDefinitionId: config.reportDefinitionId,
        format: config.format,
        includeCharts: config.includeCharts,
      } as never),
    onSuccess: (execution) => {
      const id = (execution as { id?: string; _id?: string }).id ?? (execution as { _id?: string })._id;
      if (id) exportStore.trackExecution(id);
      queryClient.invalidateQueries({ queryKey: exportExecutionKeys.all });
    },
  });

  const downloadMutation = useMutation({
    mutationFn: async ({
      executionId,
      reportName,
      format,
    }: {
      executionId: string;
      reportName: string;
      format: ExportConfig['format'];
    }) => {
      await reportExecutionsApi.download(executionId, buildExportFileName(reportName, format));
      exportStore.untrackExecution(executionId);
    },
  });

  return {
    generate: generateMutation.mutateAsync,
    isGenerating: generateMutation.isPending,
    generateError: generateMutation.error,
    download: downloadMutation.mutateAsync,
    isDownloading: downloadMutation.isPending,
    downloadError: downloadMutation.error,
  };
}
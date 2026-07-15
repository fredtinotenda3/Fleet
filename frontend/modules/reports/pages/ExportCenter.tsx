// frontend/modules/reports/pages/ExportCenter.tsx
//
// Entry point for /reports/exports. Lets a user pick one of their saved
// report definitions, choose an export format, and kick off a generation
// job via useExportReport() -> reportExecutionsApi.generate (which runs the
// report's saved filters/sort/grouping/org scope server-side in
// report-execution.service.ts - nothing here bypasses that). The execution
// history table below (ExportJobsTable) polls until pending jobs complete
// and offers a direct download link, matching the same
// reportExecutionsApi.download flow used everywhere else in the module.

'use client';

import { useState, type FormEvent } from 'react';
import { Download } from 'lucide-react';
import { useSavedReports } from '../hooks/useSavedReports';
import { useExportReport } from '../hooks/useExportReport';
import { ExportJobsTable } from '../components/ExportJobsTable';
import { EXPORT_FORMATS, EXPORT_FORMAT_LABELS, type ExportFormat } from '../schemas/exportConfig';
import { LoadingState } from '@/shared/ui/feedback/LoadingState';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';

export default function ExportCenter() {
  const { reports, isLoading, isError } = useSavedReports();
  const { generate, isGenerating, generateError } = useExportReport();

  const [reportId, setReportId] = useState('');
  const [format, setFormat] = useState<ExportFormat>('excel');
  const [includeCharts, setIncludeCharts] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  async function handleGenerate(event: FormEvent) {
    event.preventDefault();
    if (!reportId) return;

    setConfirmation(null);
    try {
      await generate({ reportDefinitionId: reportId, format, includeCharts });
      setConfirmation('Export started. It will appear in the history below once it finishes generating.');
    } catch {
      // generateError below already surfaces the failure to the user.
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Export Center</h1>
        <p className="text-sm text-muted-foreground">
          Generate a report as CSV, Excel, PDF, Word, or JSON, and track every export you&apos;ve run.
        </p>
      </div>

      <section className="p-4 border rounded-lg sm:p-6">
        <h2 className="mb-4 text-sm font-medium">New export</h2>

        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <EmptyState title="Couldn't load your saved reports" description="Please try again." />
        ) : reports.length === 0 ? (
          <EmptyState
            title="No saved reports yet"
            description="Build and save a report in the Report Builder first, then come back here to export it."
          />
        ) : (
          <form onSubmit={handleGenerate} className="flex flex-wrap items-end gap-3">
            <div className="min-w-50 flex-1">
              <label htmlFor="export-report" className="block mb-1 text-sm font-medium">
                Report
              </label>
              <select
                id="export-report"
                value={reportId}
                onChange={(e) => setReportId(e.target.value)}
                required
                className="w-full px-3 py-2 text-sm border rounded-md bg-background"
              >
                <option value="" disabled>
                  Choose a report&hellip;
                </option>
                {reports.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="export-format" className="block mb-1 text-sm font-medium">
                Format
              </label>
              <select
                id="export-format"
                value={format}
                onChange={(e) => setFormat(e.target.value as ExportFormat)}
                className="px-3 py-2 text-sm border rounded-md bg-background"
              >
                {EXPORT_FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {EXPORT_FORMAT_LABELS[f]}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-2 pb-2 text-sm whitespace-nowrap">
              <input
                type="checkbox"
                checked={includeCharts}
                onChange={(e) => setIncludeCharts(e.target.checked)}
                className="w-4 h-4 rounded border-input"
              />
              Include charts
            </label>

            <button
              type="submit"
              disabled={isGenerating || !reportId}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              {isGenerating ? 'Starting\u2026' : 'Generate export'}
            </button>
          </form>
        )}

        {confirmation && (
          <p className="mt-3 text-sm text-green-600 dark:text-green-400" role="status">
            {confirmation}
          </p>
        )}
        {generateError && (
          <p className="mt-3 text-sm text-destructive" role="alert">
            {generateError instanceof Error ? generateError.message : 'Failed to start the export. Please try again.'}
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium">Export history</h2>
        <ExportJobsTable />
      </section>
    </div>
  );
}
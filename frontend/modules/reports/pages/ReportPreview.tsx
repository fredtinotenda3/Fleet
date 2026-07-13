// frontend/modules/reports/pages/ReportPreview.tsx
//
// Runs a saved report definition and shows its live result, independent of
// the builder flow - this is the "open a saved report" experience, with
// drilldown into aggregated rows and a shortcut into Export Center.

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Download, Pencil } from 'lucide-react';
import { reportDefinitionsApi } from '../services/reports.api';
import { ReportPreviewPanel } from '../components/ReportPreviewPanel';
import { savedReportsStore } from '../store/savedReportsStore';
import { REPORTS_ROUTES } from '../routes';
import { LoadingState } from '@/shared/ui/feedback/LoadingState';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import type { ReportResult, PivotResult } from '../types';

interface ReportPreviewPageProps {
  reportId: string;
}

export default function ReportPreview({ reportId }: ReportPreviewPageProps) {
  const [drilldownRows, setDrilldownRows] = useState<Record<string, unknown>[] | null>(null);

  useEffect(() => {
    savedReportsStore.markRecentlyViewed(reportId);
  }, [reportId]);

  const definitionQuery = useQuery({
    queryKey: ['reports', 'definitions', 'detail', reportId],
    queryFn: () => reportDefinitionsApi.get(reportId),
  });

  const isPivot = !!(definitionQuery.data as { pivot?: unknown } | undefined)?.pivot;

  const previewQuery = useQuery({
    queryKey: ['reports', 'definitions', reportId, 'preview', isPivot],
    // Explicitly cast to a single Promise resolving to a union to satisfy useQuery typings
    queryFn: () => 
      (isPivot 
        ? reportDefinitionsApi.previewPivot(reportId) 
        : reportDefinitionsApi.preview(reportId)) as Promise<ReportResult | PivotResult>,
    enabled: !!definitionQuery.data,
  });

  async function handleRowClick(row: Record<string, unknown>) {
    if (!definitionQuery.data) return;
    
    // Cast through unknown to safely handle the ReportGroupBy objects vs strings mismatch
    const defData = definitionQuery.data as unknown as { groupBy?: Array<string | { field: string }> };
    const groupBy = defData.groupBy ?? [];
    
    if (groupBy.length === 0) return;
    
    const groupValues: Record<string, unknown> = {};
    for (const item of groupBy) {
      const field = typeof item === 'string' ? item : item.field;
      groupValues[field] = row[field];
    }
    
    const result = await reportDefinitionsApi.drilldown(reportId, groupValues);
    setDrilldownRows((result as { rows?: Record<string, unknown>[] }).rows ?? []);
  }

  if (definitionQuery.isLoading) return <LoadingState />;
  
  if (definitionQuery.isError || !definitionQuery.data) {
    return <EmptyState title="Report not found" description="It may have been deleted or you may not have access." />;
  }

  const definition = definitionQuery.data as { name: string; description?: string; columns?: Array<{ field: string; label: string; visible?: boolean; dataType?: string }> };
  const columns = (definition.columns ?? []).map((c) => ({
    id: c.field,
    field: c.field,
    label: c.label,
    dataSource: '',
    dataType: (c.dataType ?? 'string') as 'string' | 'number' | 'currency' | 'percent' | 'date' | 'boolean',
    aggregation: 'none' as const,
    visible: c.visible !== false,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Link href={REPORTS_ROUTES.builder.root} className="rounded-md p-1.5 hover:bg-accent" aria-label="Back">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{definition.name}</h1>
            {definition.description && <p className="text-sm text-muted-foreground">{definition.description}</p>}
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            href={REPORTS_ROUTES.builder.edit(reportId)}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent"
          >
            <Pencil className="w-4 h-4" /> Edit
          </Link>
          <Link
            href={`${REPORTS_ROUTES.exports}?reportId=${reportId}`}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Download className="w-4 h-4" /> Export
          </Link>
        </div>
      </div>

      <ReportPreviewPanel
        columns={columns}
        isPivot={isPivot}
        result={previewQuery.data as never}
        isLoading={previewQuery.isLoading}
        isError={previewQuery.isError}
        onRowClick={handleRowClick}
      />

      {drilldownRows && (
        <section>
          <h2 className="mb-2 text-sm font-medium">Detail rows</h2>
          <ReportPreviewPanel
            columns={columns}
            isPivot={false}
            result={{ rows: drilldownRows, totalCount: drilldownRows.length }}
            isLoading={false}
            isError={false}
          />
        </section>
      )}
    </div>
  );
}
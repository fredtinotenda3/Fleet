// frontend/modules/reports/pages/ReportBuilder.tsx

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useReportBuilder } from '../hooks/useReportBuilder';
import { useReportPreview } from '../hooks/useReportPreview';
import { reportBuilderStore } from '../store/reportBuilderStore';
import { BuilderLayout } from '../components/BuilderLayout';
import { ColumnPicker } from '../components/ColumnPicker';
import { FilterBuilder } from '../components/FilterBuilder';
import { GroupBySelector } from '../components/GroupBySelector';
import { SortControls } from '../components/SortControls';
import { ChartConfigurator } from '../components/ChartConfigurator';
import { ReportPreviewPanel } from '../components/ReportPreviewPanel';
import { SaveReportDialog } from '../components/SaveReportDialog';
import { ReportList } from '../components/ReportList';
import { REPORT_DATA_SOURCES } from '../schemas/reportDefinition';
import type { BuilderStep } from '../routes/builder';
import { REPORTS_ROUTES } from '../routes';
import { LoadingState } from '@/shared/ui/feedback/LoadingState';

const DATA_SOURCE_LABELS: Record<(typeof REPORT_DATA_SOURCES)[number], string> = {
  vehicles: 'Vehicles',
  trips: 'Trips',
  fuel: 'Fuel',
  maintenance: 'Maintenance',
  expenses: 'Expenses',
  organizations: 'Organizations',
};

interface ReportBuilderPageProps {
  reportId?: string;
}

export default function ReportBuilder({ reportId }: ReportBuilderPageProps) {
  const router = useRouter();
  const [step, setStep] = useState<BuilderStep>('columns');
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);

  const { form, isLoadingExisting, validationErrors, save, isSaving } = useReportBuilder(reportId);
  const preview = useReportPreview(form, reportId ?? null);

  if (isLoadingExisting) {
    return <LoadingState />;
  }

  async function handleSave(patch: { name: string; description?: string; isShared: boolean; tags: string[] }) {
    reportBuilderStore.setName(patch.name);
    reportBuilderStore.setDescription(patch.description ?? '');
    const result = await save();
    if (result?.id) {
      setSaveDialogOpen(false);
      router.push(REPORTS_ROUTES.builder.edit(result.id));
    }
  }

  // Determine if chart should be displayed in preview
  const showChart = form.chart.chartType !== 'none' && form.chart.chartXField && form.chart.chartYField;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {reportId ? `Edit report${form.name ? `: ${form.name}` : ''}` : 'New custom report'}
          </h1>
          <p className="text-sm text-muted-foreground">
            Pick columns, filters, and grouping to build exactly the report you need.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSaveDialogOpen(true)}
          className="px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:opacity-90"
        >
          {reportId ? 'Save changes' : 'Save report'}
        </button>
      </div>

      <BuilderLayout
        activeStep={step}
        onStepChange={setStep}
        sidebar={<ReportList />}
      >
        {step === 'columns' && (
          <div className="space-y-4">
            <div>
              <label htmlFor="data-source" className="block mb-1 text-sm font-medium">
                Data source
              </label>
              <select
                id="data-source"
                value={form.dataSource}
                onChange={(e) => reportBuilderStore.setDataSource(e.target.value as typeof form.dataSource)}
                className="w-full max-w-xs px-3 py-2 text-sm border rounded-md bg-background"
              >
                {REPORT_DATA_SOURCES.map((source) => (
                  <option key={source} value={source}>
                    {DATA_SOURCE_LABELS[source]}
                  </option>
                ))}
              </select>
            </div>
            <ColumnPicker
              dataSource={form.dataSource}
              columns={form.columns}
              onChange={(columns) => reportBuilderStore.setColumns(columns)}
            />
            {validationErrors.columns && <p className="text-xs text-destructive">{validationErrors.columns}</p>}
          </div>
        )}

        {step === 'filters' && (
          <FilterBuilder
            dataSource={form.dataSource}
            filters={form.filters}
            onChange={(filters) => reportBuilderStore.setFilters(filters)}
          />
        )}

        {step === 'groupBy' && (
          <GroupBySelector
            dataSource={form.dataSource}
            groupBy={form.groupBy}
            onChange={(groupBy) => reportBuilderStore.setGroupBy(groupBy)}
          />
        )}

        {step === 'sort' && (
          <SortControls
            columns={form.columns}
            sort={form.sort}
            onChange={(sort) => reportBuilderStore.setSort(sort)}
          />
        )}

        {step === 'chart' && (
          <ChartConfigurator
            columns={form.columns}
            config={form.chart}
            onChange={(chart) => reportBuilderStore.setChartConfig(chart)}
          />
        )}

        {step === 'preview' && (
          <div className="space-y-6">
            <ReportPreviewPanel
              columns={form.columns}
              isPivot={form.isPivot}
              result={preview.result as never}
              isLoading={preview.isLoading}
              isError={preview.isError}
            />
            {showChart && preview.result && !preview.isLoading && !preview.isError && (
              <div className="p-4 border rounded-lg">
                <h3 className="mb-3 text-sm font-medium">Chart Preview</h3>
                <ReportPreviewPanel
                  columns={form.columns}
                  isPivot={false}
                  result={preview.result as never}
                  isLoading={false}
                  isError={false}
                  chartConfig={{
                    type: form.chart.chartType as 'bar' | 'line' | 'pie',
                    xField: form.chart.chartXField!,
                    yField: form.chart.chartYField!,
                  }}
                />
              </div>
            )}
          </div>
        )}

        {step === 'save' && (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">Review the summary below, then save your report.</p>
            <dl className="grid grid-cols-2 gap-3 p-4 border rounded-md sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">Data source</dt>
                <dd className="font-medium">{DATA_SOURCE_LABELS[form.dataSource]}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Columns</dt>
                <dd className="font-medium">{form.columns.length}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Filters</dt>
                <dd className="font-medium">{form.filters.conditions.length}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Grouped by</dt>
                <dd className="font-medium">{form.groupBy.length || 'None'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Sort levels</dt>
                <dd className="font-medium">{form.sort.length || 'None'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Chart</dt>
                <dd className="font-medium">{form.chart.chartType === 'none' ? 'None' : form.chart.chartType}</dd>
              </div>
            </dl>
            <button
              type="button"
              onClick={() => setSaveDialogOpen(true)}
              className="px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:opacity-90"
            >
              Save report
            </button>
          </div>
        )}
      </BuilderLayout>

      <SaveReportDialog
        open={saveDialogOpen}
        form={form}
        isSaving={isSaving}
        errors={validationErrors}
        onClose={() => setSaveDialogOpen(false)}
        onSave={handleSave}
      />
    </div>
  );
}
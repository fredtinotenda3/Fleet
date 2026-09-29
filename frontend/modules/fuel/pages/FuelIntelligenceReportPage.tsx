// frontend/modules/fuel/pages/FuelIntelligenceReportPage.tsx
//
// UI for GET /api/fuel/monthly-intelligence-report (PART 5-8 backend,
// built in an earlier delivery). Follows this codebase's established
// patterns rather than introducing new ones: DataState for the load/
// error/permission machinery (frontend/shared/ui/patterns/DataState),
// isForbiddenError for the 403 branch (same helper ExecutiveDashboard
// and WorkOrderReports already use), and the same getBlob-then-
// downloadBlob download pattern as fuelApi.exportFile.

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, FileSpreadsheet, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Label } from '@/frontend/shared/ui/forms/label';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { DataState, ErrorState, describeQueryError } from '@/frontend/shared/ui/patterns';
import { isForbiddenError } from '@/shared/utils/api-client.utils';
import { formatDate } from '@/shared/utils/date.utils';
import {
  FleetPositionCards,
  WhatChangedSection,
  CostDriversSection,
  DriverFindingsSection,
  FuelTypeMixSection,
  AbnormalFindingsSection,
  AllocationReconciliationSection,
  DataQualitySection,
  FindingsSection,
} from '../components';
import { useFuelIntelligenceReport } from '../hooks/useFuelIntelligenceReport';
import { fuelIntelligenceApi } from '../services/fuelIntelligence.api';
import { FUEL_ROUTES } from '../routes';

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function FuelIntelligenceReportPage() {
  const router = useRouter();
  const [month, setMonth] = useState(currentMonth());
  const [downloading, setDownloading] = useState<'excel' | 'pdf' | null>(null);

  const { data: report, isLoading, isError, error, refetch } = useFuelIntelligenceReport(month);

  const restricted = isForbiddenError(error);

  async function handleDownload(format: 'excel' | 'pdf') {
    setDownloading(format);
    try {
      if (format === 'excel') {
        await fuelIntelligenceApi.downloadExcel(month);
      } else {
        await fuelIntelligenceApi.downloadPdf(month);
      }
      toast.success(`${format === 'excel' ? 'Excel workbook' : 'PDF report'} downloaded.`);
    } catch (err) {
      toast.error(`Failed to download the ${format === 'excel' ? 'Excel workbook' : 'PDF report'}.`, {
        description: describeQueryError(err),
      });
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Monthly fuel intelligence report"
        description="A management-ready story of the fleet's fuel position for the selected month -- what happened, what's driving it, and what needs attention. Every figure is labeled fact, calculated, estimated, or unavailable; nothing shown here is fabricated."
        breadcrumbs={[{ label: 'Fuel', href: FUEL_ROUTES.dashboard }, { label: 'Intelligence Report' }]}
        actions={
          <Button variant="outline" size="sm" onClick={() => router.push(FUEL_ROUTES.dashboard)}>
            <ArrowLeft className="h-3.5 w-3.5" /> Back to fuel
          </Button>
        }
      />

      <div className="flex flex-wrap items-end justify-between gap-4 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="report-month">Reporting month</Label>
          <input
            id="report-month"
            type="month"
            value={month}
            max={currentMonth()}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
            className="h-9 w-48 rounded-md border border-input bg-background px-3 text-body-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!report || downloading !== null}
            onClick={() => void handleDownload('excel')}
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            {downloading === 'excel' ? 'Downloading…' : 'Download Excel'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!report || downloading !== null}
            onClick={() => void handleDownload('pdf')}
          >
            <FileText className="h-3.5 w-3.5" />
            {downloading === 'pdf' ? 'Downloading…' : 'Download PDF'}
          </Button>
        </div>
      </div>

      <DataState
        isLoading={isLoading}
        isError={isError}
        loadingType="card"
        loadingCount={5}
        onRetry={refetch}
        error={
          restricted ? (
            <ErrorState
              variant="permission"
              size="page"
              description="Generating the Monthly Fuel Intelligence Report requires the analytics export permission. An organization administrator can grant it."
            />
          ) : (
            <ErrorState variant="error" size="page" detail={describeQueryError(error)} onRetry={refetch} />
          )
        }
      >
        {report && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2 text-caption text-muted-foreground">
              <Badge variant="outline">{report.period.label}</Badge>
              <span>Generated {formatDate(report.generatedAt, 'MMM d, yyyy \'at\' h:mm a')}</span>
              {report.dataQuality.truncated && (
                <Badge variant="outline" className="border-warning text-warning">Log set truncated for this assessment</Badge>
              )}
            </div>

            <FleetPositionCards fleetPosition={report.fleetPosition} />
            <WhatChangedSection whatChanged={report.whatChanged} currency={report.fleetPosition.currency} />
            <CostDriversSection costDrivers={report.costDrivers} currency={report.fleetPosition.currency} />
            <DriverFindingsSection driverFindings={report.driverFindings} currency={report.fleetPosition.currency} />
            <FuelTypeMixSection fuelTypeMix={report.fuelTypeMix} currency={report.fleetPosition.currency} />
            <AbnormalFindingsSection abnormalFindings={report.abnormalFindings} currency={report.fleetPosition.currency} />
            <AllocationReconciliationSection allocationReconciliation={report.allocationReconciliation} currency={report.fleetPosition.currency} />
            <DataQualitySection dataQuality={report.dataQuality} />
            <FindingsSection findings={report.findings} />
          </div>
        )}
      </DataState>
    </div>
  );
}

// frontend/modules/expenses/components/ExpenseIntelligenceReport/DataQualitySection.tsx
//
// Mirrors frontend/modules/fuel/components/FuelIntelligenceReport/DataQualitySection.tsx,
// adapted for `totalTransactionsInPeriod` (not `totalLogsInPeriod`) and
// "expense transaction" copy. This report's Data Quality section only
// ever has 2 metrics (missing category, suspected duplicates), not
// fuel's 3 -- see assessDataQuality's doc comment in
// expense-intelligence.utils.ts for why -- but this component makes no
// assumption about the count; it renders whatever `metrics` it's given.

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/frontend/shared/ui/data-display/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/frontend/shared/ui/data-display/table';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { formatLabeledNumber } from './LabeledValue';
import type { DataQualitySection as DataQualitySectionType } from '../../types';

interface DataQualitySectionProps {
  dataQuality: DataQualitySectionType;
}

const ASSESSMENT_BADGE: Record<string, { label: string; variant: 'secondary' | 'outline' | 'destructive' }> = {
  good: { label: 'Good', variant: 'secondary' },
  fair: { label: 'Fair', variant: 'outline' },
  poor: { label: 'Poor', variant: 'destructive' },
  insufficient_data: { label: 'Insufficient data', variant: 'outline' },
};

const SEVERITY_BADGE: Record<string, { variant: 'secondary' | 'outline' | 'destructive' }> = {
  info: { variant: 'outline' },
  attention: { variant: 'secondary' },
  urgent: { variant: 'destructive' },
};

export function DataQualitySection({ dataQuality }: DataQualitySectionProps) {
  const overall = ASSESSMENT_BADGE[dataQuality.overallAssessment];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Data quality</CardTitle>
          <Badge variant={overall.variant}>{overall.label}</Badge>
        </div>
        <CardDescription>
          {formatLabeledNumber(dataQuality.totalTransactionsInPeriod)} expense transaction{dataQuality.totalTransactionsInPeriod === 1 ? '' : 's'} assessed this period.
          {dataQuality.truncated && ' Note: this period’s transaction set was truncated for the assessment -- see the export for the full set.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {dataQuality.metrics.length === 0 ? (
          <p className="py-6 text-center text-body-sm text-muted-foreground">No expense transactions recorded for this period.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Check</TableHead>
                <TableHead>Affected</TableHead>
                <TableHead>Percent</TableHead>
                <TableHead>Severity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dataQuality.metrics.map((metric) => (
                <TableRow key={metric.label}>
                  <TableCell className="font-medium" title={metric.detail}>{metric.label}</TableCell>
                  <TableCell>{metric.affectedCount} of {metric.totalCount}</TableCell>
                  <TableCell>{formatLabeledNumber(metric.percent, { maximumFractionDigits: 1 })}%</TableCell>
                  <TableCell><Badge variant={SEVERITY_BADGE[metric.severity].variant} className="capitalize">{metric.severity}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

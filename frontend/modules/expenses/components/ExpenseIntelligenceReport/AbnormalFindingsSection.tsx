// frontend/modules/expenses/components/ExpenseIntelligenceReport/AbnormalFindingsSection.tsx
//
// Adapted from frontend/modules/fuel/components/FuelIntelligenceReport/AbnormalFindingsSection.tsx.
// Fuel flags a single fill-up whose VOLUME is an abnormal multiple of
// that vehicle's own average; expenses have no volume dimension, so
// this section instead shows individual transactions whose AMOUNT is a
// statistical (z-score) outlier against their own category's mean/
// stddev for the period (see ExpenseRepository.getExpenseOutliers).

import { AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/frontend/shared/ui/data-display/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/frontend/shared/ui/data-display/table';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { formatDate } from '@/shared/utils/date.utils';
import { LabeledText, formatMoney } from './LabeledValue';
import type { AbnormalFindingsSection as AbnormalFindingsSectionType } from '../../types';

interface AbnormalFindingsSectionProps {
  abnormalFindings: AbnormalFindingsSectionType;
  currency: string;
}

export function AbnormalFindingsSection({ abnormalFindings, currency }: AbnormalFindingsSectionProps) {
  const { amountOutliers, outlierBasis, vehicleCostSpikes } = abnormalFindings;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <AlertTriangle className="size-4 text-warning" aria-hidden="true" />
          <CardTitle>Abnormal &amp; exceptions</CardTitle>
        </div>
        <CardDescription>{outlierBasis}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <h4 className="mb-2 text-body-sm font-medium">Transaction amount outliers</h4>
          {amountOutliers.length === 0 ? (
            <p className="text-body-sm text-muted-foreground">No abnormal transaction amounts detected this period.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>vs. category mean</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {amountOutliers.map((row) => (
                  <TableRow key={row._id}>
                    <TableCell className="font-medium">{row.license_plate}</TableCell>
                    <TableCell>{row.category}</TableCell>
                    <TableCell>{formatDate(row.date)}</TableCell>
                    <TableCell>{formatMoney(row.amount, currency)}</TableCell>
                    <TableCell>
                      <Badge variant="destructive" title={`Category mean ${formatMoney(row.categoryMean, currency)}, std. dev. ${formatMoney(row.categoryStdDev, currency)}`}>
                        {row.zScore.toFixed(1)}&sigma;
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {vehicleCostSpikes.length > 0 && (
          <div>
            <h4 className="mb-2 text-body-sm font-medium">Vehicle cost spikes (own-baseline)</h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Cost this period</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vehicleCostSpikes.map((row) => (
                  <TableRow key={row.license_plate}>
                    <TableCell className="font-medium">{row.license_plate}</TableCell>
                    <TableCell><LabeledText labeled={row.totalCost} format={(v) => formatMoney(v, currency)} /></TableCell>
                    <TableCell className="text-body-sm text-muted-foreground">{row.abnormalReason}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

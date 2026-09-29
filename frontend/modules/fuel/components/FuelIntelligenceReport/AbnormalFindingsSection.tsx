// frontend/modules/fuel/components/FuelIntelligenceReport/AbnormalFindingsSection.tsx

import { AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/frontend/shared/ui/data-display/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/frontend/shared/ui/data-display/table';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { formatDate } from '@/shared/utils/date.utils';
import { LabeledText, formatLabeledNumber, formatMoney } from './LabeledValue';
import type { AbnormalFindingsSection as AbnormalFindingsSectionType } from '../../types';

interface AbnormalFindingsSectionProps {
  abnormalFindings: AbnormalFindingsSectionType;
  currency: string;
}

export function AbnormalFindingsSection({ abnormalFindings, currency }: AbnormalFindingsSectionProps) {
  const { volumeAnomalies, volumeAnomalyBasis, vehicleCostSpikes } = abnormalFindings;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <AlertTriangle className="size-4 text-warning" aria-hidden="true" />
          <CardTitle>Abnormal &amp; exceptions</CardTitle>
        </div>
        <CardDescription>{volumeAnomalyBasis}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <h4 className="mb-2 text-body-sm font-medium">Single-fill volume anomalies</h4>
          {volumeAnomalies.length === 0 ? (
            <p className="text-body-sm text-muted-foreground">No abnormal single-fill volumes detected this period.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Volume</TableHead>
                  <TableHead>vs. own average</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {volumeAnomalies.map((event) => (
                  <TableRow key={event._id}>
                    <TableCell className="font-medium">{event.license_plate}</TableCell>
                    <TableCell>{formatDate(event.date)}</TableCell>
                    <TableCell>{formatLabeledNumber(event.volume, { maximumFractionDigits: 1 })} L</TableCell>
                    <TableCell>
                      <Badge variant="destructive">{event.anomalyScore.toFixed(1)}x threshold ({event.threshold}x)</Badge>
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

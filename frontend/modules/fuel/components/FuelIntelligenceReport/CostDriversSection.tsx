// frontend/modules/fuel/components/FuelIntelligenceReport/CostDriversSection.tsx
//
// Renders classification exactly as PART 7-F distinguishes it: HIGH
// COST is a ranking (top-N by cost this period), ABNORMAL COST is a
// change (a spike vs. that vehicle's own prior-period baseline). A
// vehicle can be both; the backend already resolves that to
// 'abnormal_cost' for display (see classifyCostDrivers in
// fuel-intelligence.utils.ts) -- this component only renders the
// classification it's given, it never re-derives one.

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/frontend/shared/ui/data-display/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/frontend/shared/ui/data-display/table';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { LabeledText, formatLabeledNumber, formatMoney } from './LabeledValue';
import type { CostDriverSection as CostDriverSectionType } from '../../types';

interface CostDriversSectionProps {
  costDrivers: CostDriverSectionType;
  currency: string;
}

const CLASSIFICATION_BADGE: Record<string, { label: string; variant: 'destructive' | 'secondary' | 'outline' }> = {
  abnormal_cost: { label: 'Abnormal cost', variant: 'destructive' },
  high_cost: { label: 'High cost', variant: 'secondary' },
  normal: { label: 'Normal', variant: 'outline' },
};

export function CostDriversSection({ costDrivers, currency }: CostDriversSectionProps) {
  const concentration = costDrivers.topVehicleConcentration;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cost drivers by vehicle</CardTitle>
        <CardDescription>
          &ldquo;High cost&rdquo; ranks a vehicle among the most expensive this period &mdash; not necessarily a
          problem. &ldquo;Abnormal cost&rdquo; flags a sharp increase against that vehicle&rsquo;s{' '}
          <span className="font-medium text-foreground">own</span> prior-period baseline, and takes precedence when
          a vehicle is both.
          {concentration.status !== 'UNAVAILABLE' && concentration.value && (
            <>
              {' '}The top {concentration.value.vehicleCount} vehicle
              {concentration.value.vehicleCount === 1 ? '' : 's'} account for{' '}
              {formatLabeledNumber(concentration.value.costSharePercent, { maximumFractionDigits: 1 })}% of total
              fleet fuel cost this period.
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {costDrivers.rows.length === 0 ? (
          <p className="py-6 text-center text-body-sm text-muted-foreground">No vehicle fuel activity recorded for this period.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vehicle</TableHead>
                <TableHead>Classification</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Litres</TableHead>
                <TableHead>Share of fleet cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {costDrivers.rows.map((row) => {
                const badge = CLASSIFICATION_BADGE[row.classification];
                return (
                  <TableRow key={row.license_plate}>
                    <TableCell className="font-medium">{row.license_plate}</TableCell>
                    <TableCell>
                      <Badge variant={badge.variant} title={row.abnormalReason}>{badge.label}</Badge>
                    </TableCell>
                    <TableCell><LabeledText labeled={row.totalCost} format={(v) => formatMoney(v, currency)} /></TableCell>
                    <TableCell><LabeledText labeled={row.totalLitres} format={(v) => `${formatLabeledNumber(v, { maximumFractionDigits: 1 })} L`} /></TableCell>
                    <TableCell><LabeledText labeled={row.shareOfFleetCostPercent} format={(v) => `${formatLabeledNumber(v, { maximumFractionDigits: 1 })}%`} /></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

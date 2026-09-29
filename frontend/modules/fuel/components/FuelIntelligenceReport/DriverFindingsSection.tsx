// frontend/modules/fuel/components/FuelIntelligenceReport/DriverFindingsSection.tsx
//
// Attribution here is transaction-time (who fuelled the vehicle on
// that date, per FuelLog.driver_id), deliberately independent of the
// vehicle's current assigned driver (PART 4). `attributionNote` comes
// straight from the backend so this explanation can never drift out
// of sync with the actual attribution logic.

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/frontend/shared/ui/data-display/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/frontend/shared/ui/data-display/table';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { formatCurrency } from '@/shared/utils/currency.utils';
import { LabeledText, formatLabeledNumber } from './LabeledValue';
import type { DriverFindingsSection as DriverFindingsSectionType } from '../../types';

interface DriverFindingsSectionProps {
  driverFindings: DriverFindingsSectionType;
  currency: string;
}

export function DriverFindingsSection({ driverFindings, currency }: DriverFindingsSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Driver fuel intelligence</CardTitle>
        <CardDescription>{driverFindings.attributionNote}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {driverFindings.unassignedSharePercent.status !== 'UNAVAILABLE' && (
          <p className="text-body-sm">
            <span className="font-medium">Unassigned cost share: </span>
            <LabeledText labeled={driverFindings.unassignedSharePercent} format={(v) => `${formatLabeledNumber(v, { maximumFractionDigits: 1 })}%`} />
            {' '}(<LabeledText labeled={driverFindings.unassignedCost} format={(v) => formatCurrency(v, { currency })} />)
          </p>
        )}

        {driverFindings.rows.length === 0 ? (
          <p className="py-6 text-center text-body-sm text-muted-foreground">No driver fuel activity recorded for this period.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Driver</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Litres</TableHead>
                <TableHead>Fuel logs</TableHead>
                <TableHead>Vehicles fuelled</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {driverFindings.rows.map((row) => (
                <TableRow key={row.driver_id ?? 'unassigned'}>
                  <TableCell className="font-medium">
                    {row.driver_id === null ? (
                      <Badge variant="outline" className="border-warning text-warning">Unassigned / Unknown</Badge>
                    ) : (
                      row.driverName
                    )}
                  </TableCell>
                  <TableCell><LabeledText labeled={row.totalCost} format={(v) => formatCurrency(v, { currency })} /></TableCell>
                  <TableCell><LabeledText labeled={row.totalLitres} format={(v) => `${formatLabeledNumber(v, { maximumFractionDigits: 1 })} L`} /></TableCell>
                  <TableCell><LabeledText labeled={row.logCount} format={(v) => formatLabeledNumber(v)} /></TableCell>
                  <TableCell><LabeledText labeled={row.vehicleCount} format={(v) => formatLabeledNumber(v)} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

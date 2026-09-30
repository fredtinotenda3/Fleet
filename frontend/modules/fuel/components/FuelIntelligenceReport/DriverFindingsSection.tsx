// frontend/modules/fuel/components/FuelIntelligenceReport/DriverFindingsSection.tsx
//
// The driver rows and "Unassigned cost share (entry-time)" figure are
// transaction-time (who fuelled the vehicle on that date, per
// FuelLog.driver_id), deliberately independent of the vehicle's
// current assigned driver (PART 4) -- this is a permanent audit trail
// that a later Vehicle Hub reassignment must never rewrite.
//
// "Vehicle Hub coverage" below it is a second, independently-computed
// lens on the same period: the same Vehicle.currentDriverId resolution
// the Fuel Logs table and "Fuel cost by driver" chart use for display.
// It is shown side by side with the transaction-time figures, never
// merged into them -- the two will typically differ, often by a lot,
// because most historical fuel logs were never stamped with a
// driver_id at entry. Both `attributionNote` and `currentAssignmentNote`
// come straight from the backend so these explanations can never drift
// out of sync with the actual attribution logic.

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/frontend/shared/ui/data-display/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/frontend/shared/ui/data-display/table';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { LabeledText, formatLabeledNumber, formatMoney } from './LabeledValue';
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
            <span className="font-medium">Unassigned cost share (entry-time): </span>
            <LabeledText labeled={driverFindings.unassignedSharePercent} format={(v) => `${formatLabeledNumber(v, { maximumFractionDigits: 1 })}%`} />
            {' '}(<LabeledText labeled={driverFindings.unassignedCost} format={(v) => formatMoney(v, currency)} />)
          </p>
        )}

        {driverFindings.currentAssignmentUnassignedSharePercent.status !== 'UNAVAILABLE' && (
          <div className="rounded-md border border-border bg-muted/30 p-3">
            <p className="text-body-sm">
              <span className="font-medium">Vehicle Hub coverage: </span>
              <LabeledText labeled={driverFindings.currentAssignmentUnassignedSharePercent} format={(v) => `${formatLabeledNumber(v, { maximumFractionDigits: 1 })}%`} />
              {' '}of this period&rsquo;s fuel cost sits with a vehicle that currently has no driver assigned on the Hub{' '}
              (<LabeledText labeled={driverFindings.currentAssignmentUnassignedCost} format={(v) => formatMoney(v, currency)} />)
            </p>
            <p className="mt-1 text-caption text-muted-foreground">{driverFindings.currentAssignmentNote}</p>
          </div>
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
                  <TableCell><LabeledText labeled={row.totalCost} format={(v) => formatMoney(v, currency)} /></TableCell>
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

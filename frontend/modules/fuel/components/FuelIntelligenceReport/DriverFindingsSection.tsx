// frontend/modules/fuel/components/FuelIntelligenceReport/DriverFindingsSection.tsx
//
// Driver findings for the Monthly Fuel & Fleet Intelligence Report. Every
// figure is attributed via the Vehicle Operational Hub (each fuel log's
// vehicle's assigned driver) -- the same attribution the Fuel Logs table
// and "Fuel cost by driver" chart use, so the three can never disagree.
// `attributionNote` comes from the backend so the explanation cannot
// drift from the logic.

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
          <div className="space-y-1">
            <p className="text-body-sm">
              <span className="font-medium">Unassigned cost share: </span>
              <LabeledText labeled={driverFindings.unassignedSharePercent} format={(v) => `${formatLabeledNumber(v, { maximumFractionDigits: 1 })}%`} />
              {' '}(<LabeledText labeled={driverFindings.unassignedCost} format={(v) => formatMoney(v, currency)} />)
            </p>
            {driverFindings.unassignedVehiclePlates.length > 0 && (
              <p className="text-caption text-muted-foreground">
                No driver assigned on the Vehicle Hub: {driverFindings.unassignedVehiclePlates.join(', ')}
              </p>
            )}
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
                      <Badge variant="outline" className="border-warning text-warning">Unassigned</Badge>
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

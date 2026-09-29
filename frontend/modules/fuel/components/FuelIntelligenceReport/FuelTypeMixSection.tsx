// frontend/modules/fuel/components/FuelIntelligenceReport/FuelTypeMixSection.tsx

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/frontend/shared/ui/data-display/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/frontend/shared/ui/data-display/table';
import { LabeledText, formatLabeledNumber, formatMoney } from './LabeledValue';
import type { FuelTypeMixRow } from '../../types';

interface FuelTypeMixSectionProps {
  fuelTypeMix: FuelTypeMixRow[];
  currency: string;
}

export function FuelTypeMixSection({ fuelTypeMix, currency }: FuelTypeMixSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Fuel type mix</CardTitle>
        <CardDescription>Litres and cost by normalized fuel type &mdash; case variants of the same type (e.g. &ldquo;Diesel&rdquo;/&ldquo;diesel&rdquo;) are counted as one.</CardDescription>
      </CardHeader>
      <CardContent>
        {fuelTypeMix.length === 0 ? (
          <p className="py-6 text-center text-body-sm text-muted-foreground">No fuel logs recorded for this period.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fuel type</TableHead>
                <TableHead>Litres</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>% of fleet litres</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fuelTypeMix.map((row) => (
                <TableRow key={row.fuelType}>
                  <TableCell className="font-medium">{row.fuelType}</TableCell>
                  <TableCell><LabeledText labeled={row.litres} format={(v) => `${formatLabeledNumber(v, { maximumFractionDigits: 1 })} L`} /></TableCell>
                  <TableCell><LabeledText labeled={row.cost} format={(v) => formatMoney(v, currency)} /></TableCell>
                  <TableCell><LabeledText labeled={row.percentage} format={(v) => `${formatLabeledNumber(v, { maximumFractionDigits: 1 })}%`} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

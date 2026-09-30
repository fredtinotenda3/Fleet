// frontend/modules/expenses/components/ExpenseIntelligenceReport/CategoryMixSection.tsx
//
// The expense-side equivalent of
// frontend/modules/fuel/components/FuelIntelligenceReport/FuelTypeMixSection.tsx,
// grouping by expense category instead of fuel type. Unlike fuel's mix
// row, CategoryMixRow carries its own month-over-month change (see
// expense-intelligence.types.ts's header for why -- getExpenseCategorySummary
// already computes it server-side), so this table has one more column
// than fuel's equivalent.

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/frontend/shared/ui/data-display/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/frontend/shared/ui/data-display/table';
import { LabeledText, formatLabeledNumber, formatMoney } from './LabeledValue';
import type { CategoryMixRow } from '../../types';

interface CategoryMixSectionProps {
  categoryMix: CategoryMixRow[];
  currency: string;
}

export function CategoryMixSection({ categoryMix, currency }: CategoryMixSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Category mix</CardTitle>
        <CardDescription>Transaction count and cost by expense category, with month-over-month change per category.</CardDescription>
      </CardHeader>
      <CardContent>
        {categoryMix.length === 0 ? (
          <p className="py-6 text-center text-body-sm text-muted-foreground">No expense transactions recorded for this period.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Transactions</TableHead>
                <TableHead>% of fleet cost</TableHead>
                <TableHead>MoM change</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categoryMix.map((row) => (
                <TableRow key={row.category}>
                  <TableCell className="font-medium">{row.category}</TableCell>
                  <TableCell><LabeledText labeled={row.cost} format={(v) => formatMoney(v, currency)} /></TableCell>
                  <TableCell><LabeledText labeled={row.count} format={(v) => formatLabeledNumber(v)} /></TableCell>
                  <TableCell><LabeledText labeled={row.percentage} format={(v) => `${formatLabeledNumber(v, { maximumFractionDigits: 1 })}%`} /></TableCell>
                  <TableCell>
                    <LabeledText
                      labeled={row.momChangePercent}
                      format={(v) => `${v > 0 ? '+' : ''}${formatLabeledNumber(v, { maximumFractionDigits: 1 })}%`}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

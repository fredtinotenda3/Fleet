// frontend/modules/expenses/components/ExpenseIntelligenceReport/WhatChangedSection.tsx
//
// Mirrors frontend/modules/fuel/components/FuelIntelligenceReport/WhatChangedSection.tsx,
// with formatByUnit adapted to this report's units ("transactions",
// "currency/transaction", "vehicles", "% of fleet expense cost" --
// expenses have no "litres" unit).

import { ArrowUp, ArrowDown, Minus, CircleHelp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/frontend/shared/ui/data-display/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/frontend/shared/ui/data-display/table';
import { LabeledText, formatLabeledNumber, formatMoney } from './LabeledValue';
import type { WhatChangedSection as WhatChangedSectionType } from '../../types';

interface WhatChangedSectionProps {
  whatChanged: WhatChangedSectionType;
  currency: string;
}

const DIRECTION_ICON = {
  up: ArrowUp,
  down: ArrowDown,
  flat: Minus,
  unavailable: CircleHelp,
} as const;

const DIRECTION_TONE: Record<string, string> = {
  up: 'text-danger',
  down: 'text-success',
  flat: 'text-muted-foreground',
  unavailable: 'text-muted-foreground',
};

function formatByUnit(unit: string, currency: string) {
  return (value: number) => {
    if (unit === 'currency' || unit === 'currency/transaction') {
      const formatted = formatMoney(value, currency);
      return unit === 'currency/transaction' ? `${formatted}/txn` : formatted;
    }
    if (unit === '% of fleet expense cost') return `${formatLabeledNumber(value, { maximumFractionDigits: 1 })}%`;
    return formatLabeledNumber(value, { maximumFractionDigits: 1 });
  };
}

export function WhatChangedSection({ whatChanged, currency }: WhatChangedSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>What changed this period</CardTitle>
        <CardDescription>
          {whatChanged.hasComparisonPeriod
            ? `Compared against ${whatChanged.comparisonPeriodLabel}. Causes are only stated when another metric in this report moved the same direction -- never guessed.`
            : 'No prior comparable period is available in the data, so a month-over-month comparison could not be computed.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Metric</TableHead>
              <TableHead>This period</TableHead>
              <TableHead>Prior period</TableHead>
              <TableHead>Change</TableHead>
              <TableHead>Possible explanation</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {whatChanged.metrics.map((metric) => {
              const format = formatByUnit(metric.unit, currency);
              const Icon = DIRECTION_ICON[metric.direction];
              return (
                <TableRow key={metric.label}>
                  <TableCell className="font-medium">{metric.label}</TableCell>
                  <TableCell><LabeledText labeled={metric.current} format={format} /></TableCell>
                  <TableCell><LabeledText labeled={metric.previous} format={format} /></TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center gap-1 ${DIRECTION_TONE[metric.direction]}`}>
                      <Icon className="size-3.5" aria-hidden="true" />
                      <LabeledText labeled={metric.deltaPercent} format={(v) => `${v > 0 ? '+' : ''}${formatLabeledNumber(v, { maximumFractionDigits: 1 })}%`} />
                    </span>
                  </TableCell>
                  <TableCell className="max-w-xs text-body-sm text-muted-foreground">
                    <LabeledText labeled={metric.possibleExplanation} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

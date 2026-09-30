// frontend/modules/expenses/components/ExpenseIntelligenceReport/AllocationReconciliationSection.tsx
//
// Mirrors frontend/modules/fuel/components/FuelIntelligenceReport/AllocationReconciliationSection.tsx
// exactly -- same Allocation Ledger, different cost category ('expense'
// instead of 'fuel'). This component renders exactly what the backend
// computed and never derives a reconciled/not-reconciled verdict of
// its own.

import { CheckCircle2, XCircle, HelpCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/frontend/shared/ui/data-display/card';
import { MetricCardGrid } from '@/frontend/shared/ui/patterns';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { LabeledMetric, formatLabeledNumber, formatMoney } from './LabeledValue';
import type { AllocationReconciliationSection as AllocationReconciliationSectionType } from '../../types';

interface AllocationReconciliationSectionProps {
  allocationReconciliation: AllocationReconciliationSectionType;
  currency: string;
}

export function AllocationReconciliationSection({ allocationReconciliation, currency }: AllocationReconciliationSectionProps) {
  const { reconciled, note, variance, variancePercent, operationalTotal, ledgerTotal } = allocationReconciliation;

  const statusBadge =
    reconciled === true ? (
      <Badge variant="secondary" className="gap-1"><CheckCircle2 className="size-3" /> Reconciled</Badge>
    ) : reconciled === false ? (
      <Badge variant="destructive" className="gap-1"><XCircle className="size-3" /> Variance exceeds threshold</Badge>
    ) : (
      <Badge variant="outline" className="gap-1"><HelpCircle className="size-3" /> Not determinable</Badge>
    );

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Financial reconciliation</CardTitle>
          {statusBadge}
        </div>
        <CardDescription>{note}</CardDescription>
      </CardHeader>
      <CardContent>
        <MetricCardGrid columns={4}>
          <LabeledMetric label="Operational total" labeled={operationalTotal} format={(v) => formatMoney(v, currency)} />
          <LabeledMetric label="Allocation Ledger total" labeled={ledgerTotal} format={(v) => formatMoney(v, currency)} />
          <LabeledMetric label="Variance" labeled={variance} format={(v) => formatMoney(v, currency)} />
          <LabeledMetric label="Variance %" labeled={variancePercent} format={(v) => `${formatLabeledNumber(v, { maximumFractionDigits: 2 })}%`} />
        </MetricCardGrid>
      </CardContent>
    </Card>
  );
}

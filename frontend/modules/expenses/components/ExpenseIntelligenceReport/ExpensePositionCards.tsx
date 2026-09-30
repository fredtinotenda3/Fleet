// frontend/modules/expenses/components/ExpenseIntelligenceReport/ExpensePositionCards.tsx
//
// Mirrors frontend/modules/fuel/components/FuelIntelligenceReport/FleetPositionCards.tsx.
// One fewer card than fuel's (4, not 5) -- expenses have no volume/litres
// dimension, so there is no "avg. cost per litre" equivalent beyond
// averageCostPerTransaction, which already covers that role here.

import { Receipt, Hash, Truck, Calculator } from 'lucide-react';
import { MetricCardGrid } from '@/frontend/shared/ui/patterns';
import { LabeledMetric, formatLabeledNumber, formatMoney } from './LabeledValue';
import type { ExpensePositionSection } from '../../types';

interface ExpensePositionCardsProps {
  expensePosition: ExpensePositionSection;
}

export function ExpensePositionCards({ expensePosition }: ExpensePositionCardsProps) {
  const currency = expensePosition.currency;

  return (
    <MetricCardGrid columns={4}>
      <LabeledMetric
        label="Total expense cost"
        labeled={expensePosition.totalExpenseCost}
        format={(v) => formatMoney(v, currency)}
        icon={<Receipt />}
      />
      <LabeledMetric
        label="Transactions recorded"
        labeled={expensePosition.transactionCount}
        format={(v) => formatLabeledNumber(v)}
        icon={<Hash />}
      />
      <LabeledMetric
        label="Avg. cost per transaction"
        labeled={expensePosition.averageCostPerTransaction}
        format={(v) => formatMoney(v, currency)}
        icon={<Calculator />}
      />
      <LabeledMetric
        label="Vehicles with expenses"
        labeled={expensePosition.vehiclesWithExpenses}
        format={(v) => formatLabeledNumber(v)}
        icon={<Truck />}
      />
    </MetricCardGrid>
  );
}

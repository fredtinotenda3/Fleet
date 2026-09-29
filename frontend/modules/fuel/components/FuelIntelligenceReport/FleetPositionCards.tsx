// frontend/modules/fuel/components/FuelIntelligenceReport/FleetPositionCards.tsx

import { Fuel, Droplets, Receipt, Truck, Gauge } from 'lucide-react';
import { MetricCardGrid } from '@/frontend/shared/ui/patterns';
import { LabeledMetric, formatLabeledNumber, formatMoney } from './LabeledValue';
import type { FleetPositionSection } from '../../types';

interface FleetPositionCardsProps {
  fleetPosition: FleetPositionSection;
}

export function FleetPositionCards({ fleetPosition }: FleetPositionCardsProps) {
  const currency = fleetPosition.currency;

  return (
    <MetricCardGrid columns={5}>
      <LabeledMetric
        label="Total fuel cost"
        labeled={fleetPosition.totalFuelCost}
        format={(v) => formatMoney(v, currency)}
        icon={<Receipt />}
      />
      <LabeledMetric
        label="Total litres fuelled"
        labeled={fleetPosition.totalLitres}
        format={(v) => `${formatLabeledNumber(v, { maximumFractionDigits: 1 })} L`}
        icon={<Droplets />}
      />
      <LabeledMetric
        label="Avg. cost per litre"
        labeled={fleetPosition.averageCostPerLitre}
        format={(v) => formatMoney(v, currency, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
        icon={<Fuel />}
      />
      <LabeledMetric
        label="Fuel logs recorded"
        labeled={fleetPosition.logCount}
        format={(v) => formatLabeledNumber(v)}
        icon={<Gauge />}
      />
      <LabeledMetric
        label="Vehicles active"
        labeled={fleetPosition.vehiclesActive}
        format={(v) => formatLabeledNumber(v)}
        icon={<Truck />}
      />
    </MetricCardGrid>
  );
}

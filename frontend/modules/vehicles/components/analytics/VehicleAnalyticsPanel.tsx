// frontend/modules/vehicles/components/analytics/VehicleAnalyticsPanel.tsx
//
// Root of the Vehicle Detail page's "Analytics" tab -- mirrors the
// enterprise nav tree (Fleet > Vehicle > Analytics > Fuel/Expenses/
// Trips/Maintenance/...). Fuel, Expenses, and Trips are now fully
// wired; Maintenance remains a placeholder until its AnalyticsScope
// wiring lands, following the exact same reuse pattern used here.

'use client';

import { Fuel, Receipt, Route, Wrench } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/frontend/shared/ui/navigation/tabs';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { VehicleFuelAnalyticsPanel } from './VehicleFuelAnalyticsPanel';
import { VehicleExpenseAnalyticsPanel } from './VehicleExpenseAnalyticsPanel';
import { VehicleTripAnalyticsPanel } from './VehicleTripAnalyticsPanel';

interface VehicleAnalyticsPanelProps {
  licensePlate: string;
}

function ComingSoonPanel({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center surface-card">
      <p className="font-medium text-foreground">{label} analytics coming soon</p>
      <p className="text-sm text-muted-foreground">
        This vehicle&apos;s {label.toLowerCase()} analytics will reuse the same fleet-wide {label.toLowerCase()} components,
        scoped to this vehicle -- the same pattern already used for Fuel, Expenses, and Trips.
      </p>
    </div>
  );
}

export function VehicleAnalyticsPanel({ licensePlate }: VehicleAnalyticsPanelProps) {
  return (
    <Tabs defaultValue="fuel">
      <TabsList>
        <TabsTrigger value="fuel">
          <Fuel className="h-3.5 w-3.5" /> Fuel
        </TabsTrigger>
        <TabsTrigger value="expenses">
          <Receipt className="h-3.5 w-3.5" /> Expenses
        </TabsTrigger>
        <TabsTrigger value="trips">
          <Route className="h-3.5 w-3.5" /> Trips
        </TabsTrigger>
        <TabsTrigger value="maintenance" disabled>
          <Wrench className="h-3.5 w-3.5" /> Maintenance <Badge variant="outline" className="ml-1">Soon</Badge>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="fuel" className="mt-4">
        <VehicleFuelAnalyticsPanel licensePlate={licensePlate} />
      </TabsContent>
      <TabsContent value="expenses" className="mt-4">
        <VehicleExpenseAnalyticsPanel licensePlate={licensePlate} />
      </TabsContent>
      <TabsContent value="trips" className="mt-4">
        <VehicleTripAnalyticsPanel licensePlate={licensePlate} />
      </TabsContent>
      <TabsContent value="maintenance" className="mt-4">
        <ComingSoonPanel label="Maintenance" />
      </TabsContent>
    </Tabs>
  );
}
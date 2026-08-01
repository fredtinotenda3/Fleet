// frontend/modules/vehicles/components/analytics/VehicleAnalyticsPanel.tsx
//
// Root of the Vehicle Detail page's "Analytics" tab -- mirrors the
// enterprise nav tree (Fleet > Vehicle > Analytics > Fuel/Expenses/
// Trips/Maintenance/...). Fuel, Expenses, Trips, and Maintenance are now
// fully wired -- each tab composes the exact same fleet-wide chart
// components used on that module's own Analytics page, scoped to this
// vehicle via `licensePlate`, following the identical reuse pattern
// throughout: no vehicle-specific analytics engine exists anywhere in
// this file or its children.

'use client';

import { Fuel, Receipt, Route, Wrench } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/frontend/shared/ui/navigation/tabs';
import { VehicleFuelAnalyticsPanel } from './VehicleFuelAnalyticsPanel';
import { VehicleExpenseAnalyticsPanel } from './VehicleExpenseAnalyticsPanel';
import { VehicleTripAnalyticsPanel } from './VehicleTripAnalyticsPanel';
import { VehicleMaintenanceAnalyticsPanel } from './VehicleMaintenanceAnalyticsPanel';

interface VehicleAnalyticsPanelProps {
  licensePlate: string;
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
        <TabsTrigger value="maintenance">
          <Wrench className="h-3.5 w-3.5" /> Maintenance
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
        <VehicleMaintenanceAnalyticsPanel licensePlate={licensePlate} />
      </TabsContent>
    </Tabs>
  );
}
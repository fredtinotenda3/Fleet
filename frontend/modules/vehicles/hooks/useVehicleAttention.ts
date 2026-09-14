// frontend/modules/vehicles/hooks/useVehicleAttention.ts
//
// WAVE 1 PART 2, item 7: vehicle-scoped Needs-Attention feed for the
// Vehicle Detail page.
//
// Deliberately NOT built on useAttentionQueue/dashboardApi.getNeedsAttention
// (the fleet-wide feed) with a client-side `.filter(item => item.entityId
// === vehicleId)`. Three reasons that would be wrong, not just imprecise:
//
//   1. TRUNCATION: the fleet-wide feed is capped (the queue page requests
//      200, the dashboard widget 6). A vehicle whose items rank outside
//      that cap would silently show nothing here, indistinguishable from
//      "nothing pending" -- exactly the failure mode the platform's own
//      `unavailableSources`/truncation handling elsewhere exists to avoid.
//   2. AUTHORIZATION SHAPE: entityId's meaning varies by source (vehicle
//      _id for predictive_maintenance/fuel_fraud, absent for compliance/
//      maintenance -- see needs-attention.service.ts's readers). A naive
//      entityId match on the fleet-wide feed would miss compliance and
//      maintenance items for this vehicle entirely, while doing nothing to
//      stop a caller who can read the fleet-wide feed (ANALYTICS_VIEW) from
//      reconstructing any OTHER vehicle's items the same way.
//   3. SERVER-SIDE AUTHORIZATION: needsAttentionService.getFeedForVehicle
//      re-verifies (tenant + org-unit scope) that THIS caller may see THIS
//      vehicle before reading any source, and 404s otherwise -- see its own
//      header comment. Filtering a fleet-wide response in the browser could
//      never enforce that; it would only hide the rows, not deny the read.
//
// This hook calls the dedicated `?vehicleId=` branch of the same endpoint
// instead (see dashboardApi.getNeedsAttentionForVehicle), so the bounded,
// authorized query happens server-side, per the exact flow requested:
// Vehicle Detail -> server request with vehicle identifier -> authorization
// -> tenant/org-unit scope -> entity filter -> bounded database query ->
// response.

'use client';

import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/frontend/modules/dashboard/services/dashboard.api';

export const vehicleAttentionKeys = {
  all: ['vehicles', 'attention'] as const,
  feed: (vehicleId: string, limit: number) => [...vehicleAttentionKeys.all, vehicleId, limit] as const,
};

export function useVehicleNeedsAttention(vehicleId: string | undefined, limit = 50) {
  return useQuery({
    queryKey: vehicleAttentionKeys.feed(vehicleId ?? '', limit),
    queryFn: () => dashboardApi.getNeedsAttentionForVehicle(vehicleId as string, limit),
    enabled: Boolean(vehicleId),
    staleTime: 2 * 60_000,
    retry: 1,
  });
}

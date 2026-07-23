// frontend/modules/reports/hooks/useFleetHealthScore.ts
//
// Consumes the already-implemented /api/ai/fleet-health endpoint
// (modules/ai/controllers/ai.controller.ts -> fleetHealthService).
// This is the same backend AIReports.tsx already renders correctly --
// this hook just gives the Executive Dashboard a way to consume it too,
// instead of the hardcoded `75 : 65` heuristic.

import { useQuery } from '@tanstack/react-query';
import type { FleetHealthScore } from '@/modules/ai/types/ai.types';

export const fleetHealthKeys = {
  all: ['ai', 'fleet-health'] as const,
};

interface FleetHealthApiResponse {
  success: boolean;
  data: FleetHealthScore;
  error?: string;
}

async function fetchFleetHealth(): Promise<FleetHealthScore> {
  const res = await fetch('/api/ai/fleet-health', {
    method: 'GET',
    credentials: 'include',
  });

  if (!res.ok) {
    throw new Error(`Failed to load fleet health score (${res.status})`);
  }

  const body: FleetHealthApiResponse = await res.json();

  if (!body.success || !body.data) {
    throw new Error(body.error || 'Fleet health score unavailable');
  }

  return body.data;
}

/**
 * Fetches the real AI-computed fleet health score. Refetches every 10
 * minutes since the underlying calculation reads maintenance/expense/
 * trip/fuel data that doesn't change second-to-second.
 */
export function useFleetHealthScore() {
  return useQuery({
    queryKey: fleetHealthKeys.all,
    queryFn: fetchFleetHealth,
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
    retry: 1,
  });
}
// frontend/modules/telematics/hooks/useDemoMode.ts

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { telematicsApi } from '../services/telematics.api';
import { telematicsKeys } from './useLiveMap';

function errMsg(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/** GET /api/telematics/demo -- current per-tenant Demo Mode status. Any authenticated tenant member may read it. */
export function useDemoStatus() {
  return useQuery({
    queryKey: telematicsKeys.demoStatus(),
    queryFn: () => telematicsApi.getDemoStatus(),
    staleTime: 30_000,
  });
}

/** POST /api/telematics/demo -- toggles the whole tenant between real and simulated live-map data (requires VEHICLE_EDIT server-side). */
export function useSetDemoMode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => telematicsApi.setDemoStatus(enabled),
    onSuccess: (status) => {
      queryClient.setQueryData(telematicsKeys.demoStatus(), status);
      queryClient.invalidateQueries({ queryKey: telematicsKeys.liveMap() });
      toast.success(status.enabled ? 'Demo mode enabled' : 'Demo mode disabled');
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to update demo mode')),
  });
}

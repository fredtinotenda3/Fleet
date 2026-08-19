// frontend/modules/telematics/hooks/useEagleTrackConfig.ts
//
// Same shape as useCartrackConfig: a query, a save mutation that
// invalidates it, and a separate testConnection mutation kept apart
// because it has its own button and mutates no cached data -- it only
// reports connected/not for the credentials ALREADY persisted for the
// tenant, and does not see unsaved form edits.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { telematicsApi } from '../services/telematics.api';
import { telematicsKeys } from './useLiveMap';
import type { EagleTrackConfigInput } from '../types';

function errMsg(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/** GET /api/telematics/eagletrack/config -- gated ORG_SETTINGS server-side. */
export function useEagleTrackConfig() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: telematicsKeys.eagletrackConfig(),
    queryFn: () => telematicsApi.getEagleTrackConfig(),
    staleTime: 30_000,
    retry: 1,
  });

  const save = useMutation({
    mutationFn: (data: EagleTrackConfigInput) => telematicsApi.updateEagleTrackConfig(data),
    onSuccess: (status) => {
      queryClient.setQueryData(telematicsKeys.eagletrackConfig(), status);
      // A credential/domain/enabled change can flip what the live map
      // shows for this tenant's vehicles, so drop that cache too.
      queryClient.invalidateQueries({ queryKey: telematicsKeys.liveMap() });
      toast.success('Eagle Track configuration saved');
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to save Eagle Track configuration')),
  });

  const testConnection = useMutation({
    mutationFn: () => telematicsApi.testEagleTrackConnection(),
    onSuccess: (result) => {
      if (result.connected) toast.success('Connection successful');
      else toast.error('Connection failed — check the domain and API token.');
    },
    onError: (error) => toast.error(errMsg(error, 'Unable to reach Eagle Track')),
  });

  return { ...query, save, testConnection };
}

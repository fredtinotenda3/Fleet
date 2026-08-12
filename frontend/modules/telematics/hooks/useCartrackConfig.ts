// frontend/modules/telematics/hooks/useCartrackConfig.ts
//
// Follows the same shape as finance's useFinanceSettings (a query plus a
// save mutation that invalidates it) with one addition: a testConnection
// mutation, kept separate because it's triggered by its own button and
// doesn't mutate any cached data -- it only reports connected/not on the
// credentials already persisted for the tenant (see
// CartrackTestConnectionResult's doc comment: it does NOT see unsaved
// form edits).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { telematicsApi } from '../services/telematics.api';
import { telematicsKeys } from './useLiveMap';
import type { CartrackConfigInput } from '../types';

function errMsg(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/** GET /api/telematics/cartrack/config -- gated ORG_SETTINGS server-side. */
export function useCartrackConfig() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: telematicsKeys.cartrackConfig(),
    queryFn: () => telematicsApi.getCartrackConfig(),
    staleTime: 30_000,
    retry: 1,
  });

  const save = useMutation({
    mutationFn: (data: CartrackConfigInput) => telematicsApi.updateCartrackConfig(data),
    onSuccess: (status) => {
      queryClient.setQueryData(telematicsKeys.cartrackConfig(), status);
      // A credential/base-URL/enabled change can flip what the live map
      // shows (real Cartrack data vs. no data), so drop that cache too.
      queryClient.invalidateQueries({ queryKey: telematicsKeys.liveMap() });
      toast.success('Cartrack configuration saved');
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to save Cartrack configuration')),
  });

  const testConnection = useMutation({
    mutationFn: () => telematicsApi.testCartrackConnection(),
    onSuccess: (result) => {
      if (result.connected) toast.success('Connection successful');
      else toast.error('Connection failed — check the API URL and credentials.');
    },
    onError: (error) => toast.error(errMsg(error, 'Unable to reach Cartrack')),
  });

  return { ...query, save, testConnection };
}

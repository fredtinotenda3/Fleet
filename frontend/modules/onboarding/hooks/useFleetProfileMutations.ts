// frontend/modules/onboarding/hooks/useFleetProfileMutations.ts
//
// ADAPTIVE ONBOARDING / SETUP CENTRE -- write side of the telematics
// and distance-tracking steps' "secondary action" (declining GPS,
// declaring odometer posture), and of the Setup Centre's own
// finish/skip actions.
//
// Same shape as useOrganizationSettings's mutation hooks (that file's
// updateTaxSettings etc.): one useMutation per action, each invalidating
// `organizationKeys.lists()` on success -- the EXACT query key
// useSetupProgress's `organizations` query already holds, so completing
// any of these immediately resolves the corresponding checklist step on
// its next render with no extra request.

'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { organizationApi } from '@/frontend/modules/organizations/services/organization.api';
import { organizationKeys } from '@/frontend/modules/organizations/hooks/query-keys';
import type { FleetProfileUpdateInput } from '@/shared/validations/organization.settings-addendum.schema';

export function useFleetProfileMutations(organizationId: string | undefined) {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: organizationKeys.lists() });
    if (organizationId) {
      queryClient.invalidateQueries({ queryKey: organizationKeys.detail(organizationId) });
    }
  };

  const updateFleetProfile = useMutation({
    mutationFn: (data: FleetProfileUpdateInput) => {
      if (!organizationId) {
        return Promise.reject(new Error('No organization selected.'));
      }
      return organizationApi.updateFleetProfile(organizationId, data);
    },
    onSuccess: invalidate,
  });

  return {
    updateFleetProfile,
    declareNoGps: () => updateFleetProfile.mutateAsync({ operatesWithoutGps: true }),
    declareHasGps: () => updateFleetProfile.mutateAsync({ operatesWithoutGps: false }),
    declareNoOdometers: () => updateFleetProfile.mutateAsync({ operatesWithoutOdometers: true }),
    declareHasOdometers: () => updateFleetProfile.mutateAsync({ operatesWithoutOdometers: false }),
    completeSetup: () =>
      updateFleetProfile.mutateAsync({ setupCompletedAt: new Date().toISOString() }),
    skipSetup: () =>
      updateFleetProfile.mutateAsync({ setupDismissedAt: new Date().toISOString() }),
  };
}

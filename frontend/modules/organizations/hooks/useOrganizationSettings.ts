// frontend/modules/organizations/hooks/useOrganizationSettings.ts

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { organizationApi } from '../services';
import { organizationKeys } from './query-keys';
import type {
  GeneralInfoFormValues,
  BrandingFormValues,
  ContactDetailsFormValues,
  RegionalSettingsFormValues,
  BusinessHoursFormValues,
  TaxSettingsFormValues,
} from '../schemas';

export function useOrganizationSettings(organizationId: string) {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: organizationKeys.detail(organizationId) });
    queryClient.invalidateQueries({ queryKey: organizationKeys.lists() });
  };

  const updateGeneralInfo = useMutation({
    mutationFn: (data: GeneralInfoFormValues) => organizationApi.updateGeneralInfo(organizationId, data),
    onSuccess: invalidate,
  });

  const updateBranding = useMutation({
    mutationFn: (data: BrandingFormValues) => organizationApi.updateBranding(organizationId, data),
    onSuccess: invalidate,
  });

  const uploadLogo = useMutation({
    mutationFn: (file: File) => organizationApi.uploadLogo(organizationId, file),
    onSuccess: invalidate,
  });

  const updateContactDetails = useMutation({
    mutationFn: (data: ContactDetailsFormValues) => organizationApi.updateContactDetails(organizationId, data),
    onSuccess: invalidate,
  });

  const updateRegionalSettings = useMutation({
    mutationFn: (data: RegionalSettingsFormValues) => organizationApi.updateRegionalSettings(organizationId, data),
    onSuccess: invalidate,
  });

  const updateBusinessHours = useMutation({
    mutationFn: (data: BusinessHoursFormValues) => organizationApi.updateBusinessHours(organizationId, data),
    onSuccess: invalidate,
  });

  const updateTaxSettings = useMutation({
    mutationFn: (data: TaxSettingsFormValues) => organizationApi.updateTaxSettings(organizationId, data),
    onSuccess: invalidate,
  });

  return {
    updateGeneralInfo,
    updateBranding,
    uploadLogo,
    updateContactDetails,
    updateRegionalSettings,
    updateBusinessHours,
    updateTaxSettings,
  };
}
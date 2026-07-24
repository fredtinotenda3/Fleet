// frontend/modules/organizations/hooks/useOrganizationMutations.ts

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { organizationApi } from '../services/organization.api';
import { organizationKeys, orgUnitKeys } from './query-keys';
import type {
  Organization,
  CreateOrganizationPayload,
  UpdateOrganizationPayload,
  InviteMemberPayload,
  UpdateMemberRolePayload,
  AcceptInvitePayload,
  CreateOrgUnitPayload,
  UpdateOrgUnitPayload,
  MoveOrgUnitPayload,
  OrgUnitNode,
  AddMemberDirectPayload,
  AddMemberDirectResult,
} from '../types';

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  return fallback;
}

export function useCreateOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateOrganizationPayload) => organizationApi.createOrganization(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: organizationKeys.lists() });
      toast.success('Organization created successfully');
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'Failed to create organization'));
    },
  });
}

export function useUpdateOrganization(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateOrganizationPayload) =>
      organizationApi.updateOrganization(organizationId, payload),
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: organizationKeys.detail(organizationId) });
      const previous = queryClient.getQueryData<Organization>(
        organizationKeys.detail(organizationId)
      );
      if (previous) {
        queryClient.setQueryData<Organization>(organizationKeys.detail(organizationId), {
          ...previous,
          ...payload,
          branding: { ...previous.branding, ...payload.branding },
          settings: { ...previous.settings, ...payload.settings },
        });
      }
      return { previous };
    },
    onError: (error, _payload, context) => {
      if (context?.previous) {
        queryClient.setQueryData(organizationKeys.detail(organizationId), context.previous);
      }
      toast.error(getErrorMessage(error, 'Failed to update organization settings'));
    },
    onSuccess: () => {
      toast.success('Settings saved');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: organizationKeys.detail(organizationId) });
      queryClient.invalidateQueries({ queryKey: organizationKeys.lists() });
    },
  });
}

export function useInviteMember(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: InviteMemberPayload) => organizationApi.inviteMember(organizationId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: organizationKeys.detail(organizationId) });
      queryClient.invalidateQueries({ queryKey: organizationKeys.invites(organizationId) });
      toast.success('Invitation sent');
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'Failed to send invitation'));
    },
  });
}

export function useResendInvite(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => organizationApi.resendInvite(organizationId, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: organizationKeys.detail(organizationId) });
      toast.success('Invitation resent');
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'Failed to resend invitation'));
    },
  });
}

export function useRevokeInvite(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => organizationApi.revokeInvite(organizationId, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: organizationKeys.detail(organizationId) });
      queryClient.invalidateQueries({ queryKey: organizationKeys.invites(organizationId) });
      toast.success('Invitation cancelled');
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'Failed to cancel invitation'));
    },
  });
}

export function useAcceptInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: AcceptInvitePayload) => organizationApi.acceptInvite(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: organizationKeys.lists() });
      toast.success('You have joined the organization');
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'This invitation is invalid or has expired'));
    },
  });
}

export function useRemoveMember(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) => organizationApi.removeMember(organizationId, memberId),
    onMutate: async (memberId) => {
      await queryClient.cancelQueries({ queryKey: organizationKeys.detail(organizationId) });
      const previous = queryClient.getQueryData<Organization>(
        organizationKeys.detail(organizationId)
      );
      if (previous) {
        queryClient.setQueryData<Organization>(organizationKeys.detail(organizationId), {
          ...previous,
          members: previous.members.filter((m) => m.userId !== memberId),
        });
      }
      return { previous };
    },
    onError: (error, _memberId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(organizationKeys.detail(organizationId), context.previous);
      }
      toast.error(getErrorMessage(error, 'Failed to remove member'));
    },
    onSuccess: () => {
      toast.success('Member removed');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: organizationKeys.detail(organizationId) });
    },
  });
}

export function useUpdateMemberRole(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateMemberRolePayload) =>
      organizationApi.updateMemberRole(organizationId, payload),
    onMutate: async ({ memberId, role }) => {
      await queryClient.cancelQueries({ queryKey: organizationKeys.detail(organizationId) });
      const previous = queryClient.getQueryData<Organization>(
        organizationKeys.detail(organizationId)
      );
      if (previous) {
        queryClient.setQueryData<Organization>(organizationKeys.detail(organizationId), {
          ...previous,
          members: previous.members.map((m) => (m.userId === memberId ? { ...m, role } : m)),
        });
      }
      return { previous };
    },
    onError: (error, _payload, context) => {
      if (context?.previous) {
        queryClient.setQueryData(organizationKeys.detail(organizationId), context.previous);
      }
      toast.error(getErrorMessage(error, 'Failed to update member role'));
    },
    onSuccess: () => {
      toast.success('Member role updated');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: organizationKeys.detail(organizationId) });
    },
  });
}

export function useSuspendMember(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) => organizationApi.suspendMember(organizationId, memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: organizationKeys.detail(organizationId) });
      toast.success('Member suspended');
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'Failed to suspend member'));
    },
  });
}

export function useRestoreMember(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) => organizationApi.restoreMember(organizationId, memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: organizationKeys.detail(organizationId) });
      toast.success('Member restored');
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'Failed to restore member'));
    },
  });
}

export function useAddMemberDirect(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: AddMemberDirectPayload) => organizationApi.addMemberDirect(organizationId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: organizationKeys.detail(organizationId) });
      toast.success('Member added');
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'Failed to add member'));
    },
  });
}

// ---- Org Units ----

export function useCreateOrgUnit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateOrgUnitPayload) => organizationApi.createOrgUnit(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orgUnitKeys.lists() });
      toast.success('Org unit created');
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'Failed to create org unit'));
    },
  });
}

export function useUpdateOrgUnit(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateOrgUnitPayload) => organizationApi.updateOrgUnit(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orgUnitKeys.lists() });
      queryClient.invalidateQueries({ queryKey: orgUnitKeys.detail(id) });
      toast.success('Org unit updated');
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'Failed to update org unit'));
    },
  });
}

export function useDeleteOrgUnit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => organizationApi.deleteOrgUnit(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orgUnitKeys.lists() });
      toast.success('Org unit deleted');
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'Failed to delete org unit'));
    },
  });
}

export function useMoveOrgUnit(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: MoveOrgUnitPayload) => organizationApi.moveOrgUnit(id, payload),
    onSuccess: (updated: OrgUnitNode) => {
      queryClient.invalidateQueries({ queryKey: orgUnitKeys.lists() });
      queryClient.setQueryData(orgUnitKeys.detail(updated._id), updated);
      toast.success('Org unit moved');
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'Failed to move org unit'));
    },
  });
}
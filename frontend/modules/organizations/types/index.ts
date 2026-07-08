// frontend/modules/organizations/types/index.ts

import type {
  Organization,
  OrganizationBranding,
  OrganizationSettings,
  OrganizationSubscription,
  OrganizationFeatures,
  OrganizationMember,
  OrganizationInvite,
} from '@/shared/types/organization.types';

export type {
  Organization,
  OrganizationBranding,
  OrganizationSettings,
  OrganizationSubscription,
  OrganizationFeatures,
  OrganizationMember,
  OrganizationInvite,
};

export type OrganizationRole =
  | 'organization_owner'
  | 'fleet_manager'
  | 'accountant'
  | 'dispatcher'
  | 'driver'
  | 'mechanic'
  | 'auditor'
  | 'viewer';

export const ORGANIZATION_ROLES: OrganizationRole[] = [
  'organization_owner',
  'fleet_manager',
  'accountant',
  'dispatcher',
  'driver',
  'mechanic',
  'auditor',
  'viewer',
];

export const ASSIGNABLE_ROLES: OrganizationRole[] = ORGANIZATION_ROLES.filter(
  (r) => r !== 'organization_owner'
);

export const ROLE_LABELS: Record<OrganizationRole, string> = {
  organization_owner: 'Owner',
  fleet_manager: 'Fleet Manager',
  accountant: 'Accountant',
  dispatcher: 'Dispatcher',
  driver: 'Driver',
  mechanic: 'Mechanic',
  auditor: 'Auditor',
  viewer: 'Viewer',
};

export interface OrganizationMemberRow extends OrganizationMember {
  id: string; // alias of userId, for TanStack Table row identity
}

export interface OrganizationInviteRow extends OrganizationInvite {
  id: string; // alias of token, for TanStack Table row identity
}

export interface OrganizationListItem {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  role: OrganizationRole;
  tier: Organization['subscription']['tier'];
  status: Organization['status'];
  isDefault: boolean;
}

export interface OrganizationStatistics {
  activeUsers: number;
  totalUsers: number;
  pendingInvites: number;
  vehicleCount: number;
  activeVehicles: number;
  totalExpensesThisMonth: number;
  totalExpensesLastMonth: number;
  storageUsedGb: number;
  storageLimitGb: number;
  apiCallsThisMonth: number;
  apiCallLimit: number;
  seatsUsed: number;
  seatsTotal: number;
}

export interface CreateOrganizationPayload {
  name: string;
  ownerEmail: string;
  ownerName: string;
  settings?: Partial<OrganizationSettings>;
}

export interface UpdateOrganizationPayload {
  name?: string;
  branding?: Partial<OrganizationBranding>;
  settings?: Partial<OrganizationSettings>;
}

export interface InviteMemberPayload {
  email: string;
  role: OrganizationRole;
}

export interface UpdateMemberRolePayload {
  memberId: string;
  role: OrganizationRole;
}

export interface RemoveMemberPayload {
  memberId: string;
}

export interface AcceptInvitePayload {
  token: string;
  name: string;
}

export interface RevokeInvitePayload {
  token: string;
}

export interface OrgUnitNode {
  id: string;
  organizationId: string;
  type: 'branch' | 'department' | 'fleet' | 'workshop' | 'team';
  name: string;
  code?: string;
  parentId?: string | null;
  path: string[];
  depth: number;
  managerId?: string;
  status: 'active' | 'inactive';
  children?: OrgUnitNode[];
}

export interface CreateOrgUnitPayload {
  type: OrgUnitNode['type'];
  name: string;
  code?: string;
  parentId?: string | null;
  managerId?: string;
}

export interface UpdateOrgUnitPayload {
  name?: string;
  code?: string;
  managerId?: string | null;
  status?: 'active' | 'inactive';
}

export interface MoveOrgUnitPayload {
  newParentId: string | null;
}

export * from './roles.types';
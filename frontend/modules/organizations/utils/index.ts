// frontend/modules/organizations/utils/index.ts

import type { Organization, OrganizationMember, OrganizationRole } from '../types';
import { ROLE_LABELS } from '../types';

export function getRoleLabel(role: string): string {
  return ROLE_LABELS[role as OrganizationRole] ?? role;
}

export function isOwner(member: Pick<OrganizationMember, 'role'>): boolean {
  return member.role === 'organization_owner';
}

export function canManageMembers(currentUserRole: OrganizationRole): boolean {
  return currentUserRole === 'organization_owner' || currentUserRole === 'fleet_manager';
}

export function canManageBilling(currentUserRole: OrganizationRole): boolean {
  return currentUserRole === 'organization_owner';
}

export function getSeatsRemaining(organization: Organization): number {
  return Math.max(organization.subscription.seats - organization.subscription.usedSeats, 0);
}

export function isSeatLimitReached(organization: Organization): boolean {
  return organization.subscription.usedSeats >= organization.subscription.seats;
}

export function formatSubscriptionTier(tier: Organization['subscription']['tier']): string {
  switch (tier) {
    case 'free':
      return 'Free';
    case 'professional':
      return 'Professional';
    case 'enterprise':
      return 'Enterprise';
    default:
      return tier;
  }
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function inviteExpiresInDays(expiresAt: string | Date): number {
  const expiry = new Date(expiresAt).getTime();
  const now = Date.now();
  return Math.max(Math.ceil((expiry - now) / (1000 * 60 * 60 * 24)), 0);
}

export function isInviteExpired(expiresAt: string | Date): boolean {
  return new Date(expiresAt).getTime() < Date.now();
}

export const TIMEZONE_OPTIONS = [
  { value: 'UTC', label: 'UTC' },
  { value: 'Africa/Harare', label: 'Africa/Harare (CAT)' },
  { value: 'Africa/Johannesburg', label: 'Africa/Johannesburg (SAST)' },
  { value: 'Europe/London', label: 'Europe/London (GMT/BST)' },
  { value: 'America/New_York', label: 'America/New York (ET)' },
  { value: 'America/Los_Angeles', label: 'America/Los Angeles (PT)' },
  { value: 'Asia/Dubai', label: 'Asia/Dubai (GST)' },
] as const;

export const CURRENCY_OPTIONS = [
  { value: 'USD', label: 'USD — US Dollar' },
  { value: 'EUR', label: 'EUR — Euro' },
  { value: 'GBP', label: 'GBP — British Pound' },
  { value: 'ZAR', label: 'ZAR — South African Rand' },
  { value: 'ZWG', label: 'ZWG — Zimbabwe Gold' },
] as const;

export const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'French' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'sw', label: 'Swahili' },
] as const;
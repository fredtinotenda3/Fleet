// frontend/modules/organizations/utils/index.ts

import { Permission, permissionService } from '@/server/permissions/roles';
import type { Organization, OrganizationMember, OrganizationRole } from '../types';
import { ROLE_LABELS } from '../types';

export function getRoleLabel(role: string): string {
  return ROLE_LABELS[role as OrganizationRole] ?? role;
}

export function isOwner(member: Pick<OrganizationMember, 'role'>): boolean {
  return member.role === 'organization_owner';
}

/**
 * FIX (Phase E, task 4/5): this was a hardcoded
 * `role === 'organization_owner' || role === 'fleet_manager'` check --
 * the same anti-pattern flagged in middleware.ts's /admin gate. It let
 * Fleet Manager manage members/roles/advanced-settings nav (this
 * function backs canManageMembers checks in OrganizationMembersPage,
 * OrganizationRolesPage, OrganizationDashboardPage's quick links, and
 * ADVANCED_ADMIN_NAV_ITEMS in nav.ts) despite Fleet Manager never
 * holding Permission.ORG_MEMBERS_MANAGE, and excluded
 * ORGANIZATION_ADMIN (Phase A's owner-equivalent role) despite it
 * holding the same permission set as the owner. Now routed through
 * the real permission system instead of a role name.
 */
export function canManageMembers(currentUserRole: OrganizationRole): boolean {
  return permissionService.hasPermission([currentUserRole], Permission.ORG_MEMBERS_MANAGE);
}

/**
 * Deliberately NOT permission-based, unlike canManageMembers above.
 * server/permissions/roles.ts documents that ORGANIZATION_ADMIN
 * currently shares an identical permission set with
 * ORGANIZATION_OWNER "until a dedicated billing/ownership permission
 * exists to differentiate them" -- so there is no Permission constant
 * today that means "owner but not admin". Rather than guess one,
 * this stays an explicit role check on purpose: billing access is
 * owner-only until that dedicated permission exists. Revisit this the
 * same way once it does.
 */
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

/**
 * FIX (build error -- missing export): OrganizationSwitcher.tsx,
 * RecentMembersCard.tsx, and UserMenu.tsx all import `getInitials` from
 * this module (used for the small avatar-fallback badge next to an
 * organization or member name), but it was never defined/exported here
 * -- a straightforward missing-utility bug, not a permission/tenancy
 * issue like the other fixes in this file.
 *
 * Takes a display name and returns up to 2 uppercase initials:
 *   "John Doe"      -> "JD"   (first letter of first + last word)
 *   "Toyota"        -> "TO"   (first two letters of a single word)
 *   "  cesar   diaz"-> "CD"   (tolerates extra/irregular whitespace)
 *   "" / undefined  -> ""     (never throws on missing/empty name)
 */
export function getInitials(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return '';

  const words = trimmed.split(/\s+/).filter(Boolean);

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  const first = words[0][0] ?? '';
  const last = words[words.length - 1][0] ?? '';
  return `${first}${last}`.toUpperCase();
}

/**
 * FIX (build error -- missing export): PendingInvitationsList.tsx imports
 * `isInviteExpired` and `inviteExpiresInDays` from this module (used to
 * show "Expired" vs. "Expires in N days" on OrganizationInvite rows),
 * neither of which existed here -- same missing-utility class as
 * getInitials above, not a permission/tenancy issue.
 *
 * `expiresAt` accepts `string | Date` since OrganizationInvite.expiresAt
 * may come off the wire as an ISO string (API/JSON response) or already
 * be a Date (e.g. in a test or a client-side-constructed object) --
 * `new Date(x)` handles both without the caller needing to know which.
 */
export function isInviteExpired(expiresAt: string | Date): boolean {
  return new Date(expiresAt).getTime() <= Date.now();
}

/**
 * Days remaining until `expiresAt`, rounded up so "expires later today"
 * still reads as "1 day" rather than "0 days" (0 is reserved for the
 * genuinely-expired case, which callers should gate on isInviteExpired
 * first -- PendingInvitationsList only renders this value when
 * `!isInviteExpired(invite.expiresAt)`). Clamped at 0 as a floor so an
 * already-expired invite passed in directly can never render a
 * confusing negative day count.
 */
export function inviteExpiresInDays(expiresAt: string | Date): number {
  const msRemaining = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));
}
/* -------------------------------------------------------------------------
 * Regional settings option lists
 *
 * FIX (runtime-fatal). RegionalSection.tsx imports TIMEZONE_OPTIONS,
 * CURRENCY_OPTIONS and LANGUAGE_OPTIONS from this module, but they were
 * never defined. Because next.config.ts sets `ignoreBuildErrors: true`,
 * the production build only emitted a warning --
 *
 *   Attempted import error: 'TIMEZONE_OPTIONS' is not exported from '../../utils'
 *
 * -- and shipped anyway. At runtime each resolved to `undefined`, so
 * `TIMEZONE_OPTIONS.map(...)` threw and the entire Regional tab of
 * organization settings crashed on render.
 *
 * IANA timezone identifiers (tzdata), ISO 4217 currency codes, and
 * BCP 47 language tags.
 * ---------------------------------------------------------------------- */

export interface SelectOption {
  value: string;
  label: string;
}

export const TIMEZONE_OPTIONS: readonly SelectOption[] = [
  { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
  { value: 'Africa/Harare', label: 'Harare (CAT, UTC+2)' },
  { value: 'Africa/Johannesburg', label: 'Johannesburg (SAST, UTC+2)' },
  { value: 'Africa/Lagos', label: 'Lagos (WAT, UTC+1)' },
  { value: 'Africa/Nairobi', label: 'Nairobi (EAT, UTC+3)' },
  { value: 'Africa/Cairo', label: 'Cairo (EET, UTC+2)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Dublin', label: 'Dublin (GMT/IST)' },
  { value: 'Europe/Lisbon', label: 'Lisbon (WET/WEST)' },
  { value: 'Europe/Paris', label: 'Paris (CET/CEST)' },
  { value: 'Europe/Berlin', label: 'Berlin (CET/CEST)' },
  { value: 'Europe/Madrid', label: 'Madrid (CET/CEST)' },
  { value: 'Europe/Amsterdam', label: 'Amsterdam (CET/CEST)' },
  { value: 'Europe/Warsaw', label: 'Warsaw (CET/CEST)' },
  { value: 'Europe/Athens', label: 'Athens (EET/EEST)' },
  { value: 'Europe/Moscow', label: 'Moscow (MSK, UTC+3)' },
  { value: 'Asia/Dubai', label: 'Dubai (GST, UTC+4)' },
  { value: 'Asia/Karachi', label: 'Karachi (PKT, UTC+5)' },
  { value: 'Asia/Kolkata', label: 'Kolkata (IST, UTC+5:30)' },
  { value: 'Asia/Dhaka', label: 'Dhaka (BST, UTC+6)' },
  { value: 'Asia/Bangkok', label: 'Bangkok (ICT, UTC+7)' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT, UTC+8)' },
  { value: 'Asia/Hong_Kong', label: 'Hong Kong (HKT, UTC+8)' },
  { value: 'Asia/Shanghai', label: 'Shanghai (CST, UTC+8)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST, UTC+9)' },
  { value: 'Asia/Seoul', label: 'Seoul (KST, UTC+9)' },
  { value: 'Australia/Perth', label: 'Perth (AWST, UTC+8)' },
  { value: 'Australia/Brisbane', label: 'Brisbane (AEST, UTC+10)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST/AEDT)' },
  { value: 'Pacific/Auckland', label: 'Auckland (NZST/NZDT)' },
  { value: 'America/Sao_Paulo', label: 'Sao Paulo (BRT, UTC-3)' },
  { value: 'America/Argentina/Buenos_Aires', label: 'Buenos Aires (ART, UTC-3)' },
  { value: 'America/New_York', label: 'New York (ET)' },
  { value: 'America/Toronto', label: 'Toronto (ET)' },
  { value: 'America/Chicago', label: 'Chicago (CT)' },
  { value: 'America/Mexico_City', label: 'Mexico City (CST)' },
  { value: 'America/Denver', label: 'Denver (MT)' },
  { value: 'America/Phoenix', label: 'Phoenix (MST, no DST)' },
  { value: 'America/Los_Angeles', label: 'Los Angeles (PT)' },
  { value: 'America/Anchorage', label: 'Anchorage (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Honolulu (HST, no DST)' },
] as const;

export const CURRENCY_OPTIONS: readonly SelectOption[] = [
  { value: 'USD', label: 'USD — US Dollar' },
  { value: 'EUR', label: 'EUR — Euro' },
  { value: 'GBP', label: 'GBP — Pound Sterling' },
  { value: 'ZAR', label: 'ZAR — South African Rand' },
  { value: 'ZWG', label: 'ZWG — Zimbabwe Gold' },
  { value: 'BWP', label: 'BWP — Botswana Pula' },
  { value: 'ZMW', label: 'ZMW — Zambian Kwacha' },
  { value: 'MZN', label: 'MZN — Mozambican Metical' },
  { value: 'NGN', label: 'NGN — Nigerian Naira' },
  { value: 'KES', label: 'KES — Kenyan Shilling' },
  { value: 'GHS', label: 'GHS — Ghanaian Cedi' },
  { value: 'EGP', label: 'EGP — Egyptian Pound' },
  { value: 'MAD', label: 'MAD — Moroccan Dirham' },
  { value: 'AED', label: 'AED — UAE Dirham' },
  { value: 'SAR', label: 'SAR — Saudi Riyal' },
  { value: 'INR', label: 'INR — Indian Rupee' },
  { value: 'PKR', label: 'PKR — Pakistani Rupee' },
  { value: 'CNY', label: 'CNY — Chinese Yuan' },
  { value: 'JPY', label: 'JPY — Japanese Yen' },
  { value: 'SGD', label: 'SGD — Singapore Dollar' },
  { value: 'AUD', label: 'AUD — Australian Dollar' },
  { value: 'NZD', label: 'NZD — New Zealand Dollar' },
  { value: 'CAD', label: 'CAD — Canadian Dollar' },
  { value: 'BRL', label: 'BRL — Brazilian Real' },
  { value: 'MXN', label: 'MXN — Mexican Peso' },
  { value: 'CHF', label: 'CHF — Swiss Franc' },
  { value: 'SEK', label: 'SEK — Swedish Krona' },
  { value: 'NOK', label: 'NOK — Norwegian Krone' },
  { value: 'PLN', label: 'PLN — Polish Zloty' },
  { value: 'TRY', label: 'TRY — Turkish Lira' },
] as const;

export const LANGUAGE_OPTIONS: readonly SelectOption[] = [
  { value: 'en', label: 'English' },
  { value: 'en-GB', label: 'English (United Kingdom)' },
  { value: 'af', label: 'Afrikaans' },
  { value: 'sn', label: 'Shona' },
  { value: 'nd', label: 'Northern Ndebele' },
  { value: 'zu', label: 'Zulu' },
  { value: 'xh', label: 'Xhosa' },
  { value: 'sw', label: 'Swahili' },
  { value: 'ar', label: 'Arabic' },
  { value: 'fr', label: 'French' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'es', label: 'Spanish' },
  { value: 'de', label: 'German' },
  { value: 'it', label: 'Italian' },
  { value: 'nl', label: 'Dutch' },
  { value: 'pl', label: 'Polish' },
  { value: 'tr', label: 'Turkish' },
  { value: 'ru', label: 'Russian' },
  { value: 'hi', label: 'Hindi' },
  { value: 'ur', label: 'Urdu' },
  { value: 'zh-CN', label: 'Chinese (Simplified)' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
] as const;

// server/onboarding/setup-landing.service.ts
//
// ADAPTIVE ONBOARDING -- the one question the post-login landing
// redirect needs answered: should this user's FIRST hop after login go
// to the Setup Centre (/setup) instead of their usual landing page?
//
// ---------------------------------------------------------------------
// DELIBERATELY NOT a reimplementation of setup-checklist.ts
// ---------------------------------------------------------------------
// The rich, per-step checklist (six-now-eleven real facts, each with its
// own permission/readPermission) lives in exactly one place --
// frontend/modules/onboarding/utils/setup-checklist.ts -- and stays
// there. Re-deriving all of it here, in a server component that cannot
// use react-query's cache, would create a second, independently-
// maintained copy of the same logic -- precisely what this upgrade's
// brief says not to do ("do not create parallel or duplicate systems").
//
// Instead this answers a much narrower, cheaper question with its own
// three authoritative signals, the same ones a human would check first:
//   1. Does this user hold a setup permission at all? (ANCHOR_SETUP_
//      PERMISSIONS, server/permissions/landing.ts -- a driver or
//      mechanic is never redirected here, exactly as GetStartedPanel
//      never shows them a checklist.)
//   2. Has this organization already finished OR explicitly skipped the
//      Setup Centre? (OrganizationFleetProfile.setupCompletedAt /
//      setupDismissedAt -- an explicit, persisted decision always wins,
//      so a fleet that chose to skip is never forced back here on a
//      later login.)
//   3. Failing both of those being decisive, does this organization
//      have zero vehicles yet? A fleet with vehicles already is
//      self-evidently past the "first login" moment this redirect
//      exists for, whatever state the other ten checklist items are in.
//
// Every failure mode here resolves to `false` (stay on the normal
// landing page) -- this function must NEVER be the reason a login
// fails or loops. A redirect to /setup is a convenience, not a gate:
// nothing in middleware.ts enforces it, and the Setup Centre itself can
// always be reached or skipped voluntarily.

import { organizationService } from '@/modules/organizations/services/organization.service';
import { vehicleRepository } from '@/modules/vehicles/repositories/vehicle.repository';
import { hasAnySetupPermission } from '@/server/permissions/landing';

export async function shouldRouteToSetupCentre(
  roles: string[],
  tenantId: string | undefined | null
): Promise<boolean> {
  if (!tenantId || !hasAnySetupPermission(roles)) return false;

  try {
    // organizationId === tenantId for org-scoped resources (see
    // OrganizationService.getOrganization's own header comment on the
    // slug-vs-ObjectId history here) -- this is the same call every
    // existing settings-update method in that service already makes.
    const organization = await organizationService.getOrganization(tenantId, tenantId);

    if (organization.fleetProfile?.setupCompletedAt || organization.fleetProfile?.setupDismissedAt) {
      return false;
    }

    const vehicleCount = await vehicleRepository.count({}, tenantId);
    return vehicleCount === 0;
  } catch {
    // Never let an onboarding convenience become a login failure.
    return false;
  }
}

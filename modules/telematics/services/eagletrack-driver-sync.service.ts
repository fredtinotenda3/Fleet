// modules/telematics/services/eagletrack-driver-sync.service.ts
//
// Syncs GET /api2/drivers into tbldrivers.
//
// ---------------------------------------------------------------------
// THE ONLY HARD PROBLEM HERE IS IDENTITY
// ---------------------------------------------------------------------
// Importing a driver roster is trivial. Importing it TWICE without
// creating a second copy of every person is not, and getting it wrong is
// expensive in a way that is hard to reverse: drivers are referenced by
// fuel logs, trips, shifts and DVIRs, so a duplicate roster silently
// splits one person's history across two records and no report adds up
// again until somebody merges them by hand.
//
// Resolution order, most authoritative first:
//
//   1. The PROVIDER ID we recorded on a previous sync
//      (`providerDriverId`). Exact, stable, and immune to somebody
//      fixing a typo in the vendor UI. This is what makes the second run
//      of this sync report created: 0.
//   2. driver_code, exact and tenant-scoped. A staff/badge number is an
//      identifier an organization already treats as unique.
//   3. name, exact and tenant-scoped, and ONLY when it resolves to
//      exactly one driver.
//
// Steps 2 and 3 go through driverRepository.findByNameOrCode, which
// already implements "exactly one hit or nothing" and already carries
// the status-field fix that makes real rows (which frequently have no
// `status` at all) resolvable. Reusing it rather than writing a second
// matcher is deliberate: a second matcher would be a second place for
// the "two drivers share a name" rule to be got wrong, and that rule is
// the one standing between this sync and a misattributed fuel log.
//
// TWO DRIVERS SHARING A NAME IS NOT RESOLVED BY GUESSING. It is reported
// in `ambiguous` and skipped. Same discipline as the adapter's vehicle
// matching: a wrong match is worse than no match, because a wrong match
// attributes one person's driving record to another.
//
// ---------------------------------------------------------------------
// WHAT THIS SYNC WILL NOT DO
// ---------------------------------------------------------------------
//   * It never DELETES or deactivates a driver missing from the vendor
//     response. A transient partial response would otherwise deactivate
//     a working roster, and the vendor's driver list is not the
//     authority on who this organization employs.
//   * It never overwrites a non-empty local field with an empty provider
//     one. A blank phone number in the vendor UI is not a statement that
//     the number we hold is wrong.
//   * It never invents `status`. A newly created driver gets 'active';
//     an existing one is left alone.

import { driverRepository } from '@/modules/drivers/repositories/driver.repository';
import { monitoring } from '@/infrastructure/monitoring/logger';
import { Driver } from '@/shared/types/driver.types';
import '@/shared/types/driver.tenancy-addendum';
// Declares Driver.providerLink. MUST be imported for the augmentation to
// take effect -- without it the field is silently untyped and the casts
// below would be hiding a real error rather than a known-safe one.
import '@/shared/types/driver.provider-addendum';
import { EagleTrackApiClient } from '../adapters/eagletrack/eagletrack-api.client';
import { parseDriverRows } from '../adapters/eagletrack/eagletrack-payload.parsers';
import { eagletrackConfigRepository } from '../repositories/eagletrack-config.repository';
import {
  EagleTrackDriver,
  EagleTrackDriverSyncResult,
} from '../adapters/eagletrack/eagletrack.types';

/**
 * Where the provider link is recorded on a Driver row.
 *
 * A nested object rather than a flat `eagletrackDriverId`, so a second
 * provider can be added later without another top-level column, and so
 * the whole provider association can be removed in one unset.
 */
export interface DriverProviderLink {
  provider: 'eagletrack';
  providerDriverId: string;
  /** Tracker the provider says this driver is assigned to, when it says. Informational -- never used for scoping. */
  uin?: string;
  lastSyncedAt: Date;
}

export class EagleTrackDriverSyncService {
  /**
   * Pulls the provider roster and reconciles it into tbldrivers.
   *
   * Takes an already-built client rather than a tenantId so the caller
   * (syncOrganization) reuses the one it already has -- building a
   * second client would decrypt the token a second time for no reason.
   *
   * Never throws: a driver-sync failure must not take down the position
   * poll it runs alongside. Errors are returned in the result and
   * surfaced on EagleTrackSyncResult.errors.
   */
  async sync(tenantId: string, client: EagleTrackApiClient): Promise<EagleTrackDriverSyncResult> {
    const result: EagleTrackDriverSyncResult = {
      fetched: 0,
      created: 0,
      linked: 0,
      updated: 0,
      skippedNoId: 0,
      ambiguous: [],
      errors: [],
    };

    let providerDrivers: EagleTrackDriver[];
    try {
      providerDrivers = parseDriverRows(await client.getDrivers());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Eagle Track API error';
      result.errors.push(`drivers: ${message}`);
      monitoring.logError('[EagleTrackDriverSync] Driver roster fetch failed', error as Error, { tenantId });
      return result;
    }

    result.fetched = providerDrivers.length;

    // Everything already linked to this provider, in one query. Keyed by
    // providerDriverId so step 1 of the resolution order costs no round
    // trips at all.
    const byProviderId = await this.loadLinkedDrivers(tenantId);

    for (const providerDriver of providerDrivers) {
      try {
        await this.reconcileOne(tenantId, providerDriver, byProviderId, result);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(`driver ${providerDriver.providerDriverId || '(no id)'}: ${message}`);
      }
    }

    // Stamped whatever the per-row outcomes were: the roster WAS pulled,
    // and not advancing the clock on a partially-successful run would
    // re-pull it every 50 seconds forever.
    await eagletrackConfigRepository.recordSubSyncAt(tenantId, { drivers: true });

    return result;
  }

  /** Every driver in this tenant already carrying an Eagle Track link, keyed by provider id. */
  private async loadLinkedDrivers(tenantId: string): Promise<Map<string, Driver>> {
    const drivers = await driverRepository.findMany(
      // Dotted path into the augmented sub-document. `as never` because
      // BaseRepository.findMany types its filter as Partial<Driver>,
      // which cannot express a nested key -- the cast is about Mongo
      // query syntax, not about bypassing the Driver type.
      { 'providerLink.provider': 'eagletrack' } as never,
      tenantId
    );

    const map = new Map<string, Driver>();
    for (const driver of drivers) {
      const link = driver.providerLink;
      if (link?.providerDriverId) map.set(link.providerDriverId, driver);
    }
    return map;
  }

  private async reconcileOne(
    tenantId: string,
    providerDriver: EagleTrackDriver,
    byProviderId: Map<string, Driver>,
    result: EagleTrackDriverSyncResult
  ): Promise<void> {
    if (!providerDriver.providerDriverId) {
      // No stable id means nothing to reconcile against next time.
      // Importing it anyway would create a fresh duplicate on every
      // single sync -- the exact failure this service exists to avoid.
      result.skippedNoId += 1;
      return;
    }

    const link: DriverProviderLink = {
      provider: 'eagletrack',
      providerDriverId: providerDriver.providerDriverId,
      ...(providerDriver.uin ? { uin: providerDriver.uin } : {}),
      lastSyncedAt: new Date(),
    };

    // ── 1. Already linked ────────────────────────────────────────────
    const alreadyLinked = byProviderId.get(providerDriver.providerDriverId);
    if (alreadyLinked?._id) {
      const patch = this.buildPatch(providerDriver, alreadyLinked);
      await driverRepository.update(
        alreadyLinked._id,
        { ...patch, providerLink: link },
        tenantId
      );
      if (Object.keys(patch).length > 0) result.updated += 1;
      return;
    }

    // ── 2/3. Existing driver by code, then by name ───────────────────
    // Code first: a badge number is an identifier, a name is a label.
    const existing =
      (providerDriver.code
        ? await driverRepository.findByNameOrCode(providerDriver.code, tenantId)
        : null) ??
      (providerDriver.name
        ? await driverRepository.findByNameOrCode(providerDriver.name, tenantId)
        : null);

    if (existing?._id) {
      await driverRepository.update(
        existing._id,
        { ...this.buildPatch(providerDriver, existing), providerLink: link },
        tenantId
      );
      result.linked += 1;
      return;
    }

    // findByNameOrCode returns null both for "nobody" and for "more than
    // one" (it refuses to pick). Distinguish the two before creating,
    // because creating on an AMBIGUOUS name is how a third copy of an
    // already-duplicated person appears.
    if (providerDriver.name && (await this.isAmbiguous(providerDriver.name, tenantId))) {
      result.ambiguous.push(providerDriver.name);
      return;
    }

    // ── 4. Genuinely new ─────────────────────────────────────────────
    if (!providerDriver.name && !providerDriver.code) {
      // A driver record with neither a name nor a code is not a person,
      // it is an artefact. Counted as skipped rather than created as a
      // nameless row somebody has to clean up later.
      result.skippedNoId += 1;
      return;
    }

    await driverRepository.create(
      {
        name: providerDriver.name ?? providerDriver.code ?? providerDriver.providerDriverId,
        ...(providerDriver.code ? { driver_code: providerDriver.code } : {}),
        ...(providerDriver.phone ? { phone: providerDriver.phone } : {}),
        ...(providerDriver.email ? { email: providerDriver.email } : {}),
        ...(providerDriver.licenseNumber ? { license_number: providerDriver.licenseNumber } : {}),
        // 'active' only for a driver we are creating now. An existing
        // driver's status is a local operational decision this sync has
        // no business reverting.
        status: 'active',
        providerLink: link,
      } as never,
      tenantId
    );

    result.created += 1;
  }

  /**
   * Whether a name matches more than one driver in this tenant.
   *
   * Mirrors findByNameOrCode's own rule (exact, case-insensitive, active
   * including status-absent) by asking the same repository for a page of
   * matches. Deliberately a separate call rather than a change to
   * findByNameOrCode's signature: that method is on the fuel-import path
   * and its "exactly one or nothing" contract is relied on there.
   */
  private async isAmbiguous(name: string, tenantId: string): Promise<boolean> {
    const page = await driverRepository.getFilteredDrivers(
      { search: name },
      tenantId,
      { page: 1, limit: 2 }
    );
    const exact = page.data.filter(
      (driver) => driver.name?.trim().toLowerCase() === name.trim().toLowerCase()
    );
    return exact.length > 1;
  }

  /**
   * The fields this sync is willing to change on an EXISTING driver.
   *
   * Only ever fills a blank. An operator who corrected a phone number
   * locally must not have it overwritten by the stale value in the
   * vendor UI on the next poll -- that is data loss disguised as a sync,
   * and it is silent. `name` is never touched at all: it is the label
   * every other module renders, and the provider is not the authority
   * on it.
   */
  private buildPatch(
    providerDriver: EagleTrackDriver,
    existing: Driver
  ): Partial<Driver> {
    const patch: Partial<Driver> = {};
    if (providerDriver.code && !existing.driver_code) patch.driver_code = providerDriver.code;
    if (providerDriver.phone && !existing.phone) patch.phone = providerDriver.phone;
    if (providerDriver.email && !existing.email) patch.email = providerDriver.email;
    if (providerDriver.licenseNumber && !existing.license_number) {
      patch.license_number = providerDriver.licenseNumber;
    }
    return patch;
  }
}

export const eagletrackDriverSyncService = new EagleTrackDriverSyncService();

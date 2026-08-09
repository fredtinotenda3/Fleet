// modules/finance/services/finance-settings.service.ts
//
// Resolves the tenant's finance configuration -- reporting currency, FX
// policy, GL tolerance, depreciation defaults -- and is the ONLY place
// those defaults are decided. Every other service in this module calls
// resolve() rather than reading organization.financeSettings directly.
//
// That matters more here than it would for most settings. A default
// applied inconsistently across the cost engine does not produce an
// error; it produces two figures that disagree, which is the specific
// failure mode that makes a CFO stop trusting the product. Concretely:
// if the allocation service defaulted an unset reporting currency to
// 'USD' and the GL reconciliation service defaulted it to the
// organization's operating currency, a tenant that never configured
// finance settings would get a cost-per-km report in one currency and a
// reconciliation report in another, with no error anywhere.

import type {
  OrganizationFinanceSettings,
  FxPolicy,
  OrganizationDepreciationDefaults,
} from '../types/finance-settings.types';
import { resolveOrganization, invalidateOrganizationCache } from '@/server/tenancy/organization-resolver';
import { organizationRepository } from '@/modules/organizations/repositories/organization.repository';
import { NotFoundError, ValidationError } from '@/server/errors/app.errors';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';
import type { TenantContext } from '@/modules/tenancy/services/tenant-context.service';

/** Every default made explicit, so a reader can see what an unconfigured tenant gets. */
export const FINANCE_SETTINGS_DEFAULTS = {
  fxPolicy: 'transaction-date' as FxPolicy,
  /** 0 = exact match required. Deliberately strict: a tolerance the customer did not choose should never silently mark a variance as matched. */
  glToleranceAmount: 0,
} as const;

/**
 * Finance settings with every optional field resolved to a concrete
 * value. `reportingCurrency` is non-optional here (unlike on
 * OrganizationFinanceSettings) because callers computing money must not
 * have to decide what to do when it is missing.
 */
export interface ResolvedFinanceSettings {
  reportingCurrency: string;
  fxPolicy: FxPolicy;
  glToleranceAmount: number;
  depreciationDefaults?: OrganizationDepreciationDefaults;
  /**
   * True when the tenant has never saved finance settings, so every
   * value above came from a default or from OrganizationSettings.
   * Surfaced to the API so the UI can prompt for configuration instead
   * of presenting inferred defaults as if they were chosen -- an
   * unconfigured FX policy is a materially different thing to report on
   * than a confirmed one.
   */
  usingDefaults: boolean;
}

export class FinanceSettingsService {
  /**
   * Resolves the effective settings for a tenant.
   *
   * reportingCurrency falls back to OrganizationSettings.currency
   * ("the currency the organization operates in") rather than to a
   * hardcoded default, which is the only fallback that cannot silently
   * misstate a figure: for a single-currency tenant the operating
   * currency IS the reporting currency, and for a multi-currency tenant
   * the fallback is at worst the most-likely-correct guess and at best
   * a prompt to configure it explicitly.
   */
  async resolve(tenantId: string): Promise<ResolvedFinanceSettings> {
    const organization = await resolveOrganization(tenantId);
    if (!organization) {
      throw new NotFoundError('Organization not found; finance settings cannot be resolved.');
    }

    const saved = organization.financeSettings;
    const operatingCurrency = organization.settings?.currency;

    const reportingCurrency = saved?.reportingCurrency ?? operatingCurrency;
    if (!reportingCurrency) {
      // Neither a finance reporting currency nor an operating currency.
      // There is no safe guess -- inventing one would misstate every
      // converted figure downstream, so fail loudly and early.
      throw new ValidationError(
        'No reporting currency is configured for this organization. ' +
          'Set financeSettings.reportingCurrency (or the organization currency) before posting costs.'
      );
    }

    return {
      reportingCurrency: reportingCurrency.toUpperCase(),
      fxPolicy: saved?.fxPolicy ?? FINANCE_SETTINGS_DEFAULTS.fxPolicy,
      glToleranceAmount: saved?.glToleranceAmount ?? FINANCE_SETTINGS_DEFAULTS.glToleranceAmount,
      depreciationDefaults: saved?.depreciationDefaults,
      usingDefaults: !saved,
    };
  }

  /** The raw saved settings, unresolved -- for the settings screen, which must show what was actually chosen. */
  async getSaved(tenantId: string): Promise<OrganizationFinanceSettings | undefined> {
    const organization = await resolveOrganization(tenantId);
    if (!organization) {
      throw new NotFoundError('Organization not found.');
    }
    return organization.financeSettings;
  }

  /**
   * Persists finance settings at the ORGANIZATION level.
   *
   * Deliberately not org-unit scoped, per the reasoning in
   * finance-settings.types.ts: a branch reporting its TCO in a
   * different currency or under a different depreciation policy than
   * the rest of the organization makes the consolidated GL
   * reconciliation meaningless. The route gates this on FINANCE_MANAGE,
   * which BRANCH_MANAGER is deliberately not granted.
   *
   * Changing reportingCurrency does NOT restate existing postings --
   * each posting carries the reportingCurrency it was written under, on
   * purpose. The warning returned here is the honest consequence: after
   * a change, a period spanning the switch contains postings in two
   * reporting currencies, and the cost engine refuses to sum across
   * them rather than producing a meaningless total (see
   * AllocationService.getCostPerKm).
   */
  async update(
    context: TenantContext,
    userId: string,
    input: OrganizationFinanceSettings
  ): Promise<{ settings: OrganizationFinanceSettings; reportingCurrencyChanged: boolean }> {
    const organization = await resolveOrganization(context.organizationId);
    if (!organization?._id) {
      throw new NotFoundError('Organization not found.');
    }

    const before = organization.financeSettings;
    const normalized: OrganizationFinanceSettings = {
      ...input,
      reportingCurrency: input.reportingCurrency?.toUpperCase(),
    };

    const previousReportingCurrency = (
      before?.reportingCurrency ?? organization.settings?.currency
    )?.toUpperCase();
    const reportingCurrencyChanged =
      Boolean(normalized.reportingCurrency) &&
      Boolean(previousReportingCurrency) &&
      normalized.reportingCurrency !== previousReportingCurrency;

    const updated = await organizationRepository.update(
      String(organization._id),
      { financeSettings: normalized } as never,
      context.organizationId,
      userId,
      true
    );
    if (!updated) {
      throw new NotFoundError('Organization not found.');
    }

    // resolveOrganization() caches for ORGANIZATION_CACHE_TTL_MS. Without
    // this, a settings change would appear to succeed but every cost
    // figure would keep using the previous FX policy until the cache
    // expired -- the kind of "it fixed itself after five minutes" bug
    // that costs an afternoon to diagnose.
    invalidateOrganizationCache(context.organizationId);

    await auditLog.logUpdate(
      userId,
      context.organizationId,
      'organization.financeSettings',
      String(organization._id),
      before,
      normalized
    );

    return { settings: normalized, reportingCurrencyChanged };
  }
}

export const financeSettingsService = new FinanceSettingsService();

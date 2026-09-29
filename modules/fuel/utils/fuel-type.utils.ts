// modules/fuel/utils/fuel-type.utils.ts
//
// FIX ("Fuel Type Distribution" showing Diesel/diesel and Petrol/petrol
// as separate slices). fuel_type has always been a free string
// (shared/types/fuel.types.ts's `fuel_type?: string`,
// shared/validations/fuel.schema.ts's `z.string().max(30)`), and the
// Fuel Type Distribution aggregation (FuelRepository.getFuelTypeDistribution)
// grouped on that raw string with no case-folding -- Mongo's $group is
// case-sensitive, so "Diesel" and "diesel" were always two buckets, not
// one. This was never a chart-labelling problem; the underlying data
// itself carries mixed casing.
//
// Same raw/normalized/provenance pattern as
// modules/transport-cost/utils/normalization.utils.ts's
// normalizeRegistration/normalizeTransporter (trim, produce one
// canonical form, never destroy the original) -- reused here under the
// fuel module's OWN existing snake_case field-naming convention
// (fuel_type, fuel_volume, driver_id, license_plate) rather than
// transport-cost's camelCase. Concretely: `fuel_type` itself becomes the
// canonical value (so every existing reader -- aggregation, export,
// vehicle-default autofill -- keeps working unchanged, with no need to
// touch each call site individually), and the new sibling field
// `fuel_type_raw` carries exactly what was typed or imported, untouched,
// for provenance/audit -- see shared/types/fuel.types.ts's FuelLog.

/**
 * The platform's known fuel types, exactly matching
 * frontend/modules/fuel/components/FuelForm.tsx's FUEL_TYPES picklist
 * (`['diesel', 'petrol', 'electric', 'hybrid']`) -- kept as a sibling
 * constant here rather than imported from the (client) form component,
 * since this file is used from server-side handlers/repositories/scripts
 * that must not pull in frontend/ code. If the form's picklist ever
 * changes, update KNOWN_FUEL_TYPES to match -- there is no single
 * shared source for both today, which the regression test for this file
 * documents explicitly so a drift is caught rather than silently
 * tolerated.
 */
const KNOWN_FUEL_TYPES: Record<string, string> = {
  DIESEL: 'Diesel',
  PETROL: 'Petrol',
  ELECTRIC: 'Electric',
  HYBRID: 'Hybrid',
};

export const KNOWN_FUEL_TYPE_VALUES: string[] = Object.values(KNOWN_FUEL_TYPES);

/**
 * Canonicalizes a fuel-type string for storage and analytical grouping.
 *
 * - Blank/whitespace-only -> `{ normalized: null, raw: '' }`, mirroring
 *   normalizeRegistration/normalizeTransporter's null-for-blank contract
 *   (there is nothing to canonicalize, and `fuel_type` has always been
 *   optional -- this must stay a no-op for a log with no fuel type set).
 * - A case-insensitive match against the platform's known set
 *   (diesel/petrol/electric/hybrid, in any casing or with surrounding
 *   whitespace) resolves to that type's ONE canonical Title-Case label.
 * - Anything else (a typo, or a value entered before the picklist
 *   existed -- e.g. "LPG", "CNG", "Bio Diesel") is NEVER rejected or
 *   silently dropped: it is still deterministically Title-Cased
 *   word-by-word, so "cng" and "CNG" still collapse into the same
 *   analytical bucket ("Cng") even though it isn't one of the four known
 *   types. This function is idempotent -- normalizing an already-
 *   canonical value (from a prior write, or a re-run of the backfill
 *   script) returns the exact same string, so calling it twice is
 *   always safe.
 */
export function normalizeFuelType(raw: string | null | undefined): { normalized: string | null; raw: string } {
  const r = (raw ?? '').toString().trim();
  if (!r) return { normalized: null, raw: r };

  const upper = r.toUpperCase();
  const known = KNOWN_FUEL_TYPES[upper];
  if (known) return { normalized: known, raw: r };

  const titleCased = r
    .toLowerCase()
    .split(/\s+/)
    .map((word) => (word.length > 0 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ');
  return { normalized: titleCased, raw: r };
}

/** One raw $group bucket, as FuelRepository.getFuelTypeDistribution's Mongo pipeline produces it. */
export interface RawFuelTypeBucket {
  _id: string;
  litres: number;
  cost: number;
}

/** One row of FuelRepository.getFuelTypeDistribution's public result. */
export interface FuelTypeDistributionRowShape {
  fuelType: string;
  litres: number;
  cost: number;
  percentage: number;
}

/**
 * Re-groups Mongo's raw, case-sensitive $group buckets by canonical fuel
 * type, defensively -- so "Diesel" and "diesel" collapse into one row
 * even for a tenant whose historical data hasn't been through
 * scripts/backfill-fuel-type-normalization.ts yet, or a row written by
 * some future path that bypasses the create/update handlers'
 * normalizeFuelType() call. Extracted as a pure function (no Mongo
 * dependency) specifically so it is unit-testable without mocking a
 * database -- FuelRepository.getFuelTypeDistribution is a thin wrapper:
 * run the pipeline, hand the raw buckets to this function.
 */
export function groupFuelTypeDistribution(rawBuckets: RawFuelTypeBucket[]): FuelTypeDistributionRowShape[] {
  const byCanonical = new Map<string, { litres: number; cost: number }>();
  for (const r of rawBuckets) {
    const key = r._id === 'unspecified' ? 'Unspecified' : normalizeFuelType(r._id).normalized ?? 'Unspecified';
    const bucket = byCanonical.get(key) ?? { litres: 0, cost: 0 };
    bucket.litres += r.litres;
    bucket.cost += r.cost;
    byCanonical.set(key, bucket);
  }

  const totalLitres = Array.from(byCanonical.values()).reduce((sum, r) => sum + r.litres, 0);

  return Array.from(byCanonical.entries())
    .map(([fuelType, r]) => ({
      fuelType,
      litres: Math.round(r.litres * 100) / 100,
      cost: Math.round(r.cost * 100) / 100,
      percentage: totalLitres > 0 ? Math.round((r.litres / totalLitres) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.litres - a.litres);
}

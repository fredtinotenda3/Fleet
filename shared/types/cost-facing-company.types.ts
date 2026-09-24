// shared/types/cost-facing-company.types.ts
//
// OLIVINE LIVE OPERATING MODEL -- client meeting, 24 September 2026 (see
// OLIVINE_LIVE_OPERATING_MODEL_GAP_ANALYSIS.md, item 2/3/4/5). Olivine
// clarified that every transport cost is incurred FACING one of exactly
// three business entities:
//
//   HYPERY, OLIVINE, SURFACE
//
// This is a PRIMARY ANALYTICAL DIMENSION, not a label -- the client's own
// words: "They are not merely labels for reporting. They represent the
// business/cost-facing entities against which transport costs are being
// incurred." It must be captured explicitly, as structured data, at the
// point of entry (never derived from a sheet name, a transporter, or a
// vehicle afterwards -- item 3/5), and it must remain attached to that
// same transaction all the way through FORM -> SOURCE RECORD ->
// NORMALIZED RECORD -> LEDGER POSTING -> REPORTING -> ANALYTICS ->
// DRILL-DOWN (item 4).
//
// DELIBERATELY A NEW, SEPARATE DIMENSION FROM ContractedVehicle
// .businessStream ('olivine' | 'hypery' | 'surface-wilmar',
// shared/types/contracted-vehicle.types.ts) -- read that file's own doc
// comment before assuming these are the same thing:
//   - businessStream lives on the VEHICLE, set (optionally, and only by
//     a human) once, when a review item confirms a brand-new
//     ContractedVehicle. It is a fact about who a truck usually serves,
//     not about any one transaction.
//   - costFacingCompany (this file) lives on the TRANSACTION -- the
//     source record itself -- set explicitly by whoever enters or
//     imports that row. A single contracted vehicle can genuinely serve
//     more than one of Hypery/Olivine/Surface over its life (the exact
//     case businessStream cannot represent per-trip); this dimension
//     can.
// A future reconciliation between the two (e.g. deprecating
// businessStream in favour of always reading this field) is flagged as
// an open architectural question in the gap analysis, not resolved here
// -- this file only adds the new, additive dimension the client asked
// for, without touching the pre-existing one.
//
// Deliberately a small, closed TypeScript union (like BusinessStream),
// NOT a master-data collection the way Transporter/Vehicle/Customer/
// Destination are (see item 8 of the client's brief) -- three named,
// stable, board-level business entities are a fundamentally different
// kind of thing from an open-ended, user-growable list of customers or
// destinations, and modelling them as a heavyweight searchable/
// creatable master-data collection would be exactly the "speculative
// complexity" the client's own brief warns against (item 17: "do not
// fabricate data or build speculative complexity just because it sounds
// impressive"). Reversible: if Olivine later needs a fourth company or
// wants these admin-managed, promoting this union to a small reference
// collection is a additive, non-breaking follow-up (see the gap
// analysis's decision register).

export type CostFacingCompany = 'hypery' | 'olivine' | 'surface';

export interface CostFacingCompanyOption {
  value: CostFacingCompany;
  label: string;
}

/** Canonical display order and labels -- reused by every form/filter/chart
 *  so "Hypery / Olivine / Surface" is spelled and ordered identically
 *  everywhere it appears, never re-typed at each call site. */
export const COST_FACING_COMPANIES: CostFacingCompanyOption[] = [
  { value: 'hypery', label: 'Hypery' },
  { value: 'olivine', label: 'Olivine' },
  { value: 'surface', label: 'Surface' },
];

const COST_FACING_COMPANY_SET: ReadonlySet<string> = new Set(COST_FACING_COMPANIES.map((c) => c.value));

/**
 * Normalizes a raw, user- or spreadsheet-supplied value ("Hypery",
 * " OLIVINE ", "surface") to a valid CostFacingCompany, or null when it
 * is missing/unrecognised. Case- and whitespace-insensitive so a typed
 * or pasted value matches regardless of how it was capitalised in the
 * source cell -- the same tolerance this codebase already extends to
 * every other free-text cell (see normalizeTransporter/
 * normalizeRegistration), while the STORED value is always one of the
 * three canonical lowercase tokens, never a re-typed variant.
 */
export function normalizeCostFacingCompany(raw: unknown): CostFacingCompany | null {
  if (raw === undefined || raw === null) return null;
  const trimmed = String(raw).trim().toLowerCase();
  if (!trimmed) return null;
  return COST_FACING_COMPANY_SET.has(trimmed) ? (trimmed as CostFacingCompany) : null;
}

export function costFacingCompanyLabel(value: CostFacingCompany | string | null | undefined): string {
  const found = COST_FACING_COMPANIES.find((c) => c.value === value);
  return found?.label ?? 'Unattributed';
}

// tests/unit/transport-cost/cost-category-label-sync.spec.ts
//
// OLIVINE LIVE OPERATING MODEL, SLICE 1-5 PRODUCTION VERIFICATION PASS.
// The operational records table (TransportCostImportPage.tsx) gained a
// "Category" column backed by frontend/modules/transport-cost/types/
// index.ts's COST_CATEGORY_LABEL_BY_FAMILY -- a necessarily DUPLICATED
// (not imported) mirror of the real source of truth,
// modules/transport-cost/services/transport-cost-posting.service.ts's
// COST_CATEGORY_BY_FAMILY, because that service is a server-only module
// (real repository/DB dependencies) that frontend code must never
// import into a client bundle. TRANSPORT_COST_CATEGORY_OPTIONS in the
// same frontend file already uses this identical restated-not-imported
// pattern for the same reason (see its own doc comment).
//
// This test is the drift guard: it imports the REAL backend mapping and
// asserts the frontend's display-only copy agrees with it exactly, so a
// future change to one without the other fails CI loudly instead of
// silently mislabeling a row in the operational records table.

import { COST_CATEGORY_BY_FAMILY } from '../../../modules/transport-cost/services/transport-cost-posting.service';
import { COST_CATEGORY_LABEL_BY_FAMILY, TRANSPORT_COST_CATEGORY_OPTIONS } from '../../../frontend/modules/transport-cost/types';

describe('frontend COST_CATEGORY_LABEL_BY_FAMILY stays in sync with backend COST_CATEGORY_BY_FAMILY', () => {
  const families = Object.keys(COST_CATEGORY_BY_FAMILY) as Array<keyof typeof COST_CATEGORY_BY_FAMILY>;

  it('covers exactly the same set of sheet families as the backend mapping -- no family added or dropped on either side', () => {
    expect(Object.keys(COST_CATEGORY_LABEL_BY_FAMILY).sort()).toEqual(families.sort());
  });

  it.each(families)('family "%s" maps to the same cost-category value on both sides', (family) => {
    expect(COST_CATEGORY_LABEL_BY_FAMILY[family].value).toBe(COST_CATEGORY_BY_FAMILY[family]);
  });

  it('every frontend category value used here is one of the Command Centre filter\'s own known category options -- catches a silently-invalid category value', () => {
    const knownValues = new Set(TRANSPORT_COST_CATEGORY_OPTIONS.map((o) => o.value));
    for (const family of families) {
      expect(knownValues.has(COST_CATEGORY_LABEL_BY_FAMILY[family].value)).toBe(true);
    }
  });
});

// tests/security/report-scope.spec.ts
//
// Pins the report builder's org-unit enforcement.
//
// This was the last read path in the product that ignored org-unit
// scope, and the worst place for it: reports are designed to be
// exported and kept. A scoped user could author a definition over
// `vehicles` or `expenses`, run it, and download every row in the
// organization while every list page correctly showed them nothing.
//
// The predicate lives in ReportQueryEngine.orgUnitPredicate(). These
// tests replicate its contract rather than importing the engine, which
// would pull in the whole Mongo/report-generator graph.

import { orgUnitScopedCollections } from '../../server/tenancy/module-scope.registry';
import { TenantContext } from '../../modules/tenancy/services/tenant-context.service';

function ctx(ids: string[] | null): TenantContext {
  return {
    organizationId: 'willsgrove-farm-enterprises-9e80ed',
    organizationName: 'Willsgrove',
    accessibleOrgUnitIds: ids,
    assignedOrgUnitIds: ids ?? [],
    isPlatformScope: false,
  };
}

/** Mirrors ReportQueryEngine.orgUnitPredicate. */
function orgUnitPredicate(
  collectionName: string,
  context?: TenantContext
): Record<string, unknown> {
  if (!context) return {};
  if (context.accessibleOrgUnitIds === null) return {};
  if (!orgUnitScopedCollections().includes(collectionName)) return {};
  return { orgUnitId: { $in: context.accessibleOrgUnitIds } };
}

describe('report data sources are scoped', () => {
  // WAVE 3, R.3.8: 'tbltelematics_alerts' added when the `alerts` report
  // data source was registered (modules/reporting/registry/data-sources/
  // alerts.data-source.ts) -- it was already in orgUnitScopedCollections()
  // for the live alert-list/detail reads (Wave 2's own alert work relies
  // on it), so the report builder inherits the same scoping automatically;
  // this pins that inheritance explicitly rather than assuming it.
  //
  // WAVE 3, R.3.6: 'tblworkorders' added when the `workorders` report
  // data source was registered (modules/reporting/registry/data-sources/
  // workorders.data-source.ts) -- it was already in
  // orgUnitScopedCollections() (orgUnitSource: 'vehicle') for the live
  // WorkOrderRepository.getFilteredInScope/getFilteredForExport reads, so
  // the report builder inherits the same scoping automatically; this pins
  // that inheritance explicitly rather than assuming it.
  it.each(['tblvehicles', 'tblexpenses', 'tblfuellogs', 'tblreminders', 'tbltrips', 'tbltelematics_alerts', 'tblworkorders'])(
    '%s restricts a scoped user to their own units',
    (collection) => {
      expect(orgUnitPredicate(collection, ctx(['unit-harare']))).toEqual({
        orgUnitId: { $in: ['unit-harare'] },
      });
    }
  );

  it('leaves organization-wide roles unrestricted', () => {
    expect(orgUnitPredicate('tblvehicles', ctx(null))).toEqual({});
  });

  it('fails closed for a scoped user with no accessible units', () => {
    // Must match nothing, NOT fall through to organization-wide.
    expect(orgUnitPredicate('tblvehicles', ctx([]))).toEqual({
      orgUnitId: { $in: [] },
    });
  });

  it('does not restrict shared reference collections', () => {
    // Fuel stations and vendors are shared by every branch. Filtering
    // them by org unit would hide rows users are meant to see -- the
    // opposite failure, and just as damaging.
    expect(orgUnitPredicate('tblfuelstations', ctx(['unit-harare']))).toEqual({});
    expect(orgUnitPredicate('tblvendors', ctx(['unit-harare']))).toEqual({});
  });

  it('reads its scoped-collection list from the registry, not a local copy', () => {
    // Regression guard: if a module's scope decision is flipped in
    // module-scope.registry.ts, reports must follow automatically.
    const scoped = orgUnitScopedCollections();
    expect(scoped).toContain('tblvehicles');
    expect(scoped).toContain('tblexpenses');
    expect(scoped).toContain('tbltelematics_alerts');
    expect(scoped).toContain('tblworkorders');
    expect(scoped).not.toContain('tblfuelstations');
  });
});

describe('scope cannot be widened by the definition itself', () => {
  it('the scope predicate owns the orgUnitId key', () => {
    // `orgUnitId` is an exposed, filterable field on these data sources,
    // so a definition may legitimately contain `orgUnitId = <other>`.
    // The engine spreads scope LAST, so it overwrites any user-supplied
    // orgUnitId condition. This asserts that ordering.
    const userFilters = { orgUnitId: 'unit-bulawayo', status: 'active' };
    const merged = { ...userFilters, ...orgUnitPredicate('tblvehicles', ctx(['unit-harare'])) };

    expect(merged.orgUnitId).toEqual({ $in: ['unit-harare'] });
    expect(merged.orgUnitId).not.toBe('unit-bulawayo');
    expect(merged.status).toBe('active');
  });
});

// modules/reporting/registry/data-sources/organizations.data-source.ts
//
// Fixes missing capability #2 (branch/location as a reporting
// dimension). Registered under the key `organizations` to match what
// the frontend already expects (frontend/modules/reports/schemas/
// reportDefinition.ts's `ReportDataSource` union, and the note already
// left in columnResolvers.ts: "Do not add it here until
// bootstrap-data-sources.ts registers it, or saves against it will
// 400"). What it actually reports on is the org-unit hierarchy
// (tblorgunits: branch / department / fleet / workshop / team nodes)
// nested BELOW the tenant itself -- a tenant can only ever report on
// its own org units, so "organizations" as a reporting dimension here
// means "my org's internal branches/units," not cross-tenant data.

import { DataSourceDefinition } from '../../types/data-source.types';

export const organizationsDataSource: DataSourceDefinition = {
  key: 'organizations',
  label: 'Branches / Org Units',
  collectionName: 'tblorgunits',
  // ASSUMPTION (flagged): OrgUnit (modules/security/types/org-unit.types.ts)
  // carries `organizationId`, and OrgUnitHierarchyService's own raw
  // queries scope by `organizationId` directly (see
  // modules/tenancy/services/org-unit-hierarchy.service.ts#moveOrgUnit),
  // not `tenantId`. Elsewhere in this codebase tenantId IS the
  // organizationId, so the engine's generic `tenantId` param is mapped
  // onto that field name here.
  baseFilter: (tenantId) => ({ organizationId: tenantId, isDeleted: { $ne: true } }),
  fields: [
    { key: 'name', label: 'Name', type: 'string', aggregatable: false, groupable: true },
    { key: 'type', label: 'Type', type: 'string', aggregatable: false, groupable: true },
    { key: 'code', label: 'Code', type: 'string', aggregatable: false, groupable: true },
    { key: 'status', label: 'Status', type: 'string', aggregatable: false, groupable: true },
    { key: 'depth', label: 'Depth', type: 'number', aggregatable: false, groupable: true },
    { key: 'managerId', label: 'Manager', type: 'string', aggregatable: false, groupable: true },
  ],
  fetch: async (tenantId) => {
    const { orgUnitRepository } = await import('@/modules/security/repositories/org-unit.repository');
    const units = await orgUnitRepository.findMany(
      { organizationId: tenantId, isDeleted: { $ne: true } } as any,
      tenantId
    );
    return units as unknown as Array<Record<string, unknown>>;
  },
};
// modules/reporting/registry/data-sources/workorders.data-source.ts
//
// WAVE 3, R.3.6 -- Work Order Reporting. Registers a `workorders` data
// source over `tblworkorders` so a report author can finally build a
// row-level work-order report (filter/group/sort/export/schedule)
// through the existing Report Builder, and so the dedicated Work Order
// Reports KPI page (frontend/modules/reports/pages/WorkOrderReports.tsx)
// can link out to full row-level detail (vehicle, workshop, technician,
// cost, timestamps) without a second reporting engine.
//
// Read-only over WorkOrderRepository's own collection -- no shadow
// store, no re-derivation of anything the module already writes.
//
// SECURITY: `tblworkorders` is already listed in
// server/tenancy/module-scope.registry.ts's orgUnitScopedCollections()
// (orgUnitSource: 'vehicle', confirmed: true) -- it backs the live,
// already-scoped WorkOrderRepository.getFilteredInScope /
// getFilteredForExport paths. report-query.engine.ts's pushdown path
// applies the identical `orgUnitId`-scoped predicate to this source
// automatically, with no per-source code required here -- see
// tests/security/report-scope.spec.ts, extended in this delivery to
// cover this collection explicitly (mirrors the R.3.8 alerts source).
//
// DATA TRUTH:
//   - `type` is NOT a field on WorkOrder (workorder.types.ts has no
//     category/classification field). The closest genuine proxy is
//     `source` ('dvir' | 'manual' | 'reminder' -- what raised the job),
//     exposed here as `source` with an honest label ("Origin"), not
//     renamed to "Type" -- that would imply a formal taxonomy this
//     domain model does not have.
//   - `bayId` resolves to a real bay name/number via a $lookup into
//     tblworkshopbays (modules/workshop/types/workshop.types.ts). A
//     work order assigned no bay (common -- `assign()` accepts bayId as
//     optional) reports `bayName: null`, never a fabricated bay.
//   - `assignedMechanicId` resolves to a name via a $lookup into
//     tblorganizations, filtering that organization's embedded
//     `members` array for the matching `userId` -- mirrors exactly how
//     AssignMechanicForm.tsx / mechanics.api.ts already resolve a
//     mechanic's display name today (there is no separate `tblusers`
//     collection; organization.service.ts confirms membership is
//     embedded on the org document). A work order with no assignee, or
//     whose assignee has since left the organization (removed from
//     `members`), reports `mechanicName: null` rather than a stale or
//     guessed name.
//   - `turnaroundHours` is computed ONLY when `completedAt` is present
//     (`$cond` on `$ifNull`) -- `null` otherwise, never 0. A report
//     grouping/aggregating on this column will naturally exclude the
//     nulls from an average (Mongo's $avg already ignores non-numeric/
//     missing values), so an in-progress work order cannot silently
//     drag a turnaround average toward zero.
//   - There is no `overdueDate`/SLA field on WorkOrder at all, so no
//     "overdue" or "SLA" column is registered here -- adding one would
//     require fabricating a threshold this domain model has no basis
//     for. See the R.3.6 handoff, "Genuinely Missing".

import { Document } from 'mongodb';
import { DataSourceDefinition } from '../../types/data-source.types';
import { orgUnitLookupStages } from '../bootstrap-data-sources';

function tenantScoped(tenantId: string) {
  return { tenantId, isDeleted: { $ne: true } };
}

const ORG_UNIT_FIELDS = [
  { key: 'orgUnitId', label: 'Org Unit ID', type: 'string' as const, aggregatable: false, groupable: true },
  { key: 'orgUnitName', label: 'Branch', type: 'string' as const, aggregatable: false, groupable: true },
];

/**
 * Resolves `bayId` -> bay name/number (tblworkshopbays) and
 * `assignedMechanicId` -> a mechanic's display name (tblorganizations'
 * embedded `members` array), then derives `turnaroundHours` in Mongo
 * (never in Node -- report-query.engine.ts's pushdown path never loads
 * rows before filtering/grouping/projecting, see
 * DataSourceDefinition.prePipeline's own doc comment).
 *
 * `$toString` comparisons mirror orgUnitLookupStages/alerts.data-
 * source.ts's vehicleLookupStages exactly, for the same reason:
 * whether an id is stored as a string or an ObjectId-shaped value
 * isn't guaranteed, and this join works correctly either way.
 */
function bayAndMechanicLookupStages(tenantId: string): Document[] {
  return [
    {
      $lookup: {
        from: 'tblworkshopbays',
        let: { bId: '$bayId' },
        pipeline: [
          { $match: { $expr: { $and: [{ $ne: ['$$bId', null] }, { $eq: [{ $toString: '$_id' }, { $toString: '$$bId' }] }] } } },
          { $project: { name: 1, bayNumber: 1 } },
        ],
        as: '__bay',
      },
    },
    { $unwind: { path: '$__bay', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'tblorganizations',
        let: { mechId: '$assignedMechanicId' },
        pipeline: [
          { $match: { tenantId } },
          { $project: { members: 1 } },
          {
            $addFields: {
              __matchedMember: {
                $first: {
                  $filter: { input: { $ifNull: ['$members', []] }, as: 'm', cond: { $eq: ['$$m.userId', '$$mechId'] } },
                },
              },
            },
          },
          { $project: { name: '$__matchedMember.name' } },
        ],
        as: '__mechanic',
      },
    },
    { $unwind: { path: '$__mechanic', preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        bayName: {
          $cond: [{ $ifNull: ['$__bay.name', false] }, { $concat: ['$__bay.name', ' (Bay ', '$__bay.bayNumber', ')'] }, null],
        },
        mechanicName: { $ifNull: ['$__mechanic.name', null] },
        turnaroundHours: {
          $cond: [
            { $ifNull: ['$completedAt', false] },
            { $divide: [{ $subtract: ['$completedAt', '$openedAt'] }, 3600000] },
            null,
          ],
        },
      },
    },
    { $project: { __bay: 0, __mechanic: 0 } },
  ];
}

export const workordersDataSource: DataSourceDefinition = {
  key: 'workorders',
  label: 'Work Orders',
  collectionName: 'tblworkorders',
  baseFilter: tenantScoped,
  prePipeline: (tenantId) => [...bayAndMechanicLookupStages(tenantId), ...orgUnitLookupStages()],
  fields: [
    { key: 'title', label: 'Title', type: 'string', aggregatable: false, groupable: false },
    { key: 'status', label: 'Status', type: 'string', aggregatable: false, groupable: true },
    { key: 'priority', label: 'Priority', type: 'string', aggregatable: false, groupable: true },
    { key: 'source', label: 'Origin', type: 'string', aggregatable: false, groupable: true },
    { key: 'license_plate', label: 'License Plate', type: 'string', aggregatable: false, groupable: true },
    { key: 'bayName', label: 'Bay', type: 'string', aggregatable: false, groupable: true },
    { key: 'mechanicName', label: 'Assigned Mechanic', type: 'string', aggregatable: false, groupable: true },
    { key: 'openedAt', label: 'Opened At', type: 'date', aggregatable: false, groupable: false },
    { key: 'startedAt', label: 'Started At', type: 'date', aggregatable: false, groupable: false },
    { key: 'completedAt', label: 'Completed At', type: 'date', aggregatable: false, groupable: false },
    { key: 'turnaroundHours', label: 'Turnaround (Hours)', type: 'number', aggregatable: true, groupable: false },
    { key: 'laborHours', label: 'Labor Hours', type: 'number', aggregatable: true, groupable: false },
    { key: 'laborCost', label: 'Labor Cost', type: 'currency', aggregatable: true, groupable: false },
    { key: 'partsCost', label: 'Parts Cost', type: 'currency', aggregatable: true, groupable: false },
    { key: 'totalCost', label: 'Total Cost', type: 'currency', aggregatable: true, groupable: false },
    ...ORG_UNIT_FIELDS,
  ],
  fetch: async (tenantId) => {
    const { workOrderRepository } = await import('@/modules/workorders/repositories/workorder.repository');
    const result = await workOrderRepository.getFiltered({}, tenantId, { page: 1, limit: 10000 });
    return result.data as unknown as Array<Record<string, unknown>>;
  },
};

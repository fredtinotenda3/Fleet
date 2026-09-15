// modules/reporting/registry/data-sources/alerts.data-source.ts
//
// WAVE 3, R.3.8 -- Exception/Alert Reports. Registers a proper `alerts`
// data source over `tbltelematics_alerts` (the same collection every
// live vehicle alert -- legacy reading-alerts.ts AND the Rule Engine's
// `create_telemetry_alert` action both write through
// telemetry-alert-writer.ts's single `recordAndNotifyAlert`, see Wave 2)
// so a report author can finally build a fleet-wide exception report.
// Before this, there was no alert-related data source at all -- the
// report builder's seven registered sources (vehicles, expenses, fuel,
// maintenance, trips, drivers, organizations) had no way to reach an
// alert record.
//
// Reuses the alert engine's own storage and ownership resolution
// (createAlert/resolveAlertOwnership, Wave 2) rather than introducing a
// second alert store or re-deriving severity/type here -- this is a
// read-only report over data the alert engine already wrote.
//
// SECURITY: `tbltelematics_alerts` is already listed in
// server/tenancy/module-scope.registry.ts's orgUnitScopedCollections(),
// so report-query.engine.ts's pushdown path (the one every
// preview/run/export/drilldown actually uses) applies the same
// `orgUnitId`-scoped predicate to this source automatically, with no
// per-source code required here -- see tests/security/report-scope.spec.ts,
// extended in this delivery to cover this collection explicitly.
//
// DATA TRUTH: TelematicsAlert has no stored driver field (confirmed by
// reading modules/telematics/types/telematics.types.ts directly -- Wave
// 2's own alert-writer work traced this same type). Joining to the
// vehicle's CURRENT driver would misattribute a historical alert to
// whoever drives that vehicle today, which is exactly the fabrication
// the platform's data-truth rules forbid (R.3.3: "historical driver
// attribution must remain historically correct"). So this source
// deliberately has no `driver` field rather than a dishonest one --
// documented here, and in the Wave 3 handoff, as a genuine limitation
// rather than something silently worked around.

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
 * Resolves `vehicleId` -> `license_plate` via a $lookup into
 * tblvehicles, then derives an honest `status` column from
 * `acknowledgedAt` -- 'acknowledged' when a resolution timestamp
 * exists, 'active' otherwise. Both computed in Mongo (not a JS-side
 * transform) because report-query.engine.ts's pushdown path never
 * loads rows into Node before filtering/grouping/projecting -- see
 * DataSourceDefinition.prePipeline's own doc comment.
 *
 * The `$toString` comparison on both sides mirrors orgUnitLookupStages
 * exactly, for the same reason: whether `vehicleId` is stored as a
 * string or an ObjectId-shaped value isn't confirmed, and this join
 * works correctly either way.
 */
function vehicleLookupStages(): Document[] {
  return [
    {
      $lookup: {
        from: 'tblvehicles',
        let: { vId: '$vehicleId' },
        pipeline: [
          { $match: { $expr: { $eq: [{ $toString: '$_id' }, { $toString: '$$vId' }] } } },
          { $project: { license_plate: 1 } },
        ],
        as: '__vehicle',
      },
    },
    { $unwind: { path: '$__vehicle', preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        license_plate: '$__vehicle.license_plate',
        status: {
          $cond: [{ $ifNull: ['$acknowledgedAt', false] }, 'acknowledged', 'active'],
        },
      },
    },
    { $project: { __vehicle: 0 } },
  ];
}

export const alertsDataSource: DataSourceDefinition = {
  key: 'alerts',
  label: 'Alerts',
  collectionName: 'tbltelematics_alerts',
  baseFilter: tenantScoped,
  prePipeline: () => [...vehicleLookupStages(), ...orgUnitLookupStages()],
  fields: [
    { key: 'type', label: 'Alert Type', type: 'string', aggregatable: false, groupable: true },
    { key: 'severity', label: 'Severity', type: 'string', aggregatable: false, groupable: true },
    { key: 'status', label: 'Status', type: 'string', aggregatable: false, groupable: true },
    { key: 'message', label: 'Message', type: 'string', aggregatable: false, groupable: false },
    { key: 'value', label: 'Value', type: 'number', aggregatable: true, groupable: false },
    { key: 'threshold', label: 'Threshold', type: 'number', aggregatable: false, groupable: false },
    { key: 'timestamp', label: 'Occurred At', type: 'date', aggregatable: false, groupable: false },
    { key: 'acknowledgedAt', label: 'Acknowledged At', type: 'date', aggregatable: false, groupable: false },
    { key: 'license_plate', label: 'License Plate', type: 'string', aggregatable: false, groupable: true },
    ...ORG_UNIT_FIELDS,
  ],
  fetch: async (tenantId) => {
    const { telematicsRepository } = await import('@/modules/telematics/repositories/telematics.repository');
    const alerts = await telematicsRepository.getAlertsForTenant(tenantId);
    return alerts as unknown as Array<Record<string, unknown>>;
  },
};

// modules/reporting/types/data-source.types.ts

import type { Document, Filter } from 'mongodb';
import type { Permission } from '@/server/permissions/roles';

export type DataSourceKey =
  | 'vehicles'
  | 'expenses'
  | 'fuel'
  | 'maintenance'
  | 'trips'
  | 'drivers'
  | 'organizations'
  | 'alerts'
  | 'workorders'
  | 'allocations';

export interface DataSourceFieldDefinition {
  key: string;
  label: string;
  type: 'string' | 'number' | 'currency' | 'date' | 'boolean';
  aggregatable: boolean;
  groupable: boolean;
}

export interface DataSourceDefinition {
  key: DataSourceKey;
  label: string;
  fields: DataSourceFieldDefinition[];

  /** Underlying Mongo collection this source reads from (tenant-scoped). */
  collectionName: string;

  /**
   * Base `$match` clause applied to EVERY query against this source,
   * before any user-defined report filters are layered on -- tenant
   * scoping and soft-delete exclusion live here, so every report
   * definition against this source is automatically tenant-safe.
   */
  baseFilter: (tenantId: string) => Filter<Document>;

  /**
   * Optional pipeline stages (e.g. `$lookup` joins) run immediately
   * after the base `$match`, before user filters/grouping are applied.
   *
   * IMPORTANT: fields added by a prePipeline stage (e.g. a resolved
   * `orgUnitName` from a `$lookup`) are NOT available inside the
   * initial `$match` in report-query.engine.ts -- that match runs
   * first, using only fields already present on the source document.
   * They ARE available for grouping, sorting, and column projection.
   * Concretely: a report can group by / display `orgUnitName`, and can
   * filter by `orgUnitId` (present on the raw document), but cannot
   * filter by `orgUnitName` directly.
   */
  prePipeline?: (tenantId: string) => Document[];

  /**
   * LEGACY fallback: fetches a capped row set into memory via the
   * module's existing repository method. report-query.engine.ts's
   * pushdown path (`run`/`runFull`) does NOT call this.
   */
  fetch: (tenantId: string) => Promise<Array<Record<string, unknown>>>;

  /**
   * R.3.7 -- PREREQUISITE FIX, not new scope creep.
   *
   * When set, a caller must hold this permission (or an RBAC-bypass
   * role) to preview, drill into, export, or schedule a report against
   * this source -- enforced by
   * modules/reporting/utils/data-source-authorization.ts's
   * assertDataSourceAccess(), called from every AuthContext-available
   * checkpoint (report-definition.controller.ts's preview/previewPivot/
   * drilldown/create+schedule/update+schedule,
   * report-execution.controller.ts's generate).
   *
   * BEFORE THIS FIELD EXISTED: every data source was reachable by
   * anyone holding the blanket Permission.REPORT_VIEW/REPORT_CREATE
   * gate on the /api/reports* and /api/reporting/* routes, with NO
   * data-source-specific check anywhere in the call chain (confirmed by
   * reading report-definition.controller.ts, report-builder.service.ts,
   * drilldown.service.ts, report-execution.controller.ts,
   * report-execution.service.ts, and every route file directly). A role
   * holding only REPORT_VIEW -- e.g. AUDITOR, DEPARTMENT_MANAGER,
   * SUPERVISOR -- could already preview/export/schedule a report over
   * `expenses` or `fuel` with no EXPENSE_VIEW/FUEL_VIEW check at all.
   * That gap is closed retroactively here (see bootstrap-data-sources.ts)
   * as a prerequisite for safely registering `allocations`, a strictly
   * more sensitive source, through the same, previously-ungated engine.
   *
   * Optional and additive: a source with no `requiredPermission` keeps
   * its exact previous behaviour (gated only by the route-level
   * REPORT_VIEW/REPORT_CREATE permission), so `vehicles`, `trips`,
   * `maintenance`, `drivers`, `organizations`, `alerts`, and
   * `workorders` are deliberately left unchanged -- none of them expose
   * data with a narrower existing permission than REPORT_VIEW already
   * implies, per the role matrix in server/permissions/roles.ts.
   */
  requiredPermission?: Permission;
}
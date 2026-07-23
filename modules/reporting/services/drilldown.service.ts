// modules/reporting/services/drilldown.service.ts
//
// FIX: previously called reportQueryEngine.run(), which under the old
// engine meant "filter the already-fetched, capped-at-10k in-memory
// array." A user clicking into a group (e.g. "show me every expense in
// the 'Fuel' category") wants ALL matching detail rows, not a 100-row
// preview page -- so this now calls runFull(), which pushes the
// drill-down filter into Mongo and returns up to FULL_RESULT_CAP
// matching rows with a `truncated` flag if there are more.

import { reportQueryEngine } from './report-query.engine';
import { ReportDefinition, ReportFilterCondition, ReportResult } from '../types/report-definition.types';

/**
 * Drill-down works by taking the SAME data source and base filters as
 * the parent report, adding the specific group-key equality conditions
 * the user clicked on, and re-running the engine with grouping/
 * aggregation stripped so the caller gets raw, ungrouped detail rows
 * rather than another summary.
 */
export class DrilldownService {
  async drillInto(
    definition: ReportDefinition,
    tenantId: string,
    groupValues: Record<string, unknown>
  ): Promise<ReportResult> {
    const extraFilters: ReportFilterCondition[] = Object.entries(groupValues).map(([field, value]) => ({
      field,
      operator: 'eq',
      value,
    }));

    const detailDefinition: ReportDefinition = {
      ...definition,
      groupBy: [],
      aggregations: [],
      fields: definition.fields.length ? definition.fields : Object.keys(groupValues),
    };

    return reportQueryEngine.runFull(detailDefinition, tenantId, extraFilters);
  }
}

export const drilldownService = new DrilldownService();
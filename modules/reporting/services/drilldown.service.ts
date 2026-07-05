// modules/reporting/services/drilldown.service.ts

import { reportQueryEngine } from './report-query.engine';
import { ReportDefinition, ReportFilterCondition, ReportResult } from '../types/report-definition.types';

/**
 * Drill-down works by taking the SAME data source and base filters as the
 * parent report, adding the specific group-key equality conditions the
 * user clicked on, and re-running the engine with grouping/aggregation
 * stripped so the caller gets raw, ungrouped detail rows rather than
 * another summary.
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

    return reportQueryEngine.run(detailDefinition, tenantId, extraFilters);
  }
}

export const drilldownService = new DrilldownService();
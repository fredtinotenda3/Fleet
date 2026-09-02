// frontend/modules/ai/components/DriverIncidentList.tsx
//
// Recent incidents/events for a driver -- DriverRiskScore.incidents,
// already capped to 20 server-side (collectIncidents()'s
// `.slice(0, 20)`) and cited-from evidence when present. Sorted
// newest-first for display via sortIncidentsByRecency (a pure,
// non-mutating util -- see ../utils/driver-risk.utils.ts) since the
// backend does not itself guarantee incidents arrive in date order
// (speeding incidents are appended before hard-brake incidents,
// regardless of timestamp).

'use client';

import { AlertTriangle } from 'lucide-react';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import type { DriverRiskIncident } from '../types/driver-risk.types';
import {
  formatRiskTimestamp,
  incidentSeverityPresentation,
  sortIncidentsByRecency,
} from '../utils/driver-risk.utils';

interface DriverIncidentListProps {
  incidents: DriverRiskIncident[] | undefined;
}

export function DriverIncidentList({ incidents }: DriverIncidentListProps) {
  if (!incidents || incidents.length === 0) {
    return (
      <EmptyState
        title="No recent incidents"
        description="No speeding or hard-braking events were recorded for this driver."
      />
    );
  }

  const sorted = sortIncidentsByRecency(incidents);

  return (
    <ul className="divide-y divide-border">
      {sorted.map((incident, index) => {
        const presentation = incidentSeverityPresentation(incident.severity);
        return (
          <li key={`${incident.type}-${incident.date}-${index}`} className="flex items-start gap-3 py-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-foreground">{incident.type}</span>
                <Badge variant={presentation.badgeVariant} className={presentation.badgeClassName}>
                  {incident.severity}
                </Badge>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatRiskTimestamp(incident.date)}
                {incident.location ? ` \u00b7 ${incident.location}` : ''}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

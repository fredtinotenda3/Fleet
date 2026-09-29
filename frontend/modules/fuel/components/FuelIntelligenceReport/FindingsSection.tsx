// frontend/modules/fuel/components/FuelIntelligenceReport/FindingsSection.tsx
//
// Every finding here comes straight from the backend's buildFindings()
// (PART 13: WHAT/WHY/IMPACT/ACTION/HOW/PREVENTION/OWNER/MONITOR) -- this
// component only lays them out, it never generates or edits wording.
// `action`/`how`/`prevention`/`owner`/`monitor` are all optional on the
// wire and are simply omitted from the card when absent, never
// backfilled with a placeholder.

import { Info, AlertTriangle, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { LabeledText } from './LabeledValue';
import type { Finding } from '../../types';

interface FindingsSectionProps {
  findings: Finding[];
}

const SEVERITY_CONFIG: Record<Finding['severity'], { icon: typeof Info; variant: 'outline' | 'secondary' | 'destructive'; border: string }> = {
  info: { icon: Info, variant: 'outline', border: 'border-l-border' },
  attention: { icon: AlertTriangle, variant: 'secondary', border: 'border-l-warning' },
  urgent: { icon: AlertCircle, variant: 'destructive', border: 'border-l-danger' },
};

function FindingRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <p className="text-body-sm">
      <span className="font-medium text-foreground">{label}: </span>
      <span className="text-muted-foreground">{value}</span>
    </p>
  );
}

export function FindingsSection({ findings }: FindingsSectionProps) {
  if (findings.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle>Findings &amp; actions</CardTitle></CardHeader>
        <CardContent>
          <p className="py-6 text-center text-body-sm text-muted-foreground">
            No findings met this report&rsquo;s configured thresholds for this period.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader><CardTitle>Findings &amp; actions ({findings.length})</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {findings.map((finding) => {
          const config = SEVERITY_CONFIG[finding.severity];
          const Icon = config.icon;
          return (
            <div key={finding.id} className={`rounded-lg border border-border border-l-2 ${config.border} bg-card p-4`}>
              <div className="mb-2 flex items-start justify-between gap-3">
                <div className="flex items-start gap-2">
                  <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <p className="font-medium text-foreground">{finding.what}</p>
                </div>
                <Badge variant={config.variant} className="shrink-0 capitalize">{finding.severity}</Badge>
              </div>
              <div className="ml-6 space-y-1">
                <FindingRow label="Why it matters" value={finding.why} />
                <p className="text-body-sm">
                  <span className="font-medium text-foreground">Impact: </span>
                  <LabeledText labeled={finding.impact} className="text-muted-foreground" />
                </p>
                <FindingRow label="Action" value={finding.action} />
                <FindingRow label="How" value={finding.how} />
                <FindingRow label="Prevention" value={finding.prevention} />
                <FindingRow label="Owner" value={finding.owner} />
                <FindingRow label="Monitor" value={finding.monitor} />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

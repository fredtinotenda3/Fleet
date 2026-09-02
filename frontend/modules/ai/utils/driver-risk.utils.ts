// frontend/modules/ai/utils/driver-risk.utils.ts
//
// Pure functions only -- no React, no fetch. Kept separate from the
// components so this formatting/mapping logic can be unit tested
// under tests/unit (Jest's plain 'node' environment, no jsdom/RTL
// wired up in this repo -- see tests/unit/observability/
// provider-health.utils.spec.ts for the same convention) without
// needing to render anything.

import type {
  DriverRiskLevel,
  DriverRiskEvidence,
  DriverRiskIncident,
} from '../types/driver-risk.types';

/**
 * The Badge component (frontend/shared/ui/data-display/badge.tsx) only
 * ships default/secondary/destructive/outline/ghost/link variants --
 * there is no built-in 'success'/'warning'. Following the same
 * convention as provider-health.utils.ts's StatusPresentation:
 * variant="outline" plus a semantic className for the two levels that
 * aren't a clean match for an existing variant.
 */
export interface RiskLevelPresentation {
  badgeVariant: 'outline' | 'destructive' | 'secondary';
  badgeClassName: string;
}

const RISK_LEVEL_PRESENTATION: Record<DriverRiskLevel, RiskLevelPresentation> = {
  low: {
    badgeVariant: 'outline',
    badgeClassName: 'border-success text-success',
  },
  medium: {
    badgeVariant: 'outline',
    badgeClassName: 'border-warning text-warning',
  },
  high: {
    badgeVariant: 'destructive',
    badgeClassName: '',
  },
  critical: {
    badgeVariant: 'destructive',
    badgeClassName: 'font-semibold',
  },
};

const FALLBACK_RISK_LEVEL_PRESENTATION: RiskLevelPresentation = {
  badgeVariant: 'secondary',
  badgeClassName: '',
};

/**
 * Maps a driver risk level to how it should render. Falls back to a
 * neutral 'secondary' presentation for any value outside the known
 * union (e.g. if the backend ever adds a level this type doesn't know
 * about yet), rather than throwing or silently mislabeling it as safe.
 */
export function riskLevelPresentation(level: DriverRiskLevel): RiskLevelPresentation {
  return RISK_LEVEL_PRESENTATION[level] ?? FALLBACK_RISK_LEVEL_PRESENTATION;
}

/** Human-facing label for a risk level, e.g. 'critical' -> 'Critical'. */
export function riskLevelLabel(level: DriverRiskLevel): string {
  switch (level) {
    case 'low':
      return 'Low';
    case 'medium':
      return 'Medium';
    case 'high':
      return 'High';
    case 'critical':
      return 'Critical';
    default:
      return 'Unknown';
  }
}

/**
 * Formats DriverRiskScore.overallScore (and any other 0-100 metric)
 * for display. Clamps and rounds defensively -- the backend's own
 * calculateOverallScore can, by construction of its weighted sum,
 * produce values outside a strict 0-100 band in edge cases, and this
 * is purely a presentation clamp, not a correction of the underlying
 * score used elsewhere in the app.
 */
export function formatRiskScore(score: number | null | undefined): string {
  if (score === null || score === undefined || Number.isNaN(score)) {
    return '\u2014';
  }
  return String(Math.round(Math.max(0, Math.min(100, score))));
}

/**
 * Formats a sub-score (safety/fatigue/distraction, each 0-100) as a
 * percentage-style label for a bar/gauge caption, e.g. "42 / 100".
 */
export function formatSubScore(score: number | null | undefined): string {
  if (score === null || score === undefined || Number.isNaN(score)) {
    return '\u2014 / 100';
  }
  return `${Math.round(Math.max(0, Math.min(100, score)))} / 100`;
}

/**
 * Formats an ISO timestamp string (trend point date, incident date,
 * DriverRiskScore.timestamp) for display. Returns 'Unknown' rather
 * than a raw invalid string or a thrown error for an unparseable
 * value -- these come straight off the network, so defensive
 * formatting matters more here than for a value the app itself wrote.
 */
export function formatRiskTimestamp(iso: string | null | undefined): string {
  if (!iso) {
    return 'Unknown';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Formats an ISO timestamp string as a short axis label for the trend
 * chart (e.g. "Jan 15"), distinct from formatRiskTimestamp's fuller
 * "Jan 15, 2026" -- a chart x-axis needs to stay compact across five
 * points without wrapping or overlapping.
 */
export function formatTrendAxisLabel(iso: string | null | undefined): string {
  if (!iso) {
    return '';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Incident severity presentation. DriverRiskIncident.severity is a
 * free-text `string` on the wire (see the doc comment in
 * ../types/driver-risk.types.ts) -- today's service only ever emits
 * 'High' or 'Medium' (speedingSeverity(); hard-brake incidents are
 * always 'Medium'), matched case-sensitively since that is exactly
 * what the backend sends. Anything else (including a future severity
 * value, or an unexpected case) renders as neutral 'secondary' rather
 * than guessing at how alarming it should look.
 */
export function incidentSeverityPresentation(
  severity: DriverRiskIncident['severity']
): RiskLevelPresentation {
  if (severity === 'High') {
    return RISK_LEVEL_PRESENTATION.high;
  }
  if (severity === 'Medium') {
    return RISK_LEVEL_PRESENTATION.medium;
  }
  return FALLBACK_RISK_LEVEL_PRESENTATION;
}

/**
 * Formats a single evidence reference into a short, human-readable
 * line, e.g. "tbltelematics · reading_123 · Jan 15, 2026 · 142". Never
 * invents a value for a missing field -- `observedAt`/`value` are
 * genuinely optional on AIEvidence (see ai-evidence.types.ts), and a
 * reference with neither is still valid evidence (a source + a
 * resolvable id).
 */
export function formatEvidenceLine(evidence: DriverRiskEvidence): string {
  const parts = [evidence.source, evidence.reference];
  if (evidence.observedAt) {
    parts.push(formatRiskTimestamp(evidence.observedAt));
  }
  if (evidence.value !== undefined && evidence.value !== null && !Number.isNaN(evidence.value)) {
    parts.push(String(evidence.value));
  }
  return parts.join(' \u00b7 ');
}

/**
 * Sorts incidents newest-first for display. Pure/non-mutating: returns
 * a new array rather than sorting `incidents` in place, since the
 * array passed in is response data callers may still hold a reference
 * to elsewhere (e.g. an already-rendered list).
 */
export function sortIncidentsByRecency(incidents: DriverRiskIncident[]): DriverRiskIncident[] {
  return [...incidents].sort((a, b) => {
    const aTime = new Date(a.date).getTime();
    const bTime = new Date(b.date).getTime();
    const safeA = Number.isNaN(aTime) ? 0 : aTime;
    const safeB = Number.isNaN(bTime) ? 0 : bTime;
    return safeB - safeA;
  });
}

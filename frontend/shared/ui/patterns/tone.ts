// frontend/shared/ui/patterns/tone.ts
//
// The single mapping from "what does this mean" to "how does it look".
//
// WHY THIS FILE EXISTS: before the UI/UX overhaul, semantic colour was
// decided independently at ~40 call sites. Some used the design tokens
// (`text-success`), some used raw Tailwind palette colours that are not in
// this product's palette at all (`text-green-600`, `from-blue-500`), and some
// used `trend.isPositive` — a boolean that conflates "the number went up"
// with "this is good news", which is wrong for every cost metric in the
// platform. Cost per km rising 12% was rendered in green.
//
// Everything semantic now resolves through here, so a status, a severity and
// a delta that mean the same thing look the same wherever they are rendered.

/**
 * The semantic intents this product recognises. Deliberately small — an
 * operations console needs "is this fine, does it need looking at, or is it
 * broken", not a paint chart.
 */
export type Tone = 'neutral' | 'positive' | 'attention' | 'critical' | 'info';

interface ToneClasses {
  /** Tinted surface + border + text, for badges, callouts and banners. */
  surface: string;
  /** Foreground only, for figures and inline text. */
  text: string;
  /** Solid fill, for status dots and small indicators. */
  dot: string;
  /** Left rule, for list rows and cards that carry a status. */
  rule: string;
  /** Icon colour when the icon sits on a plain (untinted) surface. */
  icon: string;
}

export const TONE_CLASSES: Record<Tone, ToneClasses> = {
  neutral: {
    surface: 'bg-muted text-muted-foreground border-border',
    text: 'text-muted-foreground',
    dot: 'bg-muted-foreground',
    rule: 'border-l-border',
    icon: 'text-muted-foreground',
  },
  positive: {
    surface: 'bg-success-bg text-success border-success-border',
    text: 'text-success',
    dot: 'bg-success',
    rule: 'border-l-success',
    icon: 'text-success',
  },
  attention: {
    surface: 'bg-warning-bg text-warning border-warning-border',
    text: 'text-warning',
    dot: 'bg-warning',
    rule: 'border-l-warning',
    icon: 'text-warning',
  },
  critical: {
    surface: 'bg-danger-bg text-danger border-danger-border',
    text: 'text-danger',
    dot: 'bg-danger',
    rule: 'border-l-danger',
    icon: 'text-danger',
  },
  info: {
    surface: 'bg-info-bg text-info border-info-border',
    text: 'text-info',
    dot: 'bg-info',
    rule: 'border-l-info',
    icon: 'text-info',
  },
};

/**
 * Severity as produced by the AI/attention layer (`AISeverity` in
 * modules/ai/types/ai.types.ts). Duplicated as a string union rather than
 * imported so that this presentational module carries no dependency on a
 * backend module; the mapping below is exhaustive over that union and a
 * unit test pins the two together.
 */
export type SeverityLevel = 'low' | 'medium' | 'high' | 'critical';

export const SEVERITY_TONE: Record<SeverityLevel, Tone> = {
  low: 'neutral',
  medium: 'info',
  high: 'attention',
  critical: 'critical',
};

export const SEVERITY_LABEL: Record<SeverityLevel, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

/**
 * Live operational state of a vehicle, as computed by the telematics layer.
 * `stale` is not one of the map's status values — it is a separate boolean
 * there — but it is a tone the UI needs, because "we have not heard from
 * this vehicle recently" must never be shown with the same confidence as a
 * fresh reading.
 */
export type FleetStatus =
  | 'available'
  | 'in_service'
  | 'moving'
  | 'idle'
  | 'maintenance'
  | 'out_of_service'
  | 'offline'
  | 'stale';

export const FLEET_STATUS_TONE: Record<FleetStatus, Tone> = {
  available: 'positive',
  in_service: 'info',
  moving: 'positive',
  idle: 'neutral',
  maintenance: 'attention',
  out_of_service: 'critical',
  offline: 'neutral',
  stale: 'attention',
};

export const FLEET_STATUS_LABEL: Record<FleetStatus, string> = {
  available: 'Available',
  in_service: 'In service',
  moving: 'Moving',
  idle: 'Idle',
  maintenance: 'In maintenance',
  out_of_service: 'Out of service',
  offline: 'Offline',
  stale: 'Stale data',
};

/**
 * Resolve a delta into a tone.
 *
 * `higherIsBetter` is REQUIRED rather than defaulted, deliberately. The whole
 * reason this helper exists is that the previous `trend.isPositive` API let a
 * caller forget the question entirely and get "up is green" by default —
 * which is the wrong answer for cost per km, fuel spend, overdue services,
 * incident counts and downtime, i.e. for most of the numbers on this
 * platform's dashboards. Making it required forces the decision at the call
 * site, where the person writing it knows the metric.
 *
 * Returns 'neutral' for a zero (or absent) delta: "unchanged" is not good
 * news or bad news, and colouring it implies a movement that did not happen.
 */
export function deltaTone(delta: number | null | undefined, higherIsBetter: boolean): Tone {
  if (delta === null || delta === undefined || !Number.isFinite(delta) || delta === 0) {
    return 'neutral';
  }
  const improving = delta > 0 ? higherIsBetter : !higherIsBetter;
  return improving ? 'positive' : 'critical';
}

// frontend/shared/ui/evidence/EvidencePopover.tsx
//
// PART 9 -- "WHERE DID THIS NUMBER COME FROM?" Every figure this
// platform derives (a trip's distance, a cost/km, a fuel-efficiency
// ratio) already carries machine-readable provenance -- either the
// `DistanceMeasurement`/`TripDistanceEvidence` shapes in
// shared/types/evidence.types.ts, or the pre-existing `Labeled<T>`
// pattern from the fuel/expense intelligence reports. This component is
// the one place either shape gets turned into a reader-facing
// "how calculated" explanation, so every report/detail page that wires
// it in uses the same visual language instead of inventing its own.
//
// DELIBERATELY NOT a replacement for LabeledText/LabeledMetric (fuel +
// expense reports already use those everywhere, and changing their
// default rendering risks regressing two working reports for no
// reason). This is an ADDITIVE affordance: a small inline trigger next
// to a figure that opens a popover with the fuller justification. Wire
// it in wherever a figure's provenance is the kind of thing a reader
// might reasonably ask "how do you know that?" about.

'use client';

import type { ReactNode } from 'react';
import { Info } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/frontend/shared/ui/navigation/popover';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { formatDate } from '@/shared/utils/date.utils';

/**
 * Visual tone for the source/status badge. Mirrors the two provenance
 * vocabularies this platform has (DistanceSource; FindingStatus) onto
 * one shared set of colors, so "map-derived" and "ESTIMATED" read with
 * a similarly cautious visual weight without this component needing to
 * know about either type.
 */
export type EvidenceTone = 'fact' | 'calculated' | 'estimated' | 'unavailable' | 'issue';

const TONE_BADGE_CLASS: Record<EvidenceTone, string> = {
  fact: 'border-success text-success',
  calculated: 'border-info text-info',
  estimated: 'border-warning text-warning',
  unavailable: 'text-muted-foreground',
  issue: 'border-warning text-warning',
};

export interface EvidencePopoverProps {
  /** What the reader clicks/hovers to open the popover -- usually a small info icon placed right after the figure. Defaults to a standalone info icon when omitted. */
  trigger?: ReactNode;
  /** Short heading, e.g. "Distance — how calculated". */
  title: string;
  /** Badge text, e.g. "Map-derived", "Estimated", "GPS-observed". */
  sourceLabel: string;
  sourceTone: EvidenceTone;
  /** Plain-English description of HOW this specific figure was produced, e.g. "Routing engine (OSRM) over 3 stops". */
  method?: string;
  calculatedAt?: string | Date;
  /** Optional pointer back to the underlying record, shown as a small monospace line for anyone who wants to verify it. */
  reference?: string;
  /** Why this is estimated/unavailable/flagged -- shown last, visually distinct. */
  reason?: string;
  className?: string;
}

/** Small, unobtrusive default trigger -- an info glyph, not a full button, so it doesn't compete with the figure it annotates. */
function DefaultTrigger() {
  return (
    <button
      type="button"
      aria-label="How was this calculated?"
      className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted align-middle"
    >
      <Info className="h-3.5 w-3.5" />
    </button>
  );
}

export function EvidencePopover({
  trigger,
  title,
  sourceLabel,
  sourceTone,
  method,
  calculatedAt,
  reference,
  reason,
  className,
}: EvidencePopoverProps) {
  return (
    <Popover>
      <PopoverTrigger className={className}>{trigger ?? <DefaultTrigger />}</PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="flex items-center justify-between gap-2">
          <p className="text-body-sm font-medium">{title}</p>
          <Badge variant="outline" className={TONE_BADGE_CLASS[sourceTone]}>
            {sourceLabel}
          </Badge>
        </div>
        {method && <p className="text-caption text-muted-foreground">{method}</p>}
        {calculatedAt && (
          <p className="text-caption text-muted-foreground">
            Calculated {formatDate(calculatedAt, 'MMM dd, yyyy HH:mm')}
          </p>
        )}
        {reference && (
          <p className="text-caption font-mono text-muted-foreground break-all">Ref: {reference}</p>
        )}
        {reason && (
          <p className="text-caption text-warning border-t pt-2 mt-1">{reason}</p>
        )}
      </PopoverContent>
    </Popover>
  );
}

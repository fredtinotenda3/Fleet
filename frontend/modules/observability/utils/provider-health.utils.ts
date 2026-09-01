// frontend/modules/observability/utils/provider-health.utils.ts
//
// Pure functions only -- no React, no fetch. Kept separate from the
// components so the formatting/labeling logic can be unit tested under
// tests/unit (which runs in Jest's plain 'node' environment, with no
// jsdom or React Testing Library wired up in this repo) without
// needing to render anything.

import type { ProviderHealthStatus, OutboxStatus } from '../types';

/**
 * The Badge component (frontend/shared/ui/data-display/badge.tsx) only
 * ships default/secondary/destructive/outline/ghost/link variants --
 * there's no built-in 'success' or 'warning'. The rest of the app's
 * convention for a status dot (see EagleTrackConfigSection.tsx,
 * FuelStationsTable.tsx) is variant="outline" plus a semantic
 * `border-success text-success` / `border-warning text-warning`
 * className and a matching dot color, which is what this mapping
 * feeds into.
 */
export interface StatusPresentation {
  badgeVariant: 'outline' | 'destructive' | 'secondary';
  badgeClassName: string;
  dotClassName: string;
}

const STATUS_PRESENTATION: Record<ProviderHealthStatus, StatusPresentation> = {
  healthy: {
    badgeVariant: 'outline',
    badgeClassName: 'border-success text-success',
    dotClassName: 'bg-success',
  },
  degraded: {
    badgeVariant: 'outline',
    badgeClassName: 'border-warning text-warning',
    dotClassName: 'bg-warning',
  },
  unavailable: {
    badgeVariant: 'destructive',
    badgeClassName: '',
    dotClassName: 'bg-destructive',
  },
  unknown: {
    badgeVariant: 'secondary',
    badgeClassName: '',
    dotClassName: 'bg-muted-foreground',
  },
};

/**
 * Maps a provider (or aggregate) status to how it should render.
 * 'unknown' intentionally renders as neutral 'secondary' rather than a
 * warning color -- it means "no data yet" (e.g. a provider with zero
 * configured tenants), not "something is wrong".
 */
export function statusPresentation(status: ProviderHealthStatus): StatusPresentation {
  return STATUS_PRESENTATION[status] ?? STATUS_PRESENTATION.unknown;
}

/** Human-facing label for a status value. Capitalized, no jargon. */
export function statusLabel(status: ProviderHealthStatus): string {
  switch (status) {
    case 'healthy':
      return 'Healthy';
    case 'degraded':
      return 'Degraded';
    case 'unavailable':
      return 'Unavailable';
    case 'unknown':
    default:
      return 'Unknown';
  }
}

/**
 * Formats a duration in milliseconds as a short human string, e.g.
 * "5m", "2h 15m", "3d 4h". Returns null for null/negative input so
 * callers can decide how to render "not applicable" (this function
 * doesn't know if that means "healthy" or "no data").
 */
export function formatDuration(ms: number | null | undefined): string | null {
  if (ms === null || ms === undefined || ms < 0 || Number.isNaN(ms)) {
    return null;
  }

  const totalMinutes = Math.floor(ms / 60_000);
  if (totalMinutes < 1) {
    return '<1m';
  }

  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  }
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  return `${minutes}m`;
}

/**
 * Formats an ISO timestamp (or null) for the "last sync" column.
 * Returns 'Never' rather than a dash or empty string, since for a
 * newly-added provider "never synced" is meaningful information, not
 * missing data.
 */
export function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) {
    return 'Never';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return 'Never';
  }
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/**
 * Turns a backend neutral error category (e.g. 'rotate_credentials')
 * into a readable label (e.g. 'Rotate credentials'). Never touches
 * vendor error text -- the backend only ever sends categories here.
 */
export function formatErrorCategory(category: string | null | undefined): string | null {
  if (!category) {
    return null;
  }
  const spaced = category.replace(/[_-]+/g, ' ').trim();
  if (!spaced) {
    return null;
  }
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// ---------------------------------------------------------------------------
// Outbox status presentation/formatting

/**
 * Maps an outbox status to how it should render. 'dead_letter' is
 * treated as destructive regardless of count -- per the backend
 * route's own comment, a non-zero dead-letter count means domain
 * events are being PERMANENTLY LOST, which is the one number on this
 * dashboard that should never look calm. 'processing' and 'pending'
 * are normal operating states, not problems, so they render neutral.
 */
export function outboxStatusPresentation(status: OutboxStatus): StatusPresentation {
  switch (status) {
    case 'dead_letter':
      return STATUS_PRESENTATION.unavailable;
    case 'processed':
      return STATUS_PRESENTATION.healthy;
    case 'processing':
    case 'pending':
    default:
      return STATUS_PRESENTATION.unknown;
  }
}

/** Human-facing label for an outbox status, e.g. 'dead_letter' -> 'Dead letter'. */
export function outboxStatusLabel(status: OutboxStatus): string {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'processing':
      return 'Processing';
    case 'processed':
      return 'Processed';
    case 'dead_letter':
      return 'Dead letter';
    default:
      return status;
  }
}

/**
 * Formats a raw count for display. Distinguishes 0 (a real, healthy
 * value worth showing plainly) from missing data -- callers pass
 * undefined only when a field genuinely isn't present in the response,
 * which formatCount then renders as an em dash rather than a
 * misleading zero.
 */
export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '\u2014';
  }
  return value.toLocaleString();
}

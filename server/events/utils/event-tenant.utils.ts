// server/events/utils/event-tenant.utils.ts
//
// ---------------------------------------------------------------------
// Why this file exists
// ---------------------------------------------------------------------
// server/tenancy/tenant-scope.ts closed off the fail-open hole where a
// missing/legacy tenantId ('default' | 'system' | 'super_admin') meant
// "see everything" on the read/write path (BaseRepository, its
// subclasses, and every controller that calls getTenantFromRequest()).
//
// The event-bus layer (outbox publisher, audit middleware, and every
// IEventHandler in server/events/handlers/**) was never migrated onto
// that model. Every one of these previously did:
//
//   const tenantId = (event.metadata?.tenantId as string) || 'default';
//
// which is the exact fail-open literal tenant-scope.ts exists to kill.
// Concretely this caused two distinct problems:
//
//   1. Handlers that write through BaseRepository (OutboxPublisher ->
//      OutboxRepository.create(), which calls assertUsableAsTenantId())
//      now THROW on a missing tenantId instead of silently mislabeling
//      the row -- so an event published without tenant metadata could
//      take down outbox persistence / downstream processing entirely.
//   2. Handlers that write through repositories with NO scope check at
//      all (AuditLogRepository is intentionally append-only and never
//      validated its caller-supplied tenantId) silently wrote 'default'
//      into the immutable, hash-chained audit ledger -- an audit entry
//      permanently orphaned from every real organization's queries.
//
// resolveEventTenant() gives every handler a single, safe way to ask
// "what tenant is this event scoped to", with the SAME fail-closed
// semantics as resolveTenantScope(): a missing or legacy tenantId is
// never coerced into a value that gets treated as real. Callers get an
// explicit `ok: false` and are expected to skip (and log) rather than
// invent a sentinel and proceed.

import { IEvent } from '../base/IEvent';
import { isLegacySentinelTenant } from '@/server/tenancy/tenant-scope';
import { monitoring } from '@/infrastructure/monitoring/logger';

export type EventTenantResolution =
  | { ok: true; tenantId: string }
  | { ok: false; reason: 'missing' | 'legacy_sentinel' };

export function resolveEventTenant(event: IEvent): EventTenantResolution {
  const raw = event.metadata?.tenantId;

  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return { ok: false, reason: 'missing' };
  }

  const tenantId = raw.trim();

  if (isLegacySentinelTenant(tenantId)) {
    return { ok: false, reason: 'legacy_sentinel' };
  }

  return { ok: true, tenantId };
}

/**
 * Convenience wrapper for the common case: resolve the event's tenant,
 * and if it's missing/invalid, log a warning naming the handler and
 * event, then return null so the caller can bail out of `handle()`
 * early instead of persisting or acting on unscoped data.
 */
export function resolveEventTenantOrWarn(
  event: IEvent,
  handlerName: string
): string | null {
  const resolution = resolveEventTenant(event);
  if (resolution.ok) {
    return resolution.tenantId;
  }

  monitoring.logWarn(
    `${handlerName}: skipping event with no valid tenant scope (${resolution.reason})`,
    { eventId: event.eventId, eventName: event.eventName, reason: resolution.reason }
  );
  return null;
}
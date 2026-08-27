// app/api/observability/outbox/route.ts
//
// PHASE 7 -- the outbox operational surface.
//
// Phase 3 built `countByStatus()` and `getDeadLetteredForTenant()` and
// nothing exposed either, so an operator could not answer "are events
// being dropped?" without a Mongo shell.
//
// `dead_letter` is the number that matters. A non-zero, non-decreasing
// dead-letter count means domain events are being permanently lost --
// exactly the failure Phase 3 existed to prevent, and exactly the one
// nobody notices without a surface. Counts are also published as a
// Prometheus gauge (fleet_outbox_backlog) so it can be alerted on
// rather than only looked at.
//
// PLATFORM-SCOPED. countByStatus() is cross-tenant by design (the
// processor is a platform job), so this endpoint is gated on
// PLATFORM_VIEW like the provider health surface. A tenant-scoped view
// of a tenant's OWN dead letters would be a different endpoint using
// getDeadLetteredForTenant, which is scoped through the base
// repository -- deliberately not added here, because nothing has asked
// for it and an unused endpoint is an unguarded one.
//
// The response carries COUNTS ONLY. No event payloads: an outbox row
// stores the full domain event, which can contain vehicle positions and
// driver identifiers, and this is a cross-tenant surface.
import { NextResponse } from 'next/server';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { outboxRepository } from '@/server/events/outbox/OutboxRepository';
import { telematicsObservability } from '@/modules/telematics/services/telematics-observability.service';

export const GET = withAuth(
  async () => {
    const counts = await outboxRepository.countByStatus();

    // Published to the registry on read. The processor could publish
    // these on every poll, but that would mean a Mongo aggregation every
    // few seconds forever; refreshing on scrape/inspection keeps the
    // cost proportional to how often anybody actually asks.
    telematicsObservability.recordOutboxBacklog(counts);

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      counts,
      // Stated so a reader is not left inferring it from a zero.
      deadLetterRequiresOperator: counts.dead_letter > 0,
    });
  },
  { permission: Permission.PLATFORM_VIEW }
);

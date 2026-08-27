import { NextResponse } from 'next/server';
import connectToDatabase from '@/infrastructure/database/mongodb';

interface DependencyCheck {
  status: 'ready' | 'not_ready';
  latencyMs?: number;
  error?: string;
}

async function checkDatabase(): Promise<DependencyCheck> {
  const start = Date.now();
  try {
    const db = await connectToDatabase();
    await db.command({ ping: 1 });
    return { status: 'ready', latencyMs: Date.now() - start };
  } catch (error) {
    return { status: 'not_ready', latencyMs: Date.now() - start, error: String(error) };
  }
}

async function checkRedis(): Promise<DependencyCheck> {
  if (!process.env.REDIS_URL) {
    return { status: 'ready', latencyMs: 0 };
  }
  const start = Date.now();
  try {
    const Redis = (await import('ioredis')).default;
    const client = new Redis(process.env.REDIS_URL, { connectTimeout: 2000, maxRetriesPerRequest: 1 });
    await client.ping();
    await client.quit();
    return { status: 'ready', latencyMs: Date.now() - start };
  } catch (error) {
    return { status: 'not_ready', latencyMs: Date.now() - start, error: String(error) };
  }
}

/**
 * PHASE 7 -- INFORMATIONAL checks.
 *
 * Telematics providers and the outbox backlog are reported but do NOT
 * affect readiness. That distinction is the whole design of this
 * endpoint and it is worth being explicit about.
 *
 * A readiness probe answers one question: should the load balancer send
 * this instance traffic? Mongo and Redis are HARD dependencies -- if
 * they are down the instance cannot serve anything, so it must leave the
 * pool.
 *
 * A telematics vendor being unreachable is not that. The platform still
 * serves vehicles, drivers, expenses, reporting and every other
 * function; only live positions are stale. Failing readiness on a THIRD
 * PARTY'S outage would pull every instance out of the pool and convert a
 * vendor incident into a total outage -- the failure mode where the
 * health check causes the incident it was meant to reveal.
 *
 * The same applies to a dead-letter backlog: events are queued, not
 * lost, and taking the app offline would stop the processor draining
 * them.
 *
 * Both are surfaced so an operator polling this endpoint sees them, and
 * both are alertable as Prometheus metrics. Neither gates the 200.
 */
async function checkTelematics(): Promise<DependencyCheck & { providers?: number; unhealthy?: number }> {
  const start = Date.now();
  try {
    const { providerHealthService } = await import(
      '@/modules/telematics/services/provider-health.service'
    );
    const aggregate = await providerHealthService.aggregateStatus();

    return {
      // Always 'ready' -- see above. The real signal is `status`.
      status: 'ready',
      latencyMs: Date.now() - start,
      providers: aggregate.providers,
      unhealthy: aggregate.unhealthy,
      ...(aggregate.status !== 'healthy' ? { error: `providers ${aggregate.status}` } : {}),
    };
  } catch (error) {
    // A failure to READ provider health is not a failure of the
    // platform. Reported, never fatal.
    return { status: 'ready', latencyMs: Date.now() - start, error: String(error) };
  }
}

async function checkOutbox(): Promise<DependencyCheck & { deadLetter?: number; pending?: number }> {
  const start = Date.now();
  try {
    const { outboxRepository } = await import('@/server/events/outbox/OutboxRepository');
    const counts = await outboxRepository.countByStatus();

    return {
      status: 'ready',
      latencyMs: Date.now() - start,
      deadLetter: counts.dead_letter,
      pending: counts.pending,
      ...(counts.dead_letter > 0
        ? { error: `${counts.dead_letter} event(s) dead-lettered` }
        : {}),
    };
  } catch (error) {
    return { status: 'ready', latencyMs: Date.now() - start, error: String(error) };
  }
}

/**
 * Readiness probe: "can this instance currently serve real traffic" —
 * checks every hard dependency. Orchestrators should pull the instance
 * OUT of the load-balancer pool (not restart it) while this returns 503.
 *
 * PHASE 7: telematics and outbox are reported alongside, informationally.
 * See the note above each for why they do not gate readiness.
 */
export async function GET() {
  const [database, redis, telematics, outbox] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkTelematics(),
    checkOutbox(),
  ]);

  // UNCHANGED: only the hard dependencies decide readiness, so existing
  // consumers of this probe see exactly the behaviour they did before.
  const ready = database.status === 'ready' && redis.status === 'ready';

  return NextResponse.json(
    {
      status: ready ? 'ready' : 'not_ready',
      checks: { database, redis, telematics, outbox },
      timestamp: new Date().toISOString(),
    },
    { status: ready ? 200 : 503 }
  );
}
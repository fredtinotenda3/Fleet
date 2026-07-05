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
 * Readiness probe: "can this instance currently serve real traffic" —
 * checks every hard dependency. Orchestrators should pull the instance
 * OUT of the load-balancer pool (not restart it) while this returns 503.
 */
export async function GET() {
  const [database, redis] = await Promise.all([checkDatabase(), checkRedis()]);
  const ready = database.status === 'ready' && redis.status === 'ready';

  return NextResponse.json(
    { status: ready ? 'ready' : 'not_ready', checks: { database, redis }, timestamp: new Date().toISOString() },
    { status: ready ? 200 : 503 }
  );
}
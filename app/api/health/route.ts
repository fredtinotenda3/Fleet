import { NextResponse } from 'next/server';
import connectToDatabase from '@/infrastructure/database/mongodb';
import { cacheConnection } from '@/infrastructure/cache/cache.service';
import { redisConnection } from '@/infrastructure/queue/queue.service';

export async function GET() {
  const checks = {
    database: await checkDatabase(),
    redis: await checkRedis(),
    queue: await checkQueue(),
    timestamp: new Date().toISOString(),
  };
  
  const isHealthy = Object.values(checks).every(check => 
    typeof check === 'object' ? check.status === 'healthy' : check
  );
  
  return NextResponse.json(checks, { status: isHealthy ? 200 : 503 });
}

async function checkDatabase(): Promise<{ status: string; latency: number }> {
  const start = Date.now();
  try {
    const db = await connectToDatabase();
    await db.command({ ping: 1 });
    const latency = Date.now() - start;
    return { status: 'healthy', latency };
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (_error) {
    return { status: 'unhealthy', latency: Date.now() - start };
  }
}

async function checkRedis(): Promise<{ status: string; latency: number }> {
  const start = Date.now();
  try {
    await cacheConnection.ping();
    const latency = Date.now() - start;
    return { status: 'healthy', latency };
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (_error) {
    return { status: 'unhealthy', latency: Date.now() - start };
  }
}

async function checkQueue(): Promise<{ status: string }> {
  try {
    await redisConnection.ping();
    return { status: 'healthy' };
  } catch {
    return { status: 'unhealthy' };
  }
}
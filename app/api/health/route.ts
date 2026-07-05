// app/api/health/route.ts

import { NextResponse } from 'next/server';
import connectToDatabase from '@/infrastructure/database/mongodb';

interface HealthCheck {
  status: 'healthy' | 'unhealthy';
  latency?: number;
  error?: string;
}

async function checkDatabase(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    const db = await connectToDatabase();
    await db.command({ ping: 1 });
    return { status: 'healthy', latency: Date.now() - start };
  } catch (error) {
    return {
      status: 'unhealthy',
      latency: Date.now() - start,
      error: String(error),
    };
  }
}

async function checkRedis(): Promise<HealthCheck> {
  // Redis is optional — if not configured, report as skipped
  if (!process.env.REDIS_URL) {
    return { status: 'healthy', latency: 0 };
  }

  const start = Date.now();
  try {
    // Lazy-load ioredis only if REDIS_URL is present so the build
    // succeeds in environments without Redis
    const Redis = (await import('ioredis')).default;
    const client = new Redis(process.env.REDIS_URL, {
      connectTimeout: 2000,
      maxRetriesPerRequest: 1,
    });
    await client.ping();
    await client.quit();
    return { status: 'healthy', latency: Date.now() - start };
  } catch (error) {
    return {
      status: 'unhealthy',
      latency: Date.now() - start,
      error: String(error),
    };
  }
}

export async function GET() {
  const [database, redis] = await Promise.all([
    checkDatabase(),
    checkRedis(),
  ]);

  const checks = {
    database,
    redis,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '0.0.1',
    environment: process.env.NODE_ENV || 'development',
  };

  const isHealthy =
    database.status === 'healthy' && redis.status === 'healthy';

  return NextResponse.json(checks, { status: isHealthy ? 200 : 503 });
}
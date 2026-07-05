import { NextResponse } from 'next/server';

/**
 * Liveness probe: "is the process alive enough to answer at all" — no
 * dependency checks. Orchestrators should RESTART the instance if this
 * fails/times out. Deliberately not wrapped in withAuth (must be reachable
 * with zero auth or DB dependency).
 */
export async function GET() {
  return NextResponse.json({ status: 'alive', timestamp: new Date().toISOString() });
}
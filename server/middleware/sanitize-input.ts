// server/middleware/sanitize-input.ts

import { NextRequest, NextResponse } from 'next/server';

function sanitizeValue(value: string): string {
  return value.replace(/[$]/g, '').replace(/[<>]/g, '').trim();
}

function sanitizeObject(obj: unknown): unknown {
  if (typeof obj === 'string') return sanitizeValue(obj);
  if (Array.isArray(obj)) return obj.map(sanitizeObject);
  if (obj !== null && typeof obj === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
      sanitized[key] = sanitizeObject(val);
    }
    return sanitized;
  }
  return obj;
}

export async function sanitizeInput(
  req: NextRequest,
  handler: (req: NextRequest, sanitizedBody?: unknown) => Promise<NextResponse>
): Promise<NextResponse> {
  let sanitizedBody: unknown = undefined;

  if (req.method !== 'GET' && req.method !== 'DELETE') {
    try {
      const body = await req.clone().json();
      sanitizedBody = sanitizeObject(body);
    } catch {
      // No body or invalid JSON — proceed without
    }
  }

  return handler(req, sanitizedBody);
}
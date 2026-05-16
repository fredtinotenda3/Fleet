// server/middleware/sanitize-input.ts

import { NextRequest, NextResponse } from 'next/server';
import { sanitization } from '@/infrastructure/security/sanitization';

export async function sanitizeInput(
  req: NextRequest,
  handler: (req: NextRequest, sanitizedBody?: any) => Promise<NextResponse>
): Promise<NextResponse> {
  // Sanitize query params
  const url = new URL(req.url);
  url.searchParams.forEach((value, key) => {
    const sanitized = sanitization.sanitizeString(value);
    if (sanitized !== value) {
      url.searchParams.set(key, sanitized);
    }
  });
  
  // Sanitize body if present
  let sanitizedBody: any = undefined;
  if (req.method !== 'GET' && req.method !== 'DELETE') {
    try {
      const body = await req.clone().json();
      sanitizedBody = sanitization.sanitizeInput(body);
    } catch {
      // No body or invalid JSON
    }
  }
  
  // Create new request with sanitized URL
  const sanitizedReq = new NextRequest(url.toString(), req);
  
  return handler(sanitizedReq, sanitizedBody);
}
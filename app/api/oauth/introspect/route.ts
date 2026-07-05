// app/api/oauth/introspect/route.ts

import { NextRequest } from 'next/server';
import { oauthClientController } from '@/modules/oauth/controllers/oauth-client.controller';

/**
 * OAuth 2.0 Introspection endpoint.
 * Requires Basic Auth with client credentials.
 */
export async function POST(req: NextRequest) {
  return oauthClientController.introspect(req);
}
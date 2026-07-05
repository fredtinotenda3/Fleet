// app/api/oauth/token/route.ts

import { NextRequest } from 'next/server';
import { oauthClientController } from '@/modules/oauth/controllers/oauth-client.controller';

/**
 * OAuth 2.0 Token endpoint.
 * This is intentionally NOT wrapped with withAuth() - clients authenticate
 * via client_id + client_secret in the request body.
 */
export async function POST(req: NextRequest) {
  return oauthClientController.token(req);
}
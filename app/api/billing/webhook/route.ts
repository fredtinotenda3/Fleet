// app/api/billing/webhook/route.ts

import { NextRequest } from 'next/server';
import { billingController } from '@/modules/billing/controllers/billing.controller';

/**
 * INTENTIONALLY NOT wrapped in withAuth(). This route is called by
 * Paynow's servers, not by an authenticated user â€” there is no NextAuth
 * session to check. Trust is established entirely by
 * PaynowClient.verifyResultHash() inside billingController.handleWebhook,
 * which is mandatory and checked before any field in the payload is
 * trusted. Do not add withAuth() here; it would reject every legitimate
 * payment notification since Paynow never sends a session cookie/JWT.
 *
 * This route is also excluded from the root middleware.ts matcher
 * (which now excludes all of /api/* from its page-auth redirect logic)
 * for the same reason â€” see middleware.ts comments.
 */
export async function POST(req: NextRequest) {
  return billingController.handleWebhook(req);
}
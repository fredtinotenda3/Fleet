// app/api/auth/[...nextauth]/route.ts

import NextAuth from 'next-auth';
import { NextRequest } from 'next/server';
import { authOptions } from '@/lib/authOptions';
import { buildDynamicOidcProvider } from '@/lib/sso-provider.factory';

/**
 * SCAFFOLDING NOTE (SSO/OIDC integration point):
 * next-auth v4's provider list is normally fixed at module load time.
 * To support per-organization OIDC connections stored in MongoDB
 * (see modules/security/services/sso.service.ts) without a full
 * multi-tenant auth rewrite, this handler rebuilds the options object
 * PER REQUEST, injecting a single dynamically-resolved "sso" OAuth
 * provider when a connection is identified — via the `connection` query
 * param (set by the login page after calling /api/auth/sso/discover) or
 * the `sso_connection` cookie (set immediately before redirecting into
 * the OAuth flow, since the callback GET request won't carry the
 * original query param).
 *
 * This keeps the callback URL stable at /api/auth/callback/sso
 * regardless of which organization's IdP is being used. It is
 * deliberately conservative scaffolding: production hardening should
 * add IdP-issued `iss` validation on callback, replay protection beyond
 * next-auth's built-in state/PKCE, and an explicit session-federation
 * policy for how SSO-authenticated users map onto existing
 * OrganizationMember records (currently: implicitly provisioned into
 * the connection's organizationId with its configured defaultRole via
 * lib/authOptions.ts's jwt() callback — no OrganizationMember row is
 * created automatically, so `hasRole`/`hasPermission` checks that read
 * organization membership rather than the JWT's roles claim will need
 * a follow-up provisioning step before this is fully production-ready).
 */
async function resolveConnectionId(req: NextRequest): Promise<string | undefined> {
  return req.nextUrl.searchParams.get('connection') || req.cookies.get('sso_connection')?.value || undefined;
}

// NextAuth's own type declarations don't model the App Router
// per-request handler signature (req, ctx) => Response, so the
// handler itself is typed loosely here (not the NextAuth(options)
// call) — this avoids depending on a `@ts-expect-error` that TS may or
// may not consider "used" across next-auth version bumps.
type RouteContext = { params?: Promise<Record<string, string | string[]>> };

async function handler(req: NextRequest, ctx: RouteContext) {
  const connectionId = await resolveConnectionId(req);
  const options = { ...authOptions, providers: [...authOptions.providers] };

  if (connectionId) {
    const dynamicProvider = await buildDynamicOidcProvider(connectionId);
    if (dynamicProvider) {
      options.providers.push(dynamicProvider);
    }
  }

  const nextAuthHandler = NextAuth(options) as unknown as (
    req: NextRequest,
    ctx: RouteContext
  ) => Promise<Response>;

  return nextAuthHandler(req, ctx);
}

export { handler as GET, handler as POST };
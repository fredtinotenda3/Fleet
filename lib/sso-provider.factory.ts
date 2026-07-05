// lib/sso-provider.factory.ts

import { ssoService } from '@/modules/security/services/sso.service';

/**
 * Builds a generic OAuth/OIDC provider config for next-auth from a
 * stored SsoConnection. Kept separate from authOptions.ts so it can be
 * imported lazily (avoids pulling MongoDB access into every cold start
 * of the NextAuth handler when no dynamic connection is requested).
 */
export async function buildDynamicOidcProvider(connectionId: string): Promise<any | null> {
  const resolved = await ssoService.resolveForAuth(connectionId);
  if (!resolved) return null;

  const { connection, clientSecret } = resolved;

  return {
    id: 'sso',
    name: connection.displayName,
    type: 'oauth',
    version: '2.0',
    authorization: {
      url: connection.authorizationEndpoint,
      params: { scope: connection.scopes.join(' ') },
    },
    token: connection.tokenEndpoint,
    userinfo: connection.userinfoEndpoint,
    clientId: connection.clientId,
    clientSecret,
    checks: ['pkce', 'state'],
    idToken: true,
    profile(profile: Record<string, unknown>) {
      return {
        id: String(profile.sub),
        name: (profile.name as string) || (profile.email as string) || 'SSO User',
        email: profile.email as string,
        // Carried through to the jwt() callback in lib/authOptions.ts so
        // it can attach organizationId/defaultRole to the resulting session.
        ssoConnectionId: connection._id,
        ssoOrganizationId: connection.organizationId,
        ssoDefaultRole: connection.defaultRole,
      } as any;
    },
  };
}
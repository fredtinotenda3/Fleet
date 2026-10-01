// app/page.tsx
//
// FIX: this route was a literal `<h1>Fleet Management</h1>` with no
// redirect, and `middleware.ts` treats `/` as a PUBLIC path -- so an
// authenticated user who navigated to the site root (typed the domain,
// clicked a bookmark, hit the logo) landed on a dead page with no
// navigation, no session indicator and no way forward except editing the
// URL. It looked like the app had logged them out.
//
// The root now resolves server-side to the right destination for whoever
// is asking:
//
//   * unauthenticated            -> /auth/login
//   * authenticated              -> resolveLandingPath(roles)
//
// Done as a server component with `redirect()` rather than a client-side
// effect so there is no flash of the wrong page and no hydration round
// trip before the user is moved.

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import {
  verifyAccessTokenEdge,
  ACCESS_TOKEN_COOKIE_NAME,
} from '@/infrastructure/security/edge-token-verify';
import { resolveLandingPath } from '@/server/permissions/landing';
import { shouldRouteToSetupCentre } from '@/server/onboarding/setup-landing.service';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value;

  if (!token) {
    redirect('/auth/login');
  }

  /**
   * Reuses the same edge verifier middleware.ts uses, rather than a
   * second decode path. A divergence between "what middleware considers
   * authenticated" and "what this page considers authenticated" produces
   * a redirect loop: the page sends the user to /dashboard, middleware
   * bounces them back to /auth/login, the login page sees a valid
   * session and returns them to /. One verifier, one answer.
   */
  const verified = await verifyAccessTokenEdge(token);

  if (!verified) {
    redirect('/auth/login');
  }

  /**
   * ADAPTIVE ONBOARDING: a first-time setup-permission holder whose
   * organization has zero vehicles and has neither finished nor
   * explicitly skipped the Setup Centre lands there instead of their
   * usual page. This is this function's ONLY new behaviour -- every
   * other login still resolves exactly as it did before
   * (resolveLandingPath is untouched), and shouldRouteToSetupCentre
   * fails closed (false) on any error, so it can never turn into a
   * redirect loop or a login failure.
   */
  if (await shouldRouteToSetupCentre(verified.roles ?? [], verified.tenantId)) {
    redirect('/setup');
  }

  redirect(resolveLandingPath(verified.roles ?? []));
}

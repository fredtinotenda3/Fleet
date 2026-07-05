
// app/auth/mfa-verify/page.tsx
//
// Standalone step-up MFA verification page. In this app the login flow
// (LoginForm -> MfaVerificationForm) is handled inline on /auth/login
// without a page navigation; this route exists as a direct-linkable
// fallback (e.g. from an email or a step-up-required redirect).

import { MfaVerifyPage } from '@/frontend/modules/auth/pages/MfaVerifyPage';

export default function Page() {
  return <MfaVerifyPage />;
}


// frontend/modules/auth/routes/index.ts
//
// Route path constants for this module, consumed by shared/config/routes.ts
// and by in-module Link/router.push calls so paths aren't duplicated
// as magic strings across components.

export const AUTH_ROUTES = {
  login: '/auth/login',
  forgotPassword: '/auth/forgot-password',
  resetPassword: '/auth/reset-password',
  mfaEnroll: '/auth/mfa-enroll',
  mfaVerify: '/auth/mfa-verify',
  backupCodes: '/auth/backup-codes',
  sessions: '/auth/sessions',
  profile: '/auth/profile',
  changePassword: '/auth/change-password',
  accountSecurity: '/auth/account-security',
} as const;

export type AuthRouteKey = keyof typeof AUTH_ROUTES;
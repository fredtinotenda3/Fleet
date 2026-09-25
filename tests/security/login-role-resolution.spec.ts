// tests/security/login-role-resolution.spec.ts
//
// Regression coverage for a real privilege bug found while tracing a
// Willsgrove member login incident: the actual login endpoint the UI
// calls (`POST /api/auth/token` -> TokenController.login,
// modules/security/controllers/token.controller.ts) minted every access
// token's `roles` claim from `admin.roles` -- a PLURAL array field that
// no ordinary account-creation path in this codebase ever writes.
// `OrganizationService.createOrganization()`'s owner account and
// `OrganizationService.addMemberDirect()`'s member accounts both write
// only the legacy SINGULAR `Role` field (see the `User` interface in
// lib/authOptions.ts). So `admin.roles` was undefined for essentially
// every real account, and the fallback -- correctly VIEWER, not the
// dangerous super_admin default this exact fallback used to have --
// fired unconditionally: every login through this endpoint downgraded
// the account to VIEWER regardless of its real assigned role.
//
// `modules/security/services/refresh-token.service.ts`'s
// `loadUserClaims()` (used on token refresh) already resolved the
// singular field correctly, via ITS OWN hand-copied LEGACY_ROLE_MAP --
// which had itself drifted out of sync with the canonical map in
// lib/authOptions.ts, missing five roles added in a later phase
// (organization_admin/branch_manager/department_manager/
// workshop_manager/supervisor). So even the "correct" path was wrong
// for those five roles.
//
// THE FIX: both call sites now resolve the singular `Role` field
// through the ONE exported `resolveRole()` in lib/authOptions.ts,
// instead of a second, independently-maintained copy of the mapping.
// This suite pins that wiring at the source level (so a future edit
// that reintroduces a local copy, or drops back to the VIEWER-only
// fallback, fails a test immediately) and exercises resolveRole()
// itself directly against every role this codebase assigns, since that
// function is now the single source of truth for both call sites.

import * as fs from 'fs';
import * as path from 'path';
import { resolveRole } from '../../lib/authOptions';
import { Role } from '../../server/permissions/roles';

const ROOT = path.resolve(__dirname, '..', '..');

describe('resolveRole(): single source of truth for legacy tbladmin.Role mapping', () => {
  it('maps every legacy role string this codebase assigns to its modern Role enum value', () => {
    const cases: Array<[string, Role]> = [
      ['admin', Role.ORGANIZATION_OWNER],
      ['super_admin', Role.SUPER_ADMIN],
      ['organization_owner', Role.ORGANIZATION_OWNER],
      ['organization_admin', Role.ORGANIZATION_ADMIN],
      ['branch_manager', Role.BRANCH_MANAGER],
      ['department_manager', Role.DEPARTMENT_MANAGER],
      ['fleet_manager', Role.FLEET_MANAGER],
      ['workshop_manager', Role.WORKSHOP_MANAGER],
      ['supervisor', Role.SUPERVISOR],
      ['accountant', Role.ACCOUNTANT],
      ['dispatcher', Role.DISPATCHER],
      ['driver', Role.DRIVER],
      ['mechanic', Role.MECHANIC],
      ['auditor', Role.AUDITOR],
      ['viewer', Role.VIEWER],
    ];
    for (const [raw, expected] of cases) {
      expect(resolveRole(raw)).toBe(expected);
      // Case/whitespace tolerance, since tbladmin.Role is hand-entered
      // by older bootstrap paths.
      expect(resolveRole(`  ${raw.toUpperCase()}  `)).toBe(expected);
    }
  });

  it('fails closed to VIEWER, never to a privileged role, for missing or unrecognized input', () => {
    expect(resolveRole(undefined)).toBe(Role.VIEWER);
    expect(resolveRole(null)).toBe(Role.VIEWER);
    expect(resolveRole('')).toBe(Role.VIEWER);
    expect(resolveRole('something-nobody-assigned')).toBe(Role.VIEWER);
  });
});

describe('login/refresh wiring: both resolve roles via the single resolveRole() export', () => {
  it('TokenController.login falls back to resolveRole(admin.Role), not a bare VIEWER default', () => {
    const source = fs.readFileSync(
      path.join(ROOT, 'modules/security/controllers/token.controller.ts'),
      'utf8'
    );
    expect(source).toContain("import { resolveRole } from '@/lib/authOptions'");
    expect(source).toContain('resolveRole(admin.Role)');
    // The old bug's exact shape must not reappear: a fallback that never
    // looks at the account's real role at all.
    expect(source).not.toMatch(/:\s*\[Role\.VIEWER\]\s*;/);
  });

  it('RefreshTokenService.loadUserClaims resolves via the shared resolveRole(), not a local copy of the map', () => {
    const source = fs.readFileSync(
      path.join(ROOT, 'modules/security/services/refresh-token.service.ts'),
      'utf8'
    );
    expect(source).toContain("import { resolveRole } from '@/lib/authOptions'");
    expect(source).toContain('resolveRole(admin.Role)');
    // The drifted, hand-duplicated map must not reappear.
    expect(source).not.toContain('const LEGACY_ROLE_MAP');
    expect(source).not.toContain('function resolveLegacyRole');
  });
});

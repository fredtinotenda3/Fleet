// lib/authOptions.ts

import CredentialsProvider from 'next-auth/providers/credentials';
import connectToDatabase from './mongodb';
import { compare } from 'bcryptjs';
import { AuthOptions } from 'next-auth';
import { ObjectId } from 'mongodb';
import { JWT } from 'next-auth/jwt';
import { randomUUID } from 'crypto';
import { sessionService } from '@/modules/security/services/session.service';
import { threatDetectionService } from '@/modules/security/services/threat-detection.service';
import { mfaService } from '@/modules/security/services/mfa.service';
import { Role } from '@/server/permissions/roles';
import {
  PLATFORM_SCOPE_TENANT_ID,
  isLegacySentinelTenant,
} from '@/server/tenancy/tenant-scope';

interface User {
  _id: ObjectId;
  Email: string;
  Password: string;
  FirstName: string;
  Role?: string;
  tenantId?: string;
}

interface CustomToken extends JWT {
  id?: string;
  email?: string;
  name?: string;
  role?: string;
  roles?: string[];
  tenantId?: string;
  sid?: string;
  authSource?: 'password' | 'sso';
}

interface CustomSessionUser {
  id: string;
  email: string;
  name: string;
  role?: string;
  roles?: string[];
  /**
   * FIX (critical -- total tenant-isolation bypass): authorize() now
   * returns the user's real tenantId so the jwt() callback below can
   * use it instead of hardcoding PRE_AUTH_BOOKKEEPING_TENANT for every login. See
   * the FIX note in the jwt() callback for the full story.
   */
  tenantId?: string;
}

const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

/**
 * Tenant id used ONLY for pre-authentication bookkeeping (brute-force
 * lockout counters, failed-login records) where no user tenant is known
 * yet. It is deliberately NOT a data-access scope: it never reaches a
 * repository query, and `resolveTenantScope()` rejects it if it ever
 * tries to.
 *
 * FIX (critical -- this constant was the root cause of the reported
 * cross-organization data leak). It used to be `'default'` AND was used
 * as the fallback tenant for real user sessions:
 *
 *   const userTenantId = user.tenantId || PRE_AUTH_BOOKKEEPING_TENANT;
 *
 * Every tbladmin account predating multi-tenancy has no tenantId, so
 * every one of them was assigned 'default' -- which
 * BaseRepository.getTenantFilter() treated as "skip tenant filtering,
 * return everything". Those users read across all organizations, and
 * any CSV import they ran stamped tenantId: 'default' onto the created
 * rows. See the fail-closed replacement in authorize() below.
 */
const PRE_AUTH_BOOKKEEPING_TENANT = 'pre-auth';

/**
 * FIX (critical): tbladmin.Role predates the Role enum in
 * server/permissions/roles.ts and stores a single free-text-ish string
 * (historically just 'admin' for every account created before
 * multi-tenancy/RBAC existed). Mapping it explicitly here -- rather
 * than the previous behavior of ignoring it completely and hardcoding
 * every password login to ['super_admin', 'organization_owner'] --
 * is what actually turns RBAC and tenant isolation on.
 *
 * ASSUMPTION THAT NEEDS PRODUCT CONFIRMATION: legacy Role: 'admin' is
 * mapped to ORGANIZATION_OWNER (full access within their own tenant),
 * not SUPER_ADMIN (cross-tenant platform access). If your existing
 * tbladmin records actually need platform-wide super_admin, update
 * this map -- do not change the default for 'admin' to SUPER_ADMIN
 * without confirming, since that re-opens the exact bypass this fix
 * closes for every account still carrying the legacy value.
 *
 * PHASE A (enterprise role/scope foundation): added entries for the
 * new BRANCH_MANAGER/DEPARTMENT_MANAGER/WORKSHOP_MANAGER/SUPERVISOR/
 * ORGANIZATION_ADMIN roles so any tbladmin record already carrying one
 * of these string values (e.g. seeded directly against the new schema,
 * or written by the organizations module's addMemberDirect) resolves
 * to the correct Role instead of silently falling back to VIEWER.
 */
const LEGACY_ROLE_MAP: Record<string, Role> = {
  admin: Role.ORGANIZATION_OWNER,
  super_admin: Role.SUPER_ADMIN,
  organization_owner: Role.ORGANIZATION_OWNER,
  organization_admin: Role.ORGANIZATION_ADMIN,
  branch_manager: Role.BRANCH_MANAGER,
  department_manager: Role.DEPARTMENT_MANAGER,
  fleet_manager: Role.FLEET_MANAGER,
  workshop_manager: Role.WORKSHOP_MANAGER,
  supervisor: Role.SUPERVISOR,
  accountant: Role.ACCOUNTANT,
  dispatcher: Role.DISPATCHER,
  driver: Role.DRIVER,
  mechanic: Role.MECHANIC,
  auditor: Role.AUDITOR,
  viewer: Role.VIEWER,
};

/** Unrecognized/missing role resolves to VIEWER (least privilege), not
 *  super_admin -- an unmapped role must never fail open. */
function resolveRole(rawRole: string | undefined | null): Role {
  if (!rawRole) return Role.VIEWER;
  return LEGACY_ROLE_MAP[rawRole.trim().toLowerCase()] ?? Role.VIEWER;
}

function extractIp(req: { headers?: Record<string, unknown> } | undefined): string | undefined {
  const forwarded = req?.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0]?.trim();
  return undefined;
}

function extractUserAgent(req: { headers?: Record<string, unknown> } | undefined): string | undefined {
  const ua = req?.headers?.['user-agent'];
  return typeof ua === 'string' ? ua : undefined;
}

export const authOptions: AuthOptions = {
  providers: [
    CredentialsProvider({
      id: 'credentials',
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'text' },
        password: { label: 'Password', type: 'password' },
        code: { label: 'MFA Code', type: 'text' },
        backupCode: { label: 'Backup Code', type: 'text' },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Missing email or password');
        }

        const email = credentials.email.toLowerCase();
        const ipAddress = extractIp(req as any);
        const userAgent = extractUserAgent(req as any);

        try {
          // Brute-force guard: reject outright while locked, without
          // even touching the database for a password comparison.
          const lockStatus = await threatDetectionService.isLocked(email, PRE_AUTH_BOOKKEEPING_TENANT);
          if (lockStatus.locked) {
            console.warn(`[authOptions] Rejected login for locked account: ${email}`);
            return null;
          }

          const db = await connectToDatabase();
          const user = await db.collection<User>('tbladmin').findOne({ Email: credentials.email });

          if (!user) {
            await threatDetectionService.recordLoginAttempt({
              email,
              tenantId: PRE_AUTH_BOOKKEEPING_TENANT,
              ipAddress,
              userAgent,
              success: false,
            });
            return null;
          }

          const isValidPassword = await compare(credentials.password, user.Password);
          if (!isValidPassword) {
            await threatDetectionService.recordLoginAttempt({
              email,
              tenantId: PRE_AUTH_BOOKKEEPING_TENANT,
              userId: user._id.toString(),
              ipAddress,
              userAgent,
              success: false,
            });
            return null;
          }

          // FIX (critical): this is the user's real data tenant --
          // previously computed here and then discarded, because it was
          // never put on the returned user object and the jwt()
          // callback hardcoded PRE_AUTH_BOOKKEEPING_TENANT for every password login
          // instead of reading it.
          const userId = user._id.toString();

          /**
           * FAIL CLOSED, with one deliberate and narrow exception.
           *
           * An ordinary account with no tenantId cannot log in, because
           * `|| 'default'` used to hand it platform-wide read access.
           *
           * BUT a genuine platform SUPER_ADMIN legitimately has NO
           * organization. Its scope comes from its role --
           * server/auth/auth-context.ts assigns it
           * PLATFORM_SCOPE_TENANT_ID at token time and never reads
           * tenantId. Requiring a tenantId here locked platform admins
           * out of their own installation, which is exactly what
           * happened after scripts/bootstrap-platform-admin.ts cleared
           * the legacy 'default' sentinel from a super_admin record.
           *
           * The exception is checked against the RESOLVED role (via
           * resolveRole + the roles array), not against a raw string, so
           * a record cannot self-declare platform access with an
           * arbitrary value.
           */
          const declaredRoles: string[] = Array.isArray((user as { roles?: unknown }).roles)
            ? ((user as { roles?: string[] }).roles as string[])
            : [];
          const isPlatformAdminAccount =
            resolveRole(user.Role) === Role.SUPER_ADMIN ||
            declaredRoles.map((r) => resolveRole(r)).includes(Role.SUPER_ADMIN);

          const rawTenantId =
            typeof user.tenantId === 'string' ? user.tenantId.trim() : '';

          /**
           * FIX (login blocker). This previously tested only for an EMPTY
           * tenantId. A legacy sentinel such as 'default' is a non-empty
           * string, so it sailed through this gate -- and then the first
           * tenant-scoped call below (mfaService.isEnabled) hit
           * resolveTenantScope('default'), which fails closed and throws.
           *
           * The result was a TenantScopeError surfacing verbatim on the
           * sign-in form:
           *
           *   "Rejected legacy sentinel tenant id "default"... run: npm
           *    run db:backfill-user-tenants"
           *
           * -- an internal diagnostic shown to an unauthenticated visitor,
           * naming an internal script (one that is now disabled), for an
           * account that simply has not been repaired yet.
           *
           * A sentinel is now treated exactly like a missing tenant:
           * refused here, quietly, before anything tenant-scoped runs.
           */
          const hasUsableTenant =
            rawTenantId.length > 0 && !isLegacySentinelTenant(rawTenantId);

          if (!hasUsableTenant && !isPlatformAdminAccount) {
            console.error(
              `[authOptions] Refusing login for ${email}: tenantId ` +
                `${rawTenantId ? `"${rawTenantId}" is a legacy sentinel` : 'is missing'} ` +
                'and the account is not a platform admin. Fix with: npm run db:repair'
            );
            return null;
          }

          /**
           * A platform admin with no organization carries the explicit
           * platform sentinel rather than an empty string, so that
           * nothing downstream has to interpret "" -- and so that
           * resolveTenantScope() recognises it as platform scope instead
           * of throwing.
           */
          const userTenantId = hasUsableTenant ? rawTenantId : PLATFORM_SCOPE_TENANT_ID;

          // MFA gate: password alone is not sufficient to complete
          // login when TOTP is enrolled and verified for this account.
          // The login page uses /api/auth/precheck first to know
          // whether to prompt for a code before calling signIn().
          const mfaEnabled = await mfaService.isEnabled(userId, userTenantId);
          if (mfaEnabled) {
            const { valid } = await mfaService.verifyCode(
              userId,
              userTenantId,
              credentials.code,
              credentials.backupCode
            );
            if (!valid) {
              await threatDetectionService.recordLoginAttempt({
                email,
                tenantId: PRE_AUTH_BOOKKEEPING_TENANT,
                userId,
                ipAddress,
                userAgent,
                success: false,
              });
              return null;
            }
          }

          await threatDetectionService.recordLoginAttempt({
            email,
            tenantId: PRE_AUTH_BOOKKEEPING_TENANT,
            userId,
            ipAddress,
            userAgent,
            success: true,
          });

          return {
            id: userId,
            name: user.FirstName,
            email: user.Email,
            role: resolveRole(user.Role),
            // FIX: previously omitted, so jwt() had no per-user tenant
            // to read even though it was already computed above.
            tenantId: userTenantId,
          };
        } catch (error) {
          console.error('Authentication error:', error);
          return null;
        }
      },
    }),
  ],
  pages: {
    signIn: '/auth/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: SESSION_MAX_AGE_SECONDS,
  },
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async jwt({ token, user, account }) {
      const customToken = token as CustomToken;

      if (user) {
        const ssoUser = user as unknown as {
          ssoConnectionId?: string;
          ssoOrganizationId?: string;
          ssoDefaultRole?: string;
        };

        customToken.id = user.id;
        customToken.email = user.email as string;

        if (account?.provider === 'sso' && ssoUser.ssoOrganizationId) {
          // SSO-authenticated session: scoped to the connection's
          // organization with its configured default role, rather than
          // whatever role the local credentials path resolves.
          customToken.role = ssoUser.ssoDefaultRole || Role.VIEWER;
          customToken.roles = [ssoUser.ssoDefaultRole || Role.VIEWER];
          customToken.tenantId = ssoUser.ssoOrganizationId;
          customToken.authSource = 'sso';
        } else {
          // FIX (critical -- was the root cause of a total
          // tenant-isolation bypass): this branch used to hardcode
          // every password login to
          //   roles = ['super_admin', 'organization_owner']
          //   tenantId = PRE_AUTH_BOOKKEEPING_TENANT ('default')
          // regardless of who the user actually was. Combined with
          // BaseRepository.getTenantFilter() treating tenantId ===
          // 'default' as "skip tenant filtering" and auth-context.ts
          // treating organization_owner as isSuperAdmin, that meant
          // every logged-in user -- not just real admins -- saw every
          // tenant's data everywhere and passed every permission check.
          // Now uses the actual per-user role/tenantId resolved in
          // authorize() above.
          const authUser = user as unknown as CustomSessionUser;
          const resolvedRole = resolveRole(authUser.role);
          customToken.role = resolvedRole;
          customToken.roles = [resolvedRole];
          // authorize() above already refuses to return a user without a
          // real tenantId, so there is nothing to fall back TO here.
          customToken.tenantId = authUser.tenantId;
          customToken.authSource = 'password';
        }

        const sessionId = randomUUID();
        customToken.sid = sessionId;

        try {
          await sessionService.createSession({
            userId: user.id as string,
            tenantId: customToken.tenantId as string,
            sessionId,
            expiresAt: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000),
          });
        } catch (error) {
          console.error('[authOptions] Failed to create session record:', error);
        }
      }

      return customToken;
    },
    async session({ session, token }) {
      const customToken = token as CustomToken;
      session.user.id = customToken.id as string;
      session.user.email = customToken.email as string;
      session.user.name = customToken.name as string;
      (session.user as CustomSessionUser).role = customToken.role;
      (session.user as CustomSessionUser).roles = customToken.roles;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (session as any).tenantId = customToken.tenantId;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (session as any).sessionId = customToken.sid;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (session as any).authSource = customToken.authSource;
      return session;
    },
  },
};
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
}

const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days
const AUTH_TENANT_ID = 'default';

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
          const lockStatus = await threatDetectionService.isLocked(email, AUTH_TENANT_ID);
          if (lockStatus.locked) {
            console.warn(`[authOptions] Rejected login for locked account: ${email}`);
            return null;
          }

          const db = await connectToDatabase();
          const user = await db.collection<User>('tbladmin').findOne({ Email: credentials.email });

          if (!user) {
            await threatDetectionService.recordLoginAttempt({
              email,
              tenantId: AUTH_TENANT_ID,
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
              tenantId: AUTH_TENANT_ID,
              userId: user._id.toString(),
              ipAddress,
              userAgent,
              success: false,
            });
            return null;
          }

          const userTenantId = user.tenantId || AUTH_TENANT_ID;
          const userId = user._id.toString();

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
                tenantId: AUTH_TENANT_ID,
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
            tenantId: AUTH_TENANT_ID,
            userId,
            ipAddress,
            userAgent,
            success: true,
          });

          return {
            id: userId,
            name: user.FirstName,
            email: user.Email,
            role: user.Role || 'admin',
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
          // the super-admin role the local credentials path grants.
          customToken.role = ssoUser.ssoDefaultRole || 'viewer';
          customToken.roles = [ssoUser.ssoDefaultRole || 'viewer'];
          customToken.tenantId = ssoUser.ssoOrganizationId;
          customToken.authSource = 'sso';
        } else {
          customToken.role = (user as CustomSessionUser).role || 'super_admin';
          customToken.roles = ['super_admin', 'organization_owner'];
          customToken.tenantId = AUTH_TENANT_ID;
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
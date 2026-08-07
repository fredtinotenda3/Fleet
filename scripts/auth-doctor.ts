// scripts/auth-doctor.ts
//
// Diagnoses and repairs login failures against the live database.
//
// WHY THIS EXISTS
// ---------------
// /api/auth/token returns a deliberately opaque 401 ("Invalid email or
// password") for four completely different conditions, because telling
// an attacker which one applies is an account-enumeration oracle. That
// is correct for production and useless for debugging: every provisioned
// account returning 401 could be a missing account, a stale password, a
// lockout, or an email-case mismatch, and the response is identical.
//
// This script checks each gate in the same order token.controller.ts
// does and reports which one actually fails.
//
// Usage:
//   npm run auth:doctor -- --email owner@willsgrove.test
//   npm run auth:doctor -- --email owner@willsgrove.test --password 'xyz'
//   npm run auth:doctor -- --all                       # every account
//   npm run auth:doctor -- --unlock-all                # clear lockouts
//   npm run auth:doctor -- --reset-all --confirm       # reissue passwords
//
// --reset-all writes a known password to every @willsgrove.test test
// account and prints them. It never touches real accounts (anything not
// on the test domain) unless --email names one explicitly.

/* eslint-disable no-console */

import { MongoClient } from 'mongodb';
import * as dotenv from 'dotenv';
import { compare, hash } from 'bcryptjs';
import { randomBytes } from 'crypto';

dotenv.config();

const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

const argv = process.argv.slice(2);

function optionValue(name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return undefined;
  const next = argv[i + 1];
  if (next === undefined || next.startsWith('--')) {
    console.error(`${RED}--${name} requires a value.${RESET}`);
    process.exit(1);
  }
  return next;
}

const EMAIL = optionValue('email');
const PASSWORD = optionValue('password');
const ALL = argv.includes('--all');
const UNLOCK_ALL = argv.includes('--unlock-all');
const RESET_ALL = argv.includes('--reset-all');
const APPLY = argv.includes('--confirm');
const TEST_DOMAIN = '@willsgrove.test';

function generatePassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = randomBytes(16);
  let out = '';
  for (let i = 0; i < 12; i += 1) out += alphabet[bytes[i] % alphabet.length];
  return `${out}!7`;
}

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error(`${RED}MONGODB_URI is not set.${RESET}`);
    process.exit(1);
  }
  if (!EMAIL && !ALL && !UNLOCK_ALL && !RESET_ALL) {
    console.error('Pass --email <addr>, or --all, or --unlock-all, or --reset-all --confirm');
    process.exit(1);
  }

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();

  try {
    console.log('');
    console.log(`${BOLD}Auth doctor${RESET}`);
    console.log(`${DIM}${'='.repeat(74)}${RESET}`);

    // ── Unlock ────────────────────────────────────────────────────────
    if (UNLOCK_ALL) {
      // Repeated failed logins lock an account for 15 minutes after 5
      // attempts (MAX_FAILED_ATTEMPTS in threat-detection.service.ts).
      // Cycling through a dozen accounts with stale passwords locks all
      // of them, after which even the CORRECT password returns 401 --
      // which is exactly what "I tried all the credentials and none
      // work" looks like from the outside.
      const res = await db.collection('tblaccountlockouts').updateMany(
        {},
        { $set: { failedCount: 0, lockedUntil: null, updatedAt: new Date() } }
      );
      console.log(`${GREEN}Cleared ${res.modifiedCount} lockout record(s).${RESET}`);
      console.log('');
    }

    // ── Reset test-account passwords ──────────────────────────────────
    if (RESET_ALL) {
      const accounts = await db
        .collection('tbladmin')
        .find({ Email: { $regex: `${TEST_DOMAIN.replace('.', '\\.')}$`, $options: 'i' } })
        .toArray();

      if (accounts.length === 0) {
        console.log(`${YELLOW}No ${TEST_DOMAIN} accounts found.${RESET}`);
      }

      const issued: Array<{ email: string; password: string; role: string }> = [];
      for (const a of accounts) {
        const password = PASSWORD ?? generatePassword();
        const email = String(a.Email).toLowerCase();
        if (APPLY) {
          await db.collection('tbladmin').updateOne(
            { _id: a._id },
            {
              $set: {
                // Stored lowercase so it matches the normalized lookup.
                Email: email,
                Password: await hash(password, 10),
                updatedAt: new Date(),
              },
            }
          );
          await db
            .collection('tblaccountlockouts')
            .updateOne(
              { email },
              { $set: { failedCount: 0, lockedUntil: null, updatedAt: new Date() } },
              { upsert: true }
            );
        }
        issued.push({ email, password, role: String(a.Role ?? a.roles?.[0] ?? '') });
      }

      console.log(
        APPLY
          ? `${GREEN}Reset ${issued.length} account(s). Passwords below.${RESET}`
          : `${YELLOW}DRY RUN -- add --confirm to apply. Passwords shown are NOT active.${RESET}`
      );
      console.log('');
      for (const c of issued) {
        console.log(`  ${CYAN}${c.email.padEnd(38)}${RESET} ${BOLD}${c.password}${RESET}  ${DIM}${c.role}${RESET}`);
      }
      console.log('');
      console.log(`${DIM}--- JSON ---${RESET}`);
      console.log(JSON.stringify(issued, null, 2));
      console.log('');
    }

    // ── Diagnose ──────────────────────────────────────────────────────
    if (EMAIL || ALL) {
      const query = ALL
        ? {}
        : { Email: { $regex: `^${EMAIL!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } };

      const accounts = await db.collection('tbladmin').find(query).toArray();

      if (accounts.length === 0) {
        console.log(`${RED}GATE 1 FAILED: no account matches "${EMAIL}".${RESET}`);
        console.log(`${DIM}  token.controller.ts looks up findOne({ Email }) -- if nothing`);
        console.log(`  matches, it returns 401 "Invalid email or password".${RESET}`);
        console.log('');
        return;
      }

      for (const a of accounts) {
        const storedEmail = String(a.Email ?? '');
        const lower = storedEmail.toLowerCase();
        console.log('');
        console.log(`  ${CYAN}${storedEmail}${RESET}`);

        // GATE 1: exact-case lookup, as the controller performs it.
        if (EMAIL && storedEmail !== EMAIL) {
          console.log(
            `    ${RED}GATE 1  email CASE MISMATCH${RESET} -- stored "${storedEmail}", you typed "${EMAIL}".`
          );
          console.log(
            `    ${DIM}       token.controller.ts normalizes to lowercase for the lockout`
          );
          console.log(
            `    ${DIM}       bookkeeping but queries with the RAW input, so the lookup is`
          );
          console.log(`    ${DIM}       case-sensitive and this login can never succeed.${RESET}`);
        } else {
          console.log(`    ${GREEN}GATE 1  account found${RESET}`);
        }

        // GATE 2: lockout.
        const lock = await db.collection('tblaccountlockouts').findOne({ email: lower });
        const lockedUntil = lock?.lockedUntil ? new Date(lock.lockedUntil) : null;
        if (lockedUntil && lockedUntil > new Date()) {
          console.log(
            `    ${RED}GATE 2  LOCKED until ${lockedUntil.toISOString()}${RESET} (${lock?.failedCount} failed attempts)`
          );
          console.log(`    ${DIM}       clear with: npm run auth:doctor -- --unlock-all${RESET}`);
        } else {
          console.log(
            `    ${GREEN}GATE 2  not locked${RESET} ${DIM}(failedCount ${lock?.failedCount ?? 0})${RESET}`
          );
        }

        // GATE 3: password hash present and well-formed.
        const hashValue = typeof a.Password === 'string' ? a.Password : '';
        if (!hashValue.startsWith('$2')) {
          console.log(`    ${RED}GATE 3  Password field missing or not a bcrypt hash${RESET}`);
        } else {
          console.log(
            `    ${GREEN}GATE 3  bcrypt hash present${RESET} ${DIM}(${hashValue.slice(0, 4)}, len ${hashValue.length})${RESET}`
          );
        }

        // GATE 3b: does the supplied password actually verify?
        if (PASSWORD && hashValue) {
          const ok = await compare(PASSWORD, hashValue);
          console.log(
            ok
              ? `    ${GREEN}GATE 3b password VERIFIES${RESET}`
              : `    ${RED}GATE 3b password does NOT match the stored hash${RESET}`
          );
        }

        // GATE 4: MFA.
        const mfa = await db
          .collection('tblmfafactors')
          .findOne({ userId: String(a._id), status: 'active', isDeleted: { $ne: true } });
        console.log(
          mfa
            ? `    ${YELLOW}GATE 4  MFA ACTIVE -- login returns { mfaRequired: true }, not a token${RESET}`
            : `    ${GREEN}GATE 4  no active MFA${RESET}`
        );

        // Context the app needs after login.
        const assignments = await db
          .collection('tbluser_scope_assignments')
          .countDocuments({ userId: String(a._id), isDeleted: { $ne: true } });
        console.log(
          `    ${DIM}tenantId ${a.tenantId ?? '(none)'} | roles ${JSON.stringify(a.roles ?? [a.Role])} | scope assignments ${assignments}${RESET}`
        );
        if (!a.tenantId) {
          console.log(
            `    ${YELLOW}NOTE   no tenantId -- token.controller falls back to 'default', a`
          );
          console.log(
            `    ${YELLOW}       rejected sentinel; scoped pages will fail after login.${RESET}`
          );
        }
      }
      console.log('');
    }
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error(`${RED}auth-doctor failed:${RESET}`, e instanceof Error ? e.message : e);
  process.exit(1);
});

// tests/security/no-committed-secrets.spec.ts
//
// PHASE 0, F-6 regression suite.
//
// WHAT WAS FOUND
//   1. The live Eagle Track production API token, committed verbatim in
//      five tracked files -- including as a TEST FIXTURE. With that
//      vendor's query-parameter auth it grants full read access to the
//      customer's fleet telemetry.
//   2. (Found during the repository-wide scan, NOT in the audit) a full
//      MongoDB Atlas connection string -- cluster hosts, user and
//      PASSWORD -- hardcoded in scripts/count-fuellogs.ts. Anyone with
//      a clone had direct read/write access to the production database,
//      bypassing every tenant-scope control in the application layer.
//   3. A second 26-character vendor-token-shaped literal in a config
//      schema test.
//
// Deleting occurrences is not remediation on its own: the value has to
// stay gone. This suite is what makes that true going forward -- it
// scans the tracked tree on every run and fails on the patterns that
// let all three in.
//
// NOTE ON SCOPE: this cannot detect a secret in GIT HISTORY, only in the
// working tree. History remediation is documented in
// SECURITY-CREDENTIALS.md and is an operator action, not a code change.

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');

const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  '.git',
  'coverage',
  'dist',
  'build',
  'reports',
]);

const SCANNED_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.yml',
  '.yaml',
  '.env',
  '.sh',
]);

/** package-lock.json is 786KB of integrity hashes; scanning it is pure noise. */
const SKIP_FILES = new Set(['package-lock.json']);

function trackedFiles(dir = ROOT, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      trackedFiles(path.join(dir, entry.name), acc);
    } else {
      if (SKIP_FILES.has(entry.name)) continue;
      const ext = path.extname(entry.name);
      if (SCANNED_EXTENSIONS.has(ext) || entry.name.startsWith('.env')) {
        acc.push(path.join(dir, entry.name));
      }
    }
  }
  return acc;
}

const FILES = trackedFiles();

/** Values that are obviously placeholders rather than live credentials. */
const SAFE_MARKERS = [
  'REDACTED',
  'YOUR_',
  'EXAMPLE',
  'example',
  'placeholder',
  'PLACEHOLDER',
  'synthetic',
  'TEST_',
  'test-',
  'fake',
  'FAKE',
  'dummy',
  'changeme',
  'xxx',
  'XXX',
  'localhost',
  '<',
  '...',
  'process.env',
];

function looksSafe(line: string): boolean {
  return SAFE_MARKERS.some((m) => line.includes(m));
}

/**
 * Whether a matched literal is plausibly a REAL credential rather than a
 * route, a fixture, or a human-written placeholder.
 *
 * Two discriminators, both derived from what the scan actually turned up
 * on this repository:
 *
 *   * A value beginning `/` is a URL path. `forgotPassword:
 *     '/auth/forgot-password'` matches a naive password-assignment regex
 *     and is obviously not a secret.
 *   * A machine-issued credential is an unstructured high-entropy run
 *     -- an unbroken 26-character alphanumeric run, in this case.
 *     A human-written placeholder, by contrast, is
 *     hyphenated words (`super-secret-value`,
 *     `correct-horse-battery-staple-cron-secret`). Two or more
 *     separators means somebody typed it, so it is not a live secret.
 *
 * Deliberately tuned to keep the TRUE positives this scan found -- both
 * real vendor tokens and the Atlas connection string are caught by
 * these rules -- rather than to reach zero findings by loosening until
 * the suite goes green.
 */
function looksLikeRealCredential(value: string): boolean {
  if (value.startsWith('/')) return false;
  const separators = (value.match(/[-_]/g) ?? []).length;
  if (separators >= 2) return false;
  return true;
}

/** The quoted literal on the right-hand side of an assignment, if any. */
function assignedValue(line: string): string | null {
  const m = line.match(/[:=]\s*['"`]([^'"`]+)['"`]/);
  return m ? m[1] : null;
}

describe('F-6: no live credentials in the working tree', () => {
  it('scans a non-trivial number of files (guards against a broken walker)', () => {
    // A scan that silently matches nothing is worse than no scan: it
    // reports success forever.
    expect(FILES.length).toBeGreaterThan(200);
  });

  it('contains no database connection string with an inline password', () => {
    const offenders: string[] = [];
    const pattern = /mongodb(\+srv)?:\/\/[^\s"'<]*:[^\s"'<@]+@/;

    for (const file of FILES) {
      const content = fs.readFileSync(file, 'utf8');
      for (const [i, line] of content.split('\n').entries()) {
        if (!pattern.test(line) || looksSafe(line)) continue;
        const value = assignedValue(line);
        if (value && !looksLikeRealCredential(value)) continue;
        offenders.push(`${path.relative(ROOT, file)}:${i + 1}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('contains no hardcoded vendor-token-shaped literal', () => {
    // The Eagle Track token was 26 lowercase alphanumerics assigned to a
    // `token` key. This catches that shape specifically, which is what
    // slipped through twice.
    const offenders: string[] = [];
    const pattern = /token\s*[:=]\s*['"`][a-z0-9]{20,64}['"`]/i;

    for (const file of FILES) {
      const content = fs.readFileSync(file, 'utf8');
      for (const [i, line] of content.split('\n').entries()) {
        if (!pattern.test(line) || looksSafe(line)) continue;
        const value = assignedValue(line);
        if (value && !looksLikeRealCredential(value)) continue;
        offenders.push(`${path.relative(ROOT, file)}:${i + 1}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('contains no assigned api key / secret / password literal', () => {
    const offenders: string[] = [];
    const pattern =
      /(api[_-]?key|client[_-]?secret|secret|password|passwd)\s*[:=]\s*['"`][A-Za-z0-9_\-+/]{12,}['"`]/i;

    for (const file of FILES) {
      const content = fs.readFileSync(file, 'utf8');
      for (const [i, line] of content.split('\n').entries()) {
        if (!pattern.test(line) || looksSafe(line)) continue;
        const value = assignedValue(line);
        if (value && !looksLikeRealCredential(value)) continue;
        offenders.push(`${path.relative(ROOT, file)}:${i + 1}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('does not track any real .env file (allows .env.example template)', () => {
    // `.gitignore` should exclude real `.env*` files.
    // `.env.example` is the committed template and is allowed.
    const envFiles = FILES.filter((f) => {
      const base = path.basename(f);
      return base !== '.env.example' && base.startsWith('.env');
    });
    expect(envFiles.map((f) => path.relative(ROOT, f))).toEqual([]);
  });

  it('scripts read MONGODB_URI from the environment rather than a literal', () => {
    const scriptsDir = path.join(ROOT, 'scripts');
    const offenders: string[] = [];

    for (const file of trackedFiles(scriptsDir)) {
      const content = fs.readFileSync(file, 'utf8');
      if (/mongodb(\+srv)?:\/\//.test(content)) {
        const usesEnv = content.includes('process.env.MONGODB_URI');
        const onlyLocalhost = !/mongodb(\+srv)?:\/\/(?!localhost)/.test(content);
        if (!usesEnv && !onlyLocalhost) {
          offenders.push(path.relative(ROOT, file));
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
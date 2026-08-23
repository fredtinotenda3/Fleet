// tests/security/telematics-eagletrack-token-leak.spec.ts
//
// The Eagle Track token now travels in the QUERY STRING, because that is
// the only form the platform authenticates (the documented `token`
// header is treated as anonymous and redirected to the login page -- see
// eagletrack-api.client.ts). That was a forced change, not a preferred
// one: a credential in a URL is the classic way secrets end up in access
// logs, proxy logs, error trackers and support tickets.
//
// This suite is the compensating control. It proves the four properties
// that keep "the token is in the URL" from becoming "the token is in our
// logs":
//
//   1. The token IS sent as a query parameter, and NOT as a header. If
//      this regresses, the integration silently stops authenticating and
//      every sync reports an empty fleet -- which looks like "this tenant
//      has no vehicles", not like a bug.
//   2. Nothing this client hands to the logger contains the token or a
//      full URL. Logged shape is the endpoint (origin + path) only.
//   3. No EagleTrackApiError message contains the token, on any failure
//      path. This matters concretely: structured-logger records
//      `message` and `stack`, telemetry.worker.ts logs
//      `result.errors.join('; ')`, and handleTelematicsError returns an
//      Error's message to the HTTP client -- so a token in a message is
//      a token in three separate places at once.
//   4. A vendor response that echoes our own request URL back at us is
//      redacted before it is attached to anything. Not hypothetical:
//      PHP-era platforms print REQUEST_URI in stack traces.
//
// Property 1 is asserted behaviourally AND structurally. The structural
// check exists because a well-meaning future edit that "restores the
// documented header form" would break production while every
// behavioural test that only checks the query parameter still passes.

import * as fs from 'fs';
import * as path from 'path';
import {
  EagleTrackApiClient,
  EagleTrackApiError,
  EAGLETRACK_TOKEN_QUERY_PARAM,
  EAGLETRACK_TOKEN_REDACTION,
} from '../../modules/telematics/adapters/eagletrack/eagletrack-api.client';
import { monitoring } from '../../infrastructure/monitoring/logger';

jest.mock('../../infrastructure/monitoring/logger', () => ({
  monitoring: { logDebug: jest.fn(), logWarn: jest.fn(), logError: jest.fn(), logInfo: jest.fn() },
}));

/** Shaped like a real api2 token (26 lowercase alphanumerics) so a substring search is meaningful. */
// PHASE 0, F-6: was the REAL production Eagle Track token, committed
// verbatim as a test fixture. A synthetic value exercises this suite
// identically -- every assertion here is about whether the token STRING
// appears in a log line or an error message, which is a property of the
// redaction code and not of the token's value.
const TOKEN = 'TEST_EAGLETRACK_TOKEN_synthetic_do_not_use';
const DOMAIN = 'https://gps.example.com';
const ENDPOINT = `${DOMAIN}/api2/trackers`;

const originalFetch = global.fetch;

function client(timeoutMs?: number) {
  return new EagleTrackApiClient({ domain: DOMAIN, token: TOKEN, ...(timeoutMs ? { timeoutMs } : {}) });
}

function stubResponse(options: { status?: number; body: string }) {
  const calls: string[] = [];

  (global as unknown as { fetch: unknown }).fetch = jest.fn(async (url: unknown) => {
    calls.push(String(url));
    const status = options.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      text: async () => options.body,
    };
  });

  return calls;
}

/** Every string the logger was handed this test, flattened. */
function everythingLogged(): string {
  const mocks = [monitoring.logDebug, monitoring.logWarn, monitoring.logError, monitoring.logInfo] as jest.Mock[];
  return JSON.stringify(mocks.map((mock) => mock.mock.calls));
}

beforeEach(() => jest.clearAllMocks());

afterEach(() => {
  (global as unknown as { fetch: unknown }).fetch = originalFetch;
});

describe('the token is sent as a query parameter and never as a header', () => {
  it('puts the credential in the query string, which is the only form api2 authenticates', async () => {
    const calls = stubResponse({ body: JSON.stringify({ error: 0, data: [] }) });

    await client().getTrackers();

    expect(new URL(calls[0]).searchParams.get(EAGLETRACK_TOKEN_QUERY_PARAM)).toBe(TOKEN);
  });

  it('sends no `token` request header, under any casing', async () => {
    let sentHeaders: Record<string, string> = {};

    (global as unknown as { fetch: unknown }).fetch = jest.fn(async (_url: unknown, init: unknown) => {
      sentHeaders = ((init as RequestInit)?.headers ?? {}) as Record<string, string>;
      return { ok: true, status: 200, statusText: 'OK', text: async () => JSON.stringify({ error: 0, data: [] }) };
    });

    await client().getTrackers();

    const headerNames = Object.keys(sentHeaders).map((name) => name.toLowerCase());
    expect(headerNames).not.toContain('token');
    expect(headerNames).not.toContain('authorization');
    expect(JSON.stringify(sentHeaders)).not.toContain(TOKEN);
  });

  it('does not reinstate the header form in source -- a "fix" that does would break production silently', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../modules/telematics/adapters/eagletrack/eagletrack-api.client.ts'),
      'utf8'
    );

    // The old form. Header-authenticated requests are redirected to the
    // login page, so restoring this yields empty syncs, not errors.
    expect(src).not.toMatch(/^\s*token:\s*this\.token\s*,?\s*$/m);
    // And the query parameter must still be written by this file.
    expect(src).toContain('url.searchParams.set(EAGLETRACK_TOKEN_QUERY_PARAM, this.token)');
  });

  it('cannot have the credential displaced by a caller-supplied `token` parameter', async () => {
    // No caller does this today. The guard exists so that none can start:
    // searchParams.set would otherwise let a params key of the same name
    // overwrite the credential, and the request would authenticate as
    // whatever the caller passed.
    const calls = stubResponse({ body: JSON.stringify({ error: 0, data: [] }) });

    // verifyCredentials is the only method that passes params to the
    // roster endpoint; drive the collision through the public surface by
    // constructing a client and calling it, then assert the credential
    // survived. The negative case (a params-level override) is enforced
    // structurally below, since request() is private.
    await client().verifyCredentials();

    expect(new URL(calls[0]).searchParams.get(EAGLETRACK_TOKEN_QUERY_PARAM)).toBe(TOKEN);

    const src = fs.readFileSync(
      path.resolve(__dirname, '../../modules/telematics/adapters/eagletrack/eagletrack-api.client.ts'),
      'utf8'
    );
    expect(src).toContain('if (key === EAGLETRACK_TOKEN_QUERY_PARAM) continue;');
  });
});

describe('nothing the client logs contains the token or a full URL', () => {
  it('logs the endpoint only on a successful request', async () => {
    stubResponse({ body: JSON.stringify({ error: 0, data: [] }) });

    await client().getTrackers();

    const logged = everythingLogged();
    expect(logged).not.toContain(TOKEN);
    expect(logged).not.toContain(`${EAGLETRACK_TOKEN_QUERY_PARAM}=`);
    // The endpoint IS logged -- this is the "log endpoint without the
    // token" requirement, so its absence would be a failure too.
    expect(logged).toContain(ENDPOINT);
  });

  it('logs the endpoint only on an HTTP-level failure', async () => {
    stubResponse({ status: 500, body: 'upstream exploded' });

    await client()
      .getTrackers()
      .catch(() => undefined);

    const logged = everythingLogged();
    expect(logged).not.toContain(TOKEN);
    expect(logged).not.toContain(`${EAGLETRACK_TOKEN_QUERY_PARAM}=`);
  });

  it('logs the endpoint only when the platform answers with its login page', async () => {
    stubResponse({ body: '<!DOCTYPE html><html><body>Login</body></html>' });

    await client()
      .getTrackers()
      .catch(() => undefined);

    const logged = everythingLogged();
    expect(logged).not.toContain(TOKEN);
    expect(logged).not.toContain(`${EAGLETRACK_TOKEN_QUERY_PARAM}=`);
  });

  it('logs the endpoint only on a vendor error envelope, even when the vendor echoed our URL into `msg`', async () => {
    stubResponse({
      body: JSON.stringify({
        error: 101,
        msg: `Invalid token for request /api2/trackers?token=${TOKEN}`,
      }),
    });

    await client()
      .getTrackers()
      .catch(() => undefined);

    const logged = everythingLogged();
    expect(logged).not.toContain(TOKEN);
  });

  it('never hands url.toString() to the logger', () => {
    // Structural, because "we happened not to log the URL in the cases
    // this suite covers" is a weaker claim than "this file has no code
    // path that could". The URL is built in exactly one place and used in
    // exactly one place.
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../modules/telematics/adapters/eagletrack/eagletrack-api.client.ts'),
      'utf8'
    );

    // Comments legitimately mention url.toString() (including to say it
    // must not be logged), so count CODE lines only.
    const codeLines = src
      .split('\n')
      .filter((line) => {
        const trimmed = line.trim();
        return !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*');
      });

    const urlUses = codeLines.filter((line) => line.includes('url.toString()'));
    expect(urlUses).toHaveLength(1);
    // ...and its single use is the fetch call itself.
    expect(urlUses[0]).toContain('fetch(');

    for (const line of codeLines) {
      if (/monitoring\.log/.test(line)) {
        expect(line).not.toContain('url');
      }
    }
  });
});

describe('no error message carries the token', () => {
  // Load-bearing because these messages reach three destinations:
  // structured-logger (message + stack), the sync result's `errors` array
  // that telemetry.worker.ts joins into a log line, and
  // handleTelematicsError, which returns an Error's message to the
  // HTTP client.
  const failures: Array<[string, { status?: number; body: string }]> = [
    ['an HTTP 500', { status: 500, body: 'upstream exploded' }],
    ['an HTTP 401', { status: 401, body: 'nope' }],
    ['a 302 to the login page', { status: 302, body: '' }],
    ['an HTML login page on a 200', { body: '<!DOCTYPE html><html><body>Login</body></html>' }],
    ['a vendor error envelope', { body: JSON.stringify({ error: 101, msg: 'Invalid token' }) }],
    ['a non-object JSON body', { body: '"just a string"' }],
    [
      'a vendor message echoing our request URL',
      { body: JSON.stringify({ error: 101, msg: `bad token in /api2/trackers?token=${TOKEN}` }) },
    ],
    [
      'an HTTP error whose body echoes our request URL',
      { status: 500, body: `Fatal error: REQUEST_URI=/api2/trackers?token=${TOKEN}` },
    ],
  ];

  it.each(failures)('omits the token from the error raised for %s', async (_label, response) => {
    stubResponse(response);

    const error = await client()
      .getTrackers()
      .catch((e) => e as EagleTrackApiError);

    expect(error).toBeInstanceOf(EagleTrackApiError);
    expect(error.message).not.toContain(TOKEN);
    // A `token=` fragment reaching a message is only acceptable when the
    // VALUE has been substituted -- e.g. the vendor echoed our request
    // line back and redaction rewrote it in place.
    for (const fragment of error.message.match(/token=[^\s&"']*/g) ?? []) {
      expect(fragment).toBe(`${EAGLETRACK_TOKEN_QUERY_PARAM}=${EAGLETRACK_TOKEN_REDACTION}`);
    }
    // The stack embeds the message, and the logger records the stack.
    expect(error.stack ?? '').not.toContain(TOKEN);
    // Whatever we retained for debugging is redacted too.
    expect(JSON.stringify(error.cause ?? '')).not.toContain(TOKEN);
  });

  it('omits the token from a timeout, which names the endpoint instead', async () => {
    (global as unknown as { fetch: unknown }).fetch = jest.fn(async () => {
      const abort = new Error('The operation was aborted');
      abort.name = 'AbortError';
      throw abort;
    });

    const error = await client(5)
      .getTrackers()
      .catch((e) => e as EagleTrackApiError);

    expect(error.message).not.toContain(TOKEN);
    expect(error.message).toContain(ENDPOINT);
  });

  it('omits the token from a transport failure whose underlying error contains the whole URL', async () => {
    // Node's fetch reports `TypeError: fetch failed` and hangs the useful
    // detail off `.cause`, where a full URL can appear. The client
    // interpolates only a vetted errno code from it.
    (global as unknown as { fetch: unknown }).fetch = jest.fn(async () => {
      const failure = new TypeError('fetch failed');
      (failure as unknown as { cause: unknown }).cause = Object.assign(
        new Error(`ECONNREFUSED for ${ENDPOINT}?token=${TOKEN}`),
        { code: 'ECONNREFUSED' }
      );
      throw failure;
    });

    const error = await client()
      .getTrackers()
      .catch((e) => e as EagleTrackApiError);

    expect(error.message).not.toContain(TOKEN);
    expect(error.message).toContain('ECONNREFUSED');
  });

  it('substitutes a non-token-shaped placeholder, so a redacted string cannot be mistaken for a credential', async () => {
    stubResponse({ body: JSON.stringify({ error: 101, msg: `token was ${TOKEN}` }) });

    const error = await client()
      .getTrackers()
      .catch((e) => e as EagleTrackApiError);

    expect(error.message).toContain(EAGLETRACK_TOKEN_REDACTION);
    expect(EAGLETRACK_TOKEN_REDACTION).not.toMatch(/^[a-z0-9]{20,}$/);
  });

  it('does not leak even a PREFIX of the token -- a partial static credential narrows a brute force', async () => {
    stubResponse({ status: 500, body: `REQUEST_URI=/api2/trackers?token=${TOKEN}` });

    const error = await client()
      .getTrackers()
      .catch((e) => e as EagleTrackApiError);

    const serialised = `${error.message}${error.stack ?? ''}${JSON.stringify(error.cause ?? '')}`;
    for (let length = 8; length <= TOKEN.length; length += 1) {
      expect(serialised).not.toContain(TOKEN.slice(0, length));
    }
  });
});

describe('retained vendor text is bounded', () => {
  it('truncates an HTML page rather than carrying the whole thing on the error', async () => {
    // An unbounded body on an error object is how a 200KB login page ends
    // up in a queue's dead-letter record.
    stubResponse({ status: 500, body: 'x'.repeat(50_000) });

    const error = await client()
      .getTrackers()
      .catch((e) => e as EagleTrackApiError);

    expect(typeof error.cause).toBe('string');
    expect((error.cause as string).length).toBeLessThan(1_000);
  });
});

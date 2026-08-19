// tests/unit/telematics/eagletrack-api-client.spec.ts
//
// Covers the four ways Eagle Track's wire protocol differs from
// Cartrack's, each of which is a silent-failure risk if handled wrongly:
//
//   1. The token authenticates ONLY as a `?token=` QUERY PARAMETER. The
//      documented `token` header is treated as anonymous and redirected
//      to the login page. This file previously asserted the opposite --
//      the inversion is deliberate and is the whole point of the change;
//      production testing against a live deployment settled it.
//   2. Failure is reported IN THE BODY (`error !== 0`) on an HTTP 200.
//      Checking `response.ok` alone would turn a rejected token into a
//      successful empty sync -- indistinguishable from "this tenant has
//      no vehicles".
//   3. Content-Type is meaningless. The live deployment labels its JSON
//      `text/html`, and serves an actual HTML login page under the same
//      label and an HTTP 200 when unauthenticated. So the client parses
//      the body itself and must never branch on the header.
//   4. `GET /api2/last` returns `data` keyed by uin, not as an array.
//
// The "must not leak the credential" properties that follow from (1)
// live in tests/security/telematics-eagletrack-token-leak.spec.ts. The
// couple asserted here are the ones a developer changing this file would
// break first.

import {
  EagleTrackApiClient,
  EagleTrackApiError,
  EAGLETRACK_TOKEN_QUERY_PARAM,
  EAGLETRACK_USER_QUERY_PARAM,
  flattenLastPayload,
  normaliseEagleTrackBaseUrl,
} from '@/modules/telematics/adapters/eagletrack/eagletrack-api.client';

jest.mock('@/infrastructure/monitoring/logger', () => ({
  monitoring: { logDebug: jest.fn(), logWarn: jest.fn(), logError: jest.fn(), logInfo: jest.fn() },
}));

const TOKEN = 'secret-token-value';

type FetchCall = { url: string; init: RequestInit };

/**
 * Installs a fake fetch.
 *
 * A string `body` is returned verbatim (for the HTML-login-page cases);
 * anything else is JSON-serialised.
 *
 * The response's `headers` is a THROWING getter, not an omission: the
 * client must never branch on Content-Type, because on this platform
 * Content-Type is `text/html` whether the body is JSON or a login page.
 * A future edit that reads it fails here rather than in production.
 */
function mockFetch(responder: (call: FetchCall) => { status?: number; statusText?: string; body: unknown }) {
  const calls: FetchCall[] = [];

  const fn = jest.fn(async (url: unknown, init: unknown) => {
    const call = { url: String(url), init: (init ?? {}) as RequestInit };
    calls.push(call);
    const { status = 200, statusText, body } = responder(call);
    const text = typeof body === 'string' ? body : JSON.stringify(body);

    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: statusText ?? (status === 200 ? 'OK' : 'Error'),
      get headers(): never {
        throw new Error('the client must not branch on Content-Type: this platform labels JSON as text/html');
      },
      text: async () => text,
      json: async () => {
        throw new Error('the client must read the body as text and parse it itself');
      },
    };
  });

  (global as unknown as { fetch: unknown }).fetch = fn;
  return calls;
}

const originalFetch = global.fetch;
afterEach(() => {
  (global as unknown as { fetch: unknown }).fetch = originalFetch;
  jest.restoreAllMocks();
});

function client(domain = 'https://gps.example.com') {
  return new EagleTrackApiClient({ domain, token: TOKEN });
}

/** A minimal stand-in for the HTML login page the platform serves to an unauthenticated request. */
const LOGIN_PAGE_HTML = '<!DOCTYPE html><html><head><title>Login</title></head><body><form>...</form></body></html>';

describe('normaliseEagleTrackBaseUrl', () => {
  it('strips trailing slashes and an /api2 suffix an operator is likely to paste in', () => {
    expect(normaliseEagleTrackBaseUrl('https://gps.example.com/')).toBe('https://gps.example.com');
    expect(normaliseEagleTrackBaseUrl('https://gps.example.com/api2')).toBe('https://gps.example.com');
    expect(normaliseEagleTrackBaseUrl('https://gps.example.com/api2/')).toBe('https://gps.example.com');
    expect(normaliseEagleTrackBaseUrl('  https://gps.example.com  ')).toBe('https://gps.example.com');
  });

  it('leaves a bare origin untouched', () => {
    expect(normaliseEagleTrackBaseUrl('http://test.livegts.com')).toBe('http://test.livegts.com');
  });
});

describe('authentication', () => {
  it('sends the token as a query parameter -- the only form this platform authenticates', async () => {
    const calls = mockFetch(() => ({ body: { error: 0, msg: '', data: {} } }));

    await client().getLastForAll('Willsgrove');

    expect(calls).toHaveLength(1);
    expect(new URL(calls[0].url).searchParams.get(EAGLETRACK_TOKEN_QUERY_PARAM)).toBe(TOKEN);
  });

  it('sends NO token header -- a header-only request is treated as anonymous and redirected to login', async () => {
    const calls = mockFetch(() => ({ body: { error: 0, msg: '', data: {} } }));

    await client().getTrackers();

    const headers = (calls[0].init.headers ?? {}) as Record<string, string>;
    expect(headers.token).toBeUndefined();
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain('token');
    // Accept is still sent, and is still advisory only.
    expect(headers.Accept).toBe('application/json');
  });

  it('appends the token exactly once, not per accumulated param', async () => {
    const calls = mockFetch(() => ({ body: { error: 0, msg: '', data: [] } }));

    await client().verifyCredentials();

    const occurrences = calls[0].url.split(`${EAGLETRACK_TOKEN_QUERY_PARAM}=`).length - 1;
    expect(occurrences).toBe(1);
  });

  it('polls with the derived account username, not the vendor-documented (and, on this deployment, rejected) fleet selector', async () => {
    const calls = mockFetch(() => ({ body: { error: 0, msg: '', data: {} } }));

    await client().getLastForAll('Willsgrove');

    expect(new URL(calls[0].url).searchParams.get(EAGLETRACK_USER_QUERY_PARAM)).toBe('Willsgrove');
    // __all_sub is rejected outright on the deployment this was tested
    // against ("Access Denied:__all_sub"); __all_sys_ would pull every
    // tracker on a reseller-run instance, including other customers'.
    expect(calls[0].url).not.toContain('__all_sub');
    expect(calls[0].url).not.toContain('__all_sys_');
  });

  it('appends /api2 exactly once when the operator already included it in the domain', async () => {
    const calls = mockFetch(() => ({ body: { error: 0, msg: '', data: {} } }));

    await client('https://gps.example.com/api2/').getLastForAll('Willsgrove');

    expect(calls[0].url).toContain('/api2/last');
    expect(calls[0].url).not.toContain('/api2/api2');
  });
});

describe('envelope error handling', () => {
  it('throws on error !== 0 even though the transport said HTTP 200', async () => {
    mockFetch(() => ({ status: 200, body: { error: 101, msg: 'Invalid token', data: [] } }));

    await expect(client().getLastForAll('Willsgrove')).rejects.toThrow(EagleTrackApiError);
    await expect(client().getLastForAll('Willsgrove')).rejects.toThrow(/101.*Invalid token/);
  });

  it('classifies a vendor error code as a rejection, so test-connection can report bad credentials', async () => {
    mockFetch(() => ({ status: 200, body: { error: 101, msg: 'Invalid token' } }));

    const error = await client()
      .getTrackers()
      .catch((e) => e as EagleTrackApiError);

    expect(error).toBeInstanceOf(EagleTrackApiError);
    expect(error.vendorErrorCode).toBe(101);
    expect(error.isVendorRejection).toBe(true);
  });

  it('treats a stringified "0" as success, since deployments have been seen to quote the code', async () => {
    mockFetch(() => ({ body: { error: '0', msg: '', data: { '917': { uin: '917', lat: 1, lng: 2 } } } }));

    await expect(client().getLastForAll('Willsgrove')).resolves.toHaveLength(1);
  });

  it('throws on an HTTP-level failure and does NOT classify a 500 as a credentials problem', async () => {
    mockFetch(() => ({ status: 500, body: {} }));

    const error = await client()
      .getTrackers()
      .catch((e) => e as EagleTrackApiError);

    expect(error).toBeInstanceOf(EagleTrackApiError);
    expect(error.statusCode).toBe(500);
    expect(error.isVendorRejection).toBe(false);
  });

  it('classifies 401/403 as a rejection', async () => {
    mockFetch(() => ({ status: 401, body: {} }));

    const error = await client()
      .getTrackers()
      .catch((e) => e as EagleTrackApiError);

    expect(error.isVendorRejection).toBe(true);
  });

  it('classifies a redirect as a rejection -- how this platform answers an unauthenticated request', async () => {
    // Only observable when fetch does not follow it; when it does, the
    // followed response is the login page and nonJsonBody covers it.
    mockFetch(() => ({ status: 302, statusText: 'Found', body: '' }));

    const error = await client()
      .getTrackers()
      .catch((e) => e as EagleTrackApiError);

    expect(error.statusCode).toBe(302);
    expect(error.isVendorRejection).toBe(true);
  });
});

describe('non-JSON responses', () => {
  it('treats an HTML login page on an HTTP 200 as a credentials rejection, not a crash', async () => {
    // Before this classification existed, response.json() threw a bare
    // TypeError here and the failure surfaced as "the platform is down"
    // for the one condition test-connection exists to detect.
    mockFetch(() => ({ status: 200, body: LOGIN_PAGE_HTML }));

    const error = await client()
      .getTrackers()
      .catch((e) => e as EagleTrackApiError);

    expect(error).toBeInstanceOf(EagleTrackApiError);
    expect(error.nonJsonBody).toBe(true);
    expect(error.isVendorRejection).toBe(true);
    expect(error.message).toMatch(/non-JSON/i);
    // The operator needs to be pointed at the token, not the network.
    expect(error.message).toMatch(/token/i);
  });

  it('parses a JSON body regardless of what Content-Type claims', async () => {
    // The live deployment returns its JSON envelope labelled
    // `text/html; charset=UTF-8`. The mock's `headers` getter throws, so
    // this passing is itself the proof that nothing read it.
    mockFetch(() => ({ status: 200, body: { error: 0, data: [{ uin: '1332', name: 'ADY2531' }] } }));

    await expect(client().getTrackers()).resolves.toHaveLength(1);
  });

  it('rejects a body that parses but is not an object', async () => {
    mockFetch(() => ({ status: 200, body: '"just a string"' }));

    const error = await client()
      .getTrackers()
      .catch((e) => e as EagleTrackApiError);

    expect(error).toBeInstanceOf(EagleTrackApiError);
    expect(error.message).toMatch(/malformed/i);
  });
});

describe('verifyCredentials', () => {
  it('returns true on a successful cheap probe against the roster endpoint', async () => {
    const calls = mockFetch(() => ({ body: { error: 0, msg: '', data: [] } }));

    await expect(client().verifyCredentials()).resolves.toBe(true);
    expect(calls[0].url).toContain('/api2/trackers');
    expect(new URL(calls[0].url).searchParams.get('pageSize')).toBe('1');
    // Must not be a fleet-wide pull.
    expect(calls[0].url).not.toContain('/api2/last');
  });

  it('returns false for a coherent vendor rejection', async () => {
    mockFetch(() => ({ status: 200, body: { error: 101, msg: 'Invalid token' } }));
    await expect(client().verifyCredentials()).resolves.toBe(false);
  });

  it('returns false when the platform serves its login page -- the real invalid-token behaviour', async () => {
    mockFetch(() => ({ status: 200, body: LOGIN_PAGE_HTML }));
    await expect(client().verifyCredentials()).resolves.toBe(false);
  });

  it('RETHROWS a transport failure rather than reporting invalid credentials -- an unreachable host is not a bad token', async () => {
    mockFetch(() => ({ status: 503, body: {} }));
    await expect(client().verifyCredentials()).rejects.toThrow(EagleTrackApiError);
  });
});

describe('transport failures', () => {
  it('reports a timeout against the endpoint, with no URL and no credential in the message', async () => {
    (global as unknown as { fetch: unknown }).fetch = jest.fn(async () => {
      const abort = new Error('The operation was aborted');
      abort.name = 'AbortError';
      throw abort;
    });

    const error = await new EagleTrackApiClient({ domain: 'https://gps.example.com', token: TOKEN, timeoutMs: 5 })
      .getTrackers()
      .catch((e) => e as EagleTrackApiError);

    expect(error.message).toContain('https://gps.example.com/api2/trackers');
    expect(error.message).toMatch(/timed out/);
    expect(error.message).not.toContain(TOKEN);
    expect(error.isVendorRejection).toBe(false);
  });

  it('carries an errno code through but not the underlying message, which can contain a URL', async () => {
    (global as unknown as { fetch: unknown }).fetch = jest.fn(async () => {
      const failure = new TypeError('fetch failed');
      (failure as unknown as { cause: unknown }).cause = Object.assign(
        new Error(`getaddrinfo ENOTFOUND gps.example.com (https://gps.example.com/api2/trackers?token=${TOKEN})`),
        { code: 'ENOTFOUND' }
      );
      throw failure;
    });

    const error = await client()
      .getTrackers()
      .catch((e) => e as EagleTrackApiError);

    expect(error.message).toContain('ENOTFOUND');
    expect(error.message).not.toContain(TOKEN);
    expect(error.message).not.toContain('?token=');
  });
});

describe('flattenLastPayload', () => {
  it('flattens the uin-keyed object into an array', () => {
    const flattened = flattenLastPayload({
      '9171892960': { uin: '9171892960', lat: 22.556045, lng: 113.937238, speed: 29.97 },
      '723001': { uin: '723001', lat: 1, lng: 2 },
    });

    expect(flattened).toHaveLength(2);
    expect(flattened.map((s) => s.uin).sort()).toEqual(['723001', '9171892960']);
    expect(flattened.find((s) => s.uin === '9171892960')?.speed).toBe(29.97);
  });

  it('takes the uin from the KEY, not the duplicated field inside the entry', () => {
    // A vendor-side inconsistency between the two must not re-attribute
    // a fix to a different vehicle.
    const flattened = flattenLastPayload({
      '723001': { uin: '999999' as string, lat: 1, lng: 2 },
    });

    expect(flattened[0].uin).toBe('723001');
  });

  it('tolerates an array-shaped payload, which the (out-of-scope) history endpoint returns', () => {
    const flattened = flattenLastPayload([{ uin: '723001', lat: 1, lng: 2 }]);
    expect(flattened).toHaveLength(1);
    expect(flattened[0].uin).toBe('723001');
  });

  it('returns an empty array for absent or malformed data rather than throwing mid-sync', () => {
    expect(flattenLastPayload(undefined)).toEqual([]);
    expect(flattenLastPayload(null)).toEqual([]);
    expect(flattenLastPayload({})).toEqual([]);
  });
});

describe('getTrackers', () => {
  it('drops roster rows with no uin rather than producing an unusable match key', async () => {
    mockFetch(() => ({
      body: {
        error: 0,
        data: [
          { id: '154', uin: '723001', name: 'PT201B', __platenumber: 'abc' },
          { id: '155', name: 'no uin at all' },
        ],
        refData: { models: {}, users: {} },
      },
    }));

    const trackers = await client().getTrackers();
    expect(trackers).toHaveLength(1);
    expect(trackers[0].uin).toBe('723001');
  });

  it('preserves the live deployment roster shape: empty `plate`, no `__platenumber`, plate in `name`', async () => {
    // Trimmed from the real GET /api2/trackers response. The fields the
    // matching order depends on must survive parsing exactly as sent --
    // an empty string must stay an empty string, not become undefined.
    mockFetch(() => ({
      body: {
        error: 0,
        data: [
          { id: '1332', name: 'ADY2531', uin: '865585040533451', model: '10104', belong: 'Willsgrove', plate: '' },
          { id: '1317', name: 'AFU0078', uin: '861100068912274', model: '10192', belong: 'Willsgrove', plate: '' },
        ],
        refData: { users: { Willsgrove: { title: 'Willsgrove Farm Enterprises', objId: '538' } } },
      },
    }));

    const trackers = await client().getTrackers();

    expect(trackers).toHaveLength(2);
    expect(trackers[0].plate).toBe('');
    expect(trackers[0].__platenumber).toBeUndefined();
    expect(trackers.map((t) => t.name)).toEqual(['ADY2531', 'AFU0078']);
  });

  it('returns an empty array when data is not an array, instead of throwing', async () => {
    mockFetch(() => ({ body: { error: 0, data: {} } }));
    await expect(client().getTrackers()).resolves.toEqual([]);
  });
});

describe('getTrackersWithRefData', () => {
  it('surfaces refData.users alongside the roster, for username derivation', async () => {
    mockFetch(() => ({
      body: {
        error: 0,
        data: [{ id: '1332', name: 'ADY2531', uin: '865585040533451', belong: 'Willsgrove', plate: '' }],
        refData: { users: { Willsgrove: { title: 'Willsgrove Farm Enterprises', objId: '538' } } },
      },
    }));

    const { trackers, refData } = await client().getTrackersWithRefData();

    expect(trackers).toHaveLength(1);
    expect(Object.keys(refData?.users ?? {})).toEqual(['Willsgrove']);
  });

  it('leaves refData undefined rather than throwing when the response omits it', async () => {
    mockFetch(() => ({ body: { error: 0, data: [] } }));

    const { trackers, refData } = await client().getTrackersWithRefData();

    expect(trackers).toEqual([]);
    expect(refData).toBeUndefined();
  });
});

describe('the rejected __all_sub selector (regression coverage)', () => {
  it('classifies "Access Denied:__all_sub" -- the live deployment response to the old selector -- as a non-JSON vendor rejection, not a crash', async () => {
    // This client no longer sends uin=__all_sub (see
    // EAGLETRACK_FLEET_SELECTOR's doc comment), but the body-parsing
    // path that would receive this exact response if it ever did must
    // still fail safely rather than throwing an unhandled parse error.
    mockFetch(() => ({ status: 200, body: 'Access Denied:__all_sub' }));

    const error = await client()
      .getLastForAll('Willsgrove')
      .catch((e) => e as EagleTrackApiError);

    expect(error).toBeInstanceOf(EagleTrackApiError);
    expect(error.nonJsonBody).toBe(true);
    expect(error.isVendorRejection).toBe(true);
  });
});

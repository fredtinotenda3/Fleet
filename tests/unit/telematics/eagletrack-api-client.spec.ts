// tests/unit/telematics/eagletrack-api-client.spec.ts
//
// Covers the three ways Eagle Track's wire protocol differs from
// Cartrack's, each of which is a silent-failure risk if handled wrongly:
//
//   1. The token goes in a HEADER, never the query string. A credential
//      in a URL is copied into access logs and proxy logs.
//   2. Failure is reported IN THE BODY (`error !== 0`) on an HTTP 200.
//      Checking `response.ok` alone would turn a rejected token into a
//      successful empty sync -- indistinguishable from "this tenant has
//      no vehicles".
//   3. `GET /api2/last` returns `data` keyed by uin, not as an array.

import {
  EagleTrackApiClient,
  EagleTrackApiError,
  EAGLETRACK_FLEET_SELECTOR,
  flattenLastPayload,
  normaliseEagleTrackBaseUrl,
} from '../../../modules/telematics/adapters/eagletrack/eagletrack-api.client';

type FetchCall = { url: string; init: RequestInit };

function mockFetch(responder: (call: FetchCall) => { status?: number; body: unknown }) {
  const calls: FetchCall[] = [];

  const fn = jest.fn(async (url: unknown, init: unknown) => {
    const call = { url: String(url), init: (init ?? {}) as RequestInit };
    calls.push(call);
    const { status = 200, body } = responder(call);

    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      json: async () => body,
      text: async () => JSON.stringify(body),
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
  return new EagleTrackApiClient({ domain, token: 'secret-token-value' });
}

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
  it('sends the token as a header and never in the URL', async () => {
    const calls = mockFetch(() => ({ body: { error: 0, msg: '', data: {} } }));

    await client().getLastForAll();

    expect(calls).toHaveLength(1);
    expect((calls[0].init.headers as Record<string, string>).token).toBe('secret-token-value');
    expect(calls[0].url).not.toContain('secret-token-value');
    expect(calls[0].url).not.toContain('token=');
  });

  it('polls with the least-privilege fleet selector, never the whole-deployment one', async () => {
    const calls = mockFetch(() => ({ body: { error: 0, msg: '', data: {} } }));

    await client().getLastForAll();

    expect(calls[0].url).toContain(`uin=${EAGLETRACK_FLEET_SELECTOR}`);
    // __all_sys_ would pull every tracker on a reseller-run instance,
    // including other customers' vehicles.
    expect(calls[0].url).not.toContain('__all_sys_');
  });

  it('appends /api2 exactly once when the operator already included it in the domain', async () => {
    const calls = mockFetch(() => ({ body: { error: 0, msg: '', data: {} } }));

    await client('https://gps.example.com/api2/').getLastForAll();

    expect(calls[0].url).toContain('/api2/last');
    expect(calls[0].url).not.toContain('/api2/api2');
  });
});

describe('envelope error handling', () => {
  it('throws on error !== 0 even though the transport said HTTP 200', async () => {
    mockFetch(() => ({ status: 200, body: { error: 101, msg: 'Invalid token', data: [] } }));

    await expect(client().getLastForAll()).rejects.toThrow(EagleTrackApiError);
    await expect(client().getLastForAll()).rejects.toThrow(/101.*Invalid token/);
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

    await expect(client().getLastForAll()).resolves.toHaveLength(1);
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
});

describe('verifyCredentials', () => {
  it('returns true on a successful cheap probe against the roster endpoint', async () => {
    const calls = mockFetch(() => ({ body: { error: 0, msg: '', data: [] } }));

    await expect(client().verifyCredentials()).resolves.toBe(true);
    expect(calls[0].url).toContain('/api2/trackers');
    expect(calls[0].url).toContain('pageSize=1');
    // Must not be a fleet-wide pull.
    expect(calls[0].url).not.toContain('/api2/last');
  });

  it('returns false for a coherent vendor rejection', async () => {
    mockFetch(() => ({ status: 200, body: { error: 101, msg: 'Invalid token' } }));
    await expect(client().verifyCredentials()).resolves.toBe(false);
  });

  it('RETHROWS a transport failure rather than reporting invalid credentials -- an unreachable host is not a bad token', async () => {
    mockFetch(() => ({ status: 503, body: {} }));
    await expect(client().verifyCredentials()).rejects.toThrow(EagleTrackApiError);
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

  it('returns an empty array when data is not an array, instead of throwing', async () => {
    mockFetch(() => ({ body: { error: 0, data: {} } }));
    await expect(client().getTrackers()).resolves.toEqual([]);
  });
});

// tests/unit/telematics/eagletrack-config-form-schema.spec.ts
//
// Pure validation-logic coverage for
// frontend/modules/telematics/schemas/eagletrack.schema.ts -- the form
// schema behind Organization Settings -> Integrations -> Eagle Track.
// Same coverage style as the Cartrack equivalent, and for the same
// reason it tests the schema rather than rendering the component: the
// project's Jest config is node-environment only (see
// tests/unit/telematics/cartrack-config-form-schema.spec.ts's header).
//
// The Cartrack suite's "rejects a missing baseUrl rather than silently
// defaulting it" case has no counterpart here because Eagle Track has no
// default on EITHER side -- the backend schema requires `domain` too.
// That difference is asserted directly below.

import {
  eagletrackConfigFormSchema,
  isInsecureDomain,
} from '../../../frontend/modules/telematics/schemas/eagletrack.schema';
import { eagletrackConfigSchema } from '../../../shared/validations/eagletrack.schema';

const VALID = {
  enabled: true,
  domain: 'https://gps.example.com',
  // PHASE 0, F-6: replaced a real-looking 26-char vendor token literal
  // (same shape as the production Eagle Track credential) with an
  // obviously-synthetic value. The schema under test only checks length
  // and character class, so nothing about this suite depends on the value.
  token: 'TEST_EAGLETRACK_TOKEN_synthetic',
};

describe('eagletrackConfigFormSchema', () => {
  it('accepts a fully populated, valid payload', () => {
    expect(eagletrackConfigFormSchema.safeParse(VALID).success).toBe(true);
  });

  it.each(['domain', 'token'] as const)(
    'rejects an empty %s (mirrors the backend eagletrackConfigSchema requirement)',
    (field) => {
      expect(eagletrackConfigFormSchema.safeParse({ ...VALID, [field]: '' }).success).toBe(false);
    }
  );

  it('rejects a non-URL domain', () => {
    expect(eagletrackConfigFormSchema.safeParse({ ...VALID, domain: 'gps.example.com' }).success).toBe(false);
    expect(eagletrackConfigFormSchema.safeParse({ ...VALID, domain: 'not-a-url' }).success).toBe(false);
  });

  it('rejects a non-http(s) scheme -- an ftp:// or file:// domain is never a valid api2 endpoint', () => {
    expect(eagletrackConfigFormSchema.safeParse({ ...VALID, domain: 'ftp://gps.example.com' }).success).toBe(false);
  });

  it('accepts a plain-http domain: many Eagle Track deployments have no TLS, and rejecting them would make the integration unusable', () => {
    expect(eagletrackConfigFormSchema.safeParse({ ...VALID, domain: 'http://test.livegts.com' }).success).toBe(true);
  });

  it('requires enabled to be a boolean, not e.g. a truthy string', () => {
    expect(eagletrackConfigFormSchema.safeParse({ ...VALID, enabled: 'true' }).success).toBe(false);
  });

  it('never treats the token as optional -- every save round-trip must re-supply it', () => {
    const { token: _omit, ...withoutToken } = VALID;
    expect(eagletrackConfigFormSchema.safeParse(withoutToken).success).toBe(false);
  });

  it('requires the domain rather than defaulting it, unlike Cartrack -- Eagle Track has no vendor-wide URL to guess', () => {
    const { domain: _omit, ...withoutDomain } = VALID;
    expect(eagletrackConfigFormSchema.safeParse(withoutDomain).success).toBe(false);
    // Same rule on the backend: a payload with no domain must not parse
    // into a document with an invented one.
    expect(eagletrackConfigSchema.safeParse(withoutDomain).success).toBe(false);
  });
});

describe('form schema and backend schema agree', () => {
  // The two schemas are duplicated in shape (see the form schema's
  // header). This proves they are not duplicated in RULE -- a payload
  // the form accepts must survive the server's re-validation, or the
  // user gets a 400 from a form that told them everything was fine.
  const cases = [
    VALID,
    { ...VALID, enabled: false },
    { ...VALID, domain: 'http://test.livegts.com' },
    { ...VALID, domain: '' },
    { ...VALID, token: '' },
    { ...VALID, domain: 'not-a-url' },
    { ...VALID, domain: 'ftp://gps.example.com' },
    { ...VALID, enabled: 'true' },
  ];

  it.each(cases.map((c, i) => [i, c] as const))('agree on case %i', (_i, payload) => {
    expect(eagletrackConfigFormSchema.safeParse(payload).success).toBe(
      eagletrackConfigSchema.safeParse(payload).success
    );
  });
});

describe('isInsecureDomain', () => {
  it('flags http and not https', () => {
    expect(isInsecureDomain('http://test.livegts.com')).toBe(true);
    expect(isInsecureDomain('https://gps.example.com')).toBe(false);
  });

  it('does not flag an incomplete or unparseable value while the user is still typing', () => {
    expect(isInsecureDomain('')).toBe(false);
    expect(isInsecureDomain(undefined)).toBe(false);
    expect(isInsecureDomain('htt')).toBe(false);
  });
});

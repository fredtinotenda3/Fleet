// tests/unit/telematics/cartrack-config-form-schema.spec.ts
//
// Pure validation-logic coverage for
// frontend/modules/telematics/schemas/cartrack.schema.ts -- the form
// schema behind the Organization Settings -> Integrations -> Cartrack
// card. Runs under the project's existing node-environment Jest config
// (jest.config.js has no jsdom/React Testing Library set up and its
// `roots`/`testMatch` only pick up tests/**/*.spec.ts), so this
// deliberately tests the schema in isolation rather than rendering the
// component -- see the delivery report's REMAINING GAPS note for why a
// true component-render test isn't possible without a testing-infra
// change that's out of scope for this pass.

import { cartrackConfigFormSchema } from '../../../frontend/modules/telematics/schemas/cartrack.schema';

const VALID = {
  enabled: true,
  accountId: 'acc-123',
  apiKey: 'key-123',
  apiSecret: 'super-secret-value',
  baseUrl: 'https://fleetapi.cartrack.com',
};

describe('cartrackConfigFormSchema', () => {
  it('accepts a fully populated, valid payload', () => {
    const result = cartrackConfigFormSchema.safeParse(VALID);
    expect(result.success).toBe(true);
  });

  it.each(['accountId', 'apiKey', 'apiSecret'] as const)(
    'rejects an empty %s (mirrors the backend cartrackConfigSchema requirement)',
    (field) => {
      const result = cartrackConfigFormSchema.safeParse({ ...VALID, [field]: '' });
      expect(result.success).toBe(false);
    }
  );

  it('rejects a non-URL baseUrl', () => {
    const result = cartrackConfigFormSchema.safeParse({ ...VALID, baseUrl: 'not-a-url' });
    expect(result.success).toBe(false);
  });

  it('rejects a missing baseUrl rather than silently defaulting it -- the form always shows the field, unlike the backend schema which defaults it', () => {
    const { baseUrl: _omit, ...withoutBaseUrl } = VALID;
    const result = cartrackConfigFormSchema.safeParse(withoutBaseUrl);
    expect(result.success).toBe(false);
  });

  it('requires enabled to be a boolean, not e.g. a truthy string', () => {
    const result = cartrackConfigFormSchema.safeParse({ ...VALID, enabled: 'true' });
    expect(result.success).toBe(false);
  });

  it('never appears to accept apiSecret as optional -- every save round-trip must re-supply it', () => {
    const { apiSecret: _omit, ...withoutSecret } = VALID;
    const result = cartrackConfigFormSchema.safeParse(withoutSecret);
    expect(result.success).toBe(false);
  });
});

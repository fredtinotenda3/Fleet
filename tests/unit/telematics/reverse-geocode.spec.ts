// tests/unit/telematics/reverse-geocode.spec.ts
//
// The reverse geocoder's contract is mostly about what it does NOT do:
// never guess an address, never cache a network failure, never let a
// third-party outage break the telemetry panel it is attached to.

import {
  formatNominatimAddress,
} from '../../../modules/telematics/services/reverse-geocode.service';
import { geocodeCell } from '../../../modules/telematics/repositories/geocode-cache.repository';

jest.mock('../../../infrastructure/monitoring/logger', () => ({
  monitoring: { logWarn: jest.fn(), logError: jest.fn(), logInfo: jest.fn() },
}));

describe('address formatting', () => {
  it('renders road then locality -- the order an operator reads', () => {
    expect(
      formatNominatimAddress({ road: 'Suffolk Road', city: 'Harare', postcode: '00263' }).line
    ).toBe('Suffolk Road, Harare');
  });

  it('falls back to a locality alone when there is no road', () => {
    // "or similar locality if available" -- open country still has a
    // useful answer.
    expect(formatNominatimAddress({ village: 'Domboshava' }).line).toBe('Domboshava');
  });

  it('returns null rather than the full postal display_name', () => {
    // display_name is a full postal string that does not fit the field
    // and buries the useful part, so it is deliberately not a fallback.
    expect(formatNominatimAddress({ display_name: '12, Suffolk Road, Belvedere, Harare' }).line).toBeNull();
    expect(formatNominatimAddress(undefined).line).toBeNull();
  });
});

describe('cache key', () => {
  it('collapses GPS jitter onto one grid cell', () => {
    // A stationary vehicle must cost ONE upstream request for its whole
    // stay, not one per 10-second poll -- that is how a free service
    // blocks a deployment's IP.
    expect(geocodeCell(-17.8251999, 31.0522111)).toBe(geocodeCell(-17.8252001, 31.0522222));
  });

  it('separates cells that are genuinely different places', () => {
    expect(geocodeCell(-17.8252, 31.0522)).not.toBe(geocodeCell(-17.8352, 31.0522));
  });
});

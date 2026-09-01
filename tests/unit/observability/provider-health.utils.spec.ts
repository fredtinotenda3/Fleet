// tests/unit/observability/provider-health.utils.spec.ts
//
// Pure-function tests for the Provider Health dashboard's formatting
// helpers. No React/jsdom involved -- this repo's jest.config.js runs
// under testEnvironment: 'node' with no React Testing Library wired
// up, so component rendering isn't exercised here; these functions
// are deliberately kept dependency-free specifically so their logic
// (duration/timestamp formatting, status -> presentation mapping) can
// still be verified directly.

import {
  statusPresentation,
  statusLabel,
  formatDuration,
  formatTimestamp,
  formatErrorCategory,
} from '@/frontend/modules/observability/utils/provider-health.utils';
import type { ProviderHealthStatus } from '@/frontend/modules/observability/types';

describe('provider-health.utils', () => {
  describe('statusPresentation', () => {
    it('maps every known status to a distinct presentation', () => {
      const statuses: ProviderHealthStatus[] = ['healthy', 'degraded', 'unavailable', 'unknown'];
      const seen = new Set<string>();

      for (const status of statuses) {
        const presentation = statusPresentation(status);
        expect(presentation.badgeVariant).toBeTruthy();
        expect(presentation.dotClassName).toBeTruthy();
        seen.add(presentation.dotClassName);
      }

      // Four different statuses should not silently collapse into the
      // same visual treatment -- that would make degraded and
      // unavailable indistinguishable at a glance, defeating the point
      // of the dashboard.
      expect(seen.size).toBe(4);
    });

    it('renders unknown as neutral, not alarming', () => {
      const presentation = statusPresentation('unknown');
      expect(presentation.badgeVariant).toBe('secondary');
    });

    it('renders unavailable as destructive', () => {
      const presentation = statusPresentation('unavailable');
      expect(presentation.badgeVariant).toBe('destructive');
    });

    it('falls back to the unknown presentation for an unrecognized value', () => {
      const presentation = statusPresentation('made-up-status' as ProviderHealthStatus);
      expect(presentation).toEqual(statusPresentation('unknown'));
    });
  });

  describe('statusLabel', () => {
    it('produces a capitalized, human label for each status', () => {
      expect(statusLabel('healthy')).toBe('Healthy');
      expect(statusLabel('degraded')).toBe('Degraded');
      expect(statusLabel('unavailable')).toBe('Unavailable');
      expect(statusLabel('unknown')).toBe('Unknown');
    });
  });

  describe('formatDuration', () => {
    it('returns null for null, undefined, negative, or NaN input', () => {
      expect(formatDuration(null)).toBeNull();
      expect(formatDuration(undefined)).toBeNull();
      expect(formatDuration(-1)).toBeNull();
      expect(formatDuration(Number.NaN)).toBeNull();
    });

    it('renders sub-minute durations as "<1m"', () => {
      expect(formatDuration(0)).toBe('<1m');
      expect(formatDuration(30_000)).toBe('<1m');
    });

    it('renders minutes only', () => {
      expect(formatDuration(5 * 60_000)).toBe('5m');
    });

    it('renders hours and minutes', () => {
      expect(formatDuration(2 * 60 * 60_000 + 15 * 60_000)).toBe('2h 15m');
    });

    it('drops the minutes component when it is zero', () => {
      expect(formatDuration(3 * 60 * 60_000)).toBe('3h');
    });

    it('renders days and hours, dropping minutes at that scale', () => {
      const ms = 3 * 24 * 60 * 60_000 + 4 * 60 * 60_000 + 45 * 60_000;
      expect(formatDuration(ms)).toBe('3d 4h');
    });

    it('drops the hours component when it is zero at the day scale', () => {
      expect(formatDuration(2 * 24 * 60 * 60_000)).toBe('2d');
    });
  });

  describe('formatTimestamp', () => {
    it('returns "Never" for null, undefined, or an unparseable string', () => {
      expect(formatTimestamp(null)).toBe('Never');
      expect(formatTimestamp(undefined)).toBe('Never');
      expect(formatTimestamp('not-a-date')).toBe('Never');
    });

    it('formats a valid ISO timestamp into a non-empty string', () => {
      const formatted = formatTimestamp('2026-01-15T10:30:00.000Z');
      expect(formatted).not.toBe('Never');
      expect(formatted.length).toBeGreaterThan(0);
    });
  });

  describe('formatErrorCategory', () => {
    it('returns null for null, undefined, or empty input', () => {
      expect(formatErrorCategory(null)).toBeNull();
      expect(formatErrorCategory(undefined)).toBeNull();
      expect(formatErrorCategory('')).toBeNull();
    });

    it('replaces underscores and hyphens with spaces and capitalizes the first letter', () => {
      expect(formatErrorCategory('rotate_credentials')).toBe('Rotate credentials');
      expect(formatErrorCategory('vendor-outage')).toBe('Vendor outage');
    });

    it('never leaks the raw category unchanged when it needs reformatting', () => {
      expect(formatErrorCategory('auth_expired')).not.toBe('auth_expired');
    });
  });
});

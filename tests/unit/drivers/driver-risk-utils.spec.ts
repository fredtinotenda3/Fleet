// tests/unit/drivers/driver-risk-utils.spec.ts
//
// Pure-function tests for the Driver Scorecard's formatting/presentation
// helpers (frontend/modules/ai/utils/driver-risk.utils.ts). No React/
// jsdom involved -- this repo's jest.config.js runs under
// testEnvironment: 'node' with no React Testing Library wired up (see
// tests/unit/observability/provider-health.utils.spec.ts for the same
// convention), so these functions are deliberately dependency-free
// specifically so their logic can be verified directly.

import {
  riskLevelPresentation,
  riskLevelLabel,
  formatRiskScore,
  formatSubScore,
  formatRiskTimestamp,
  formatTrendAxisLabel,
  incidentSeverityPresentation,
  formatEvidenceLine,
  sortIncidentsByRecency,
} from '@/frontend/modules/ai/utils/driver-risk.utils';
import type { DriverRiskLevel, DriverRiskEvidence, DriverRiskIncident } from '@/frontend/modules/ai/types/driver-risk.types';

describe('driver-risk.utils', () => {
  describe('riskLevelPresentation', () => {
    it('maps every known risk level to a distinct presentation', () => {
      const levels: DriverRiskLevel[] = ['low', 'medium', 'high', 'critical'];
      const seen = new Set<string>();

      for (const level of levels) {
        const presentation = riskLevelPresentation(level);
        expect(presentation.badgeVariant).toBeTruthy();
        seen.add(`${presentation.badgeVariant}:${presentation.badgeClassName}`);
      }

      // Four risk levels should not silently collapse into the same
      // visual treatment -- that would make e.g. 'high' and 'critical'
      // indistinguishable at a glance, defeating the point of a
      // scorecard that may inform employment decisions.
      expect(seen.size).toBe(4);
    });

    it('renders low as an outline/success-styled badge', () => {
      const presentation = riskLevelPresentation('low');
      expect(presentation.badgeVariant).toBe('outline');
      expect(presentation.badgeClassName).toContain('success');
    });

    it('renders high and critical as destructive', () => {
      expect(riskLevelPresentation('high').badgeVariant).toBe('destructive');
      expect(riskLevelPresentation('critical').badgeVariant).toBe('destructive');
    });

    it('falls back to a neutral secondary presentation for an unrecognized value', () => {
      const presentation = riskLevelPresentation('made-up-level' as DriverRiskLevel);
      expect(presentation.badgeVariant).toBe('secondary');
    });
  });

  describe('riskLevelLabel', () => {
    it('produces a capitalized, human label for each level', () => {
      expect(riskLevelLabel('low')).toBe('Low');
      expect(riskLevelLabel('medium')).toBe('Medium');
      expect(riskLevelLabel('high')).toBe('High');
      expect(riskLevelLabel('critical')).toBe('Critical');
    });

    it('falls back to "Unknown" for an unrecognized value', () => {
      expect(riskLevelLabel('made-up-level' as DriverRiskLevel)).toBe('Unknown');
    });
  });

  describe('formatRiskScore', () => {
    it('returns an em dash for null, undefined, or NaN', () => {
      expect(formatRiskScore(null)).toBe('\u2014');
      expect(formatRiskScore(undefined)).toBe('\u2014');
      expect(formatRiskScore(Number.NaN)).toBe('\u2014');
    });

    it('rounds to the nearest whole number', () => {
      expect(formatRiskScore(42.4)).toBe('42');
      expect(formatRiskScore(42.6)).toBe('43');
    });

    it('clamps values outside 0-100', () => {
      expect(formatRiskScore(-10)).toBe('0');
      expect(formatRiskScore(140)).toBe('100');
    });
  });

  describe('formatSubScore', () => {
    it('returns an em-dash form for null, undefined, or NaN', () => {
      expect(formatSubScore(null)).toBe('\u2014 / 100');
      expect(formatSubScore(undefined)).toBe('\u2014 / 100');
      expect(formatSubScore(Number.NaN)).toBe('\u2014 / 100');
    });

    it('formats a valid score as "N / 100"', () => {
      expect(formatSubScore(37)).toBe('37 / 100');
    });

    it('clamps and rounds out-of-range values', () => {
      expect(formatSubScore(-5)).toBe('0 / 100');
      expect(formatSubScore(123.6)).toBe('100 / 100');
    });
  });

  describe('formatRiskTimestamp', () => {
    it('returns "Unknown" for null, undefined, or an unparseable string', () => {
      expect(formatRiskTimestamp(null)).toBe('Unknown');
      expect(formatRiskTimestamp(undefined)).toBe('Unknown');
      expect(formatRiskTimestamp('not-a-date')).toBe('Unknown');
    });

    it('formats a valid ISO timestamp into a non-empty string', () => {
      const formatted = formatRiskTimestamp('2026-01-15T10:30:00.000Z');
      expect(formatted).not.toBe('Unknown');
      expect(formatted.length).toBeGreaterThan(0);
    });
  });

  describe('formatTrendAxisLabel', () => {
    it('returns an empty string for null, undefined, or an unparseable string', () => {
      expect(formatTrendAxisLabel(null)).toBe('');
      expect(formatTrendAxisLabel(undefined)).toBe('');
      expect(formatTrendAxisLabel('not-a-date')).toBe('');
    });

    it('formats a valid ISO timestamp into a short label', () => {
      const label = formatTrendAxisLabel('2026-01-15T10:30:00.000Z');
      expect(label.length).toBeGreaterThan(0);
      // Should be short enough for a chart axis tick -- no year, no time.
      expect(label.length).toBeLessThan(10);
    });
  });

  describe('incidentSeverityPresentation', () => {
    it('maps "High" to the high risk-level presentation', () => {
      expect(incidentSeverityPresentation('High')).toEqual(riskLevelPresentation('high'));
    });

    it('maps "Medium" to the medium risk-level presentation', () => {
      expect(incidentSeverityPresentation('Medium')).toEqual(riskLevelPresentation('medium'));
    });

    it('falls back to a neutral presentation for any other value', () => {
      const presentation = incidentSeverityPresentation('critical');
      expect(presentation.badgeVariant).toBe('secondary');
    });

    it('is case-sensitive, matching exactly what the backend sends', () => {
      const presentation = incidentSeverityPresentation('high');
      expect(presentation.badgeVariant).toBe('secondary');
    });
  });

  describe('formatEvidenceLine', () => {
    it('joins source and reference when optional fields are absent', () => {
      const evidence: DriverRiskEvidence = { source: 'tbltrips', reference: 'trip_123' };
      expect(formatEvidenceLine(evidence)).toBe('tbltrips \u00b7 trip_123');
    });

    it('includes observedAt when present, formatted as a date', () => {
      const evidence: DriverRiskEvidence = {
        source: 'tbltelematics',
        reference: 'reading_1',
        observedAt: '2026-01-15T10:30:00.000Z',
      };
      const line = formatEvidenceLine(evidence);
      expect(line).toContain('tbltelematics');
      expect(line).toContain('reading_1');
      expect(line).not.toContain('2026-01-15T10:30:00.000Z'); // formatted, not raw ISO
    });

    it('includes value when present, even when it is 0', () => {
      const evidence: DriverRiskEvidence = { source: 'tbltelematics', reference: 'reading_2', value: 0 };
      expect(formatEvidenceLine(evidence)).toBe('tbltelematics \u00b7 reading_2 \u00b7 0');
    });

    it('never fabricates a value for a genuinely absent field', () => {
      const evidence: DriverRiskEvidence = { source: 'tbltrips', reference: 'trip_456' };
      const line = formatEvidenceLine(evidence);
      expect(line.split('\u00b7')).toHaveLength(2);
    });
  });

  describe('sortIncidentsByRecency', () => {
    const makeIncident = (date: string, type = 'Speeding'): DriverRiskIncident => ({
      date,
      type,
      severity: 'Medium',
      location: '0, 0',
    });

    it('sorts incidents newest first', () => {
      const incidents = [
        makeIncident('2026-01-01T00:00:00.000Z'),
        makeIncident('2026-03-01T00:00:00.000Z'),
        makeIncident('2026-02-01T00:00:00.000Z'),
      ];
      const sorted = sortIncidentsByRecency(incidents);
      expect(sorted.map((i) => i.date)).toEqual([
        '2026-03-01T00:00:00.000Z',
        '2026-02-01T00:00:00.000Z',
        '2026-01-01T00:00:00.000Z',
      ]);
    });

    it('does not mutate the input array', () => {
      const incidents = [makeIncident('2026-01-01T00:00:00.000Z'), makeIncident('2026-03-01T00:00:00.000Z')];
      const original = [...incidents];
      sortIncidentsByRecency(incidents);
      expect(incidents).toEqual(original);
    });

    it('treats unparseable dates as oldest rather than throwing', () => {
      const incidents = [makeIncident('not-a-date'), makeIncident('2026-01-01T00:00:00.000Z')];
      const sorted = sortIncidentsByRecency(incidents);
      expect(sorted[0].date).toBe('2026-01-01T00:00:00.000Z');
    });

    it('returns an empty array for an empty input', () => {
      expect(sortIncidentsByRecency([])).toEqual([]);
    });
  });
});

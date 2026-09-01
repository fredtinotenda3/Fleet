// tests/unit/observability/observability-utils.spec.ts
//
// Pure-function tests for the outbox-status helpers added alongside
// the Operational Dashboard. Same rationale as
// provider-health.utils.spec.ts: this repo's Jest runs under
// testEnvironment: 'node' with no jsdom/React Testing Library, so
// these are plain-function tests, not component renders.

import {
  outboxStatusPresentation,
  outboxStatusLabel,
  formatCount,
} from '@/frontend/modules/observability/utils/provider-health.utils';
import type { OutboxStatus } from '@/frontend/modules/observability/types';

describe('observability-utils (outbox helpers)', () => {
  describe('outboxStatusPresentation', () => {
    it('renders dead_letter as destructive regardless of framing', () => {
      // The one status that must never look calm: a non-zero,
      // non-decreasing dead-letter count means events are being
      // permanently lost (see app/api/observability/outbox/route.ts).
      expect(outboxStatusPresentation('dead_letter').badgeVariant).toBe('destructive');
    });

    it('renders processed as healthy', () => {
      expect(outboxStatusPresentation('processed').badgeVariant).toBe('outline');
      expect(outboxStatusPresentation('processed').dotClassName).toBe('bg-success');
    });

    it('renders pending and processing as neutral operating states, not problems', () => {
      expect(outboxStatusPresentation('pending').badgeVariant).toBe('secondary');
      expect(outboxStatusPresentation('processing').badgeVariant).toBe('secondary');
    });

    it('gives dead_letter a visually distinct presentation from every other status', () => {
      const statuses: OutboxStatus[] = ['pending', 'processing', 'processed'];
      const deadLetterDot = outboxStatusPresentation('dead_letter').dotClassName;

      for (const status of statuses) {
        expect(outboxStatusPresentation(status).dotClassName).not.toBe(deadLetterDot);
      }
    });
  });

  describe('outboxStatusLabel', () => {
    it('produces a human label for every status, including the underscored one', () => {
      expect(outboxStatusLabel('pending')).toBe('Pending');
      expect(outboxStatusLabel('processing')).toBe('Processing');
      expect(outboxStatusLabel('processed')).toBe('Processed');
      expect(outboxStatusLabel('dead_letter')).toBe('Dead letter');
    });

    it('never leaks the raw snake_case status to the label', () => {
      expect(outboxStatusLabel('dead_letter')).not.toContain('_');
    });
  });

  describe('formatCount', () => {
    it('renders zero as a real, plain value -- not a dash', () => {
      // A dashboard where 0 and "no data" look identical is exactly
      // the wrong behavior for a dead-letter count: zero dead letters
      // is the good outcome and must be legible as a number, not
      // mistaken for missing data.
      expect(formatCount(0)).toBe('0');
    });

    it('renders missing data (null/undefined/NaN) as an em dash', () => {
      expect(formatCount(null)).toBe('\u2014');
      expect(formatCount(undefined)).toBe('\u2014');
      expect(formatCount(Number.NaN)).toBe('\u2014');
    });

    it('formats large counts with locale grouping', () => {
      expect(formatCount(12345)).toBe((12345).toLocaleString());
    });
  });
});

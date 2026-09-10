// tests/unit/onboarding/empty-state-copy.spec.ts
//
// ---------------------------------------------------------------------
// THE DEFECT THIS PINS
// ---------------------------------------------------------------------
// Every empty state in the product was written for an established fleet
// on a quiet day, and then shown to organisations that had not added a
// single vehicle:
//
//   MaintenanceWidget      "Nothing due -- your fleet is up to date."
//   NeedsAttentionWidget   "Nothing needs attention right now -- your
//                           fleet is in good shape."
//   AttentionQueueList     a GREEN TICK enumerating five subsystems as
//                          checked and clear
//   CommandCentrePage      a green "Critical 0 / Nothing critical"
//   KPIsWidget             a green "Open maintenance 0"
//   MaintenanceStatsCards  "All caught up", and a green "0.0%"
//   OverviewStatsGrid      "All invitations resolved", never having sent
//                          one
//
// Every one is reassurance about work that was never started. Taken
// together they tell a brand-new customer, on their first login, that
// seven subsystems have been checked and everything is fine -- which is
// both false and the reason they have no idea anything is missing.
//
// Copy this consequential is a decision, and jest here runs
// `testEnvironment: 'node'` with no jsdom, so the decision has to live
// outside JSX to be testable at all. That is what empty-state-copy.ts is.

import {
  emptyCopy,
  fleetPresence,
  zeroTone,
  type EmptySubject,
  type FleetPresence,
} from '../../../frontend/modules/onboarding/utils/empty-state-copy';

const SUBJECTS: EmptySubject[] = [
  'maintenance',
  'attention',
  'critical',
  'maintenance-stats',
  'work-orders',
  'trips',
  'fuel',
  'expenses',
];

describe('fleetPresence', () => {
  it('reads a real count', () => {
    expect(fleetPresence(0)).toBe('empty');
    expect(fleetPresence(1)).toBe('populated');
    expect(fleetPresence(412)).toBe('populated');
  });

  it('NEVER reads an unanswered or failed count as empty', () => {
    // The whole module hangs off this. Telling a customer with 400
    // trucks to "add your first vehicle" because a count request timed
    // out is its own lie, and a more embarrassing one.
    expect(fleetPresence(undefined)).toBe('unknown');
    expect(fleetPresence(null)).toBe('unknown');
    expect(fleetPresence(0, false)).toBe('unknown');
    expect(fleetPresence(412, false)).toBe('unknown');
  });
});

describe('an organisation with no vehicles is never congratulated', () => {
  it.each(SUBJECTS)('%s: no reassurance, and a way forward', (subject) => {
    const copy = emptyCopy(subject, 'empty');

    // Not good news. `positive` renders a green success tick.
    expect({ subject, tone: copy.tone }).toEqual({ subject, tone: 'neutral' });

    // None of the sentences that were actually shipped.
    const text = `${copy.title} ${copy.description}`.toLowerCase();
    for (const banned of [
      'up to date',
      'in good shape',
      'all caught up',
      'all clear',
      'currently needs a decision',
      'resolved',
    ]) {
      expect({ subject, banned, present: text.includes(banned) }).toEqual({
        subject,
        banned,
        present: false,
      });
    }

    // Says what is missing and what to do -- the brief's three questions:
    // what is missing, why it matters, what to do next.
    expect(copy.action?.href).toBe('/vehicles?new=1');
    expect(copy.description.length).toBeGreaterThan(30);
  });
});

describe('an established fleet still gets the good news', () => {
  it('keeps the positive tone where silence really is all-clear', () => {
    // The opposite failure. An operations console whose quiet day looks
    // like a broken screen is its own defect, and the reason the
    // original copy existed.
    expect(emptyCopy('attention', 'populated').tone).toBe('positive');
    expect(emptyCopy('maintenance', 'populated').tone).toBe('positive');
    expect(emptyCopy('critical', 'populated').tone).toBe('positive');
    expect(emptyCopy('attention', 'populated').description).toMatch(/needs a decision/);
  });

  it('offers no "add your first vehicle" to someone who has 400', () => {
    for (const subject of SUBJECTS) {
      expect({ subject, action: emptyCopy(subject, 'populated').action }).toEqual({
        subject,
        action: undefined,
      });
    }
  });

  it('a period-scoped empty is neutral, not a celebration', () => {
    // "No trips in this period" is not good news -- it may be exactly
    // the problem the operator is investigating.
    for (const subject of ['trips', 'fuel', 'expenses'] as const) {
      expect({ subject, tone: emptyCopy(subject, 'populated').tone }).toEqual({
        subject,
        tone: 'neutral',
      });
    }
  });
});

describe('an unknown fleet size falls back to the established wording', () => {
  it.each(SUBJECTS)('%s matches the populated copy exactly', (subject) => {
    expect(emptyCopy(subject, 'unknown')).toEqual(emptyCopy(subject, 'populated'));
  });
});

describe('zeroTone', () => {
  it('earns green only when there is a fleet the zero could be about', () => {
    expect(zeroTone('populated')).toBe('positive');
    expect(zeroTone('empty')).toBe('neutral');
    expect(zeroTone('unknown')).toBe('neutral');
  });
});

describe('every subject is covered', () => {
  it('returns copy for all three presences of every subject', () => {
    const presences: FleetPresence[] = ['unknown', 'empty', 'populated'];
    for (const subject of SUBJECTS) {
      for (const presence of presences) {
        const copy = emptyCopy(subject, presence);
        expect({ subject, presence, ok: Boolean(copy?.title && copy?.description) }).toEqual({
          subject,
          presence,
          ok: true,
        });
      }
    }
  });
});

// frontend/modules/onboarding/utils/empty-state-copy.ts
//
// ---------------------------------------------------------------------
// "NOTHING TO DO" AND "NOTHING TO DO IT WITH" ARE DIFFERENT SENTENCES
// ---------------------------------------------------------------------
// Every operational surface in this product has an empty branch, and
// every one of them was written for an ESTABLISHED fleet on a quiet day:
//
//   "Nothing due — your fleet is up to date."
//   "Nothing needs attention right now — your fleet is in good shape."
//   "Nothing across maintenance, fuel, expenses, compliance or driver
//    risk currently needs a decision."
//
// On a genuinely empty organisation every one of those is false, and
// false in the most expensive direction: they are reassurance. A brand
// new customer logs in, is told five subsystems have been checked and
// the fleet is in good shape, and has been given no reason to believe
// anything is missing — because the product just told them it is fine.
// They then either conclude the product does nothing, or, worse,
// believe it.
//
// The distinction is not something each component can work out for
// itself from its own empty list: a maintenance widget with no
// reminders cannot tell whether that means "no maintenance is due" or
// "there are no vehicles". It needs ONE extra fact — whether the
// organisation has any vehicles at all — and that fact is what
// `FleetPresence` carries.
//
// ---------------------------------------------------------------------
// WHY A PURE MODULE
// ---------------------------------------------------------------------
//   * jest here runs `testEnvironment: 'node'` with no jsdom, so a
//     decision embedded in JSX cannot be tested. Copy that must be
//     correct is a decision.
//   * Five call sites currently phrase this five ways. One table is how
//     they stay consistent when a sixth is added.
//   * `unknown` has to be handled deliberately at every site. It is the
//     state while the vehicle count is still loading OR its request
//     failed, and it must never be collapsed into `empty` — telling an
//     established fleet to "add your first vehicle" because a count
//     request timed out is its own kind of lie.

/**
 * Whether the organisation has any vehicles.
 *
 *   `unknown`   — not answered yet, or the answer failed. Never guess.
 *   `empty`     — answered, and the organisation has no vehicles.
 *   `populated` — answered, and it has at least one.
 */
export type FleetPresence = 'unknown' | 'empty' | 'populated';

/** The operational surfaces that need this distinction. */
export type EmptySubject =
  | 'maintenance'
  | 'attention'
  | 'critical'
  | 'maintenance-stats'
  | 'work-orders'
  | 'trips'
  | 'fuel'
  | 'expenses';

export interface EmptyCopy {
  /** Short line for a widget; also the EmptyState title. */
  title: string;
  /** The explanatory sentence. Never reassurance when nothing is set up. */
  description: string;
  /**
   * `positive` is EARNED — it means a real subsystem was checked and
   * found clear. An empty organisation gets `neutral`: there is nothing
   * to be positive about yet, and a green tick against a fleet that does
   * not exist is the defect this module removes.
   */
  tone: 'positive' | 'neutral';
  /** The next step, when there genuinely is one. */
  action?: { label: string; href: string };
}

const ADD_VEHICLE = { label: 'Add your first vehicle', href: '/vehicles?new=1' } as const;

/**
 * What the empty branch of `subject` should say, given whether the
 * organisation has any vehicles.
 *
 * The `unknown` and `populated` branches deliberately share copy: both
 * mean "we are not in a position to tell you to go and set up a fleet",
 * and the established-fleet wording is the safe reading of an
 * unanswered count.
 */
export function emptyCopy(subject: EmptySubject, presence: FleetPresence): EmptyCopy {
  if (presence === 'empty') {
    switch (subject) {
      case 'maintenance':
      case 'maintenance-stats':
        return {
          title: 'No maintenance scheduled',
          description:
            'Maintenance is tracked per vehicle. Add a vehicle and its service intervals to start seeing what is due.',
          tone: 'neutral',
          action: ADD_VEHICLE,
        };
      case 'attention':
      case 'critical':
        return {
          title: 'Nothing to monitor yet',
          description:
            'This queue watches maintenance, fuel, expenses, compliance and driver risk across your fleet. It stays empty until there is a fleet to watch.',
          tone: 'neutral',
          action: ADD_VEHICLE,
        };
      case 'work-orders':
        return {
          title: 'No work orders yet',
          description:
            'Work orders are raised against a vehicle. Add a vehicle to start recording repairs and their cost.',
          tone: 'neutral',
          action: ADD_VEHICLE,
        };
      case 'trips':
        return {
          title: 'No trips recorded',
          description:
            'Trips arrive from a connected telematics provider, or can be entered by hand against a vehicle.',
          tone: 'neutral',
          action: ADD_VEHICLE,
        };
      case 'fuel':
        return {
          title: 'No fuel logged',
          description:
            'Fuel logs are recorded against a vehicle and are what cost per kilometre is built from.',
          tone: 'neutral',
          action: ADD_VEHICLE,
        };
      case 'expenses':
        return {
          title: 'No expenses recorded',
          description: 'Expenses are recorded against a vehicle, a trip or a driver.',
          tone: 'neutral',
          action: ADD_VEHICLE,
        };
    }
  }

  // Established fleet (or a count we could not read). Here "nothing" IS
  // good news, and saying so is the point of an operations console.
  switch (subject) {
    case 'maintenance':
    case 'maintenance-stats':
      return {
        title: 'Nothing due',
        description: 'No maintenance is overdue or coming up across your fleet.',
        tone: 'positive',
      };
    case 'attention':
      return {
        title: 'No active attention items',
        description:
          'Nothing across maintenance, fuel, expenses, compliance or driver risk currently needs a decision.',
        tone: 'positive',
      };
    case 'critical':
      return {
        title: 'Nothing critical',
        description: 'No item currently needs action today.',
        tone: 'positive',
      };
    case 'work-orders':
      return {
        title: 'No open work orders',
        description: 'Nothing is currently in the workshop.',
        tone: 'positive',
      };
    case 'trips':
      return {
        title: 'No trips in this period',
        description: 'No trip was recorded for the selected range.',
        tone: 'neutral',
      };
    case 'fuel':
      return {
        title: 'No fuel logged in this period',
        description: 'No fuel log was recorded for the selected range.',
        tone: 'neutral',
      };
    case 'expenses':
      return {
        title: 'No expenses in this period',
        description: 'No expense was recorded for the selected range.',
        tone: 'neutral',
      };
  }
}

/**
 * The tone for a metric card whose value is 0.
 *
 * `KPIsWidget` painted "Open maintenance 0" GREEN on a fresh
 * organisation, via `overdueCount > 0 ? 'critical' : 'positive'`. Zero
 * out of zero is not an achievement, and green is the product asserting
 * one. On an established fleet the same zero is genuinely good news.
 */
export function zeroTone(presence: FleetPresence): 'positive' | 'neutral' {
  return presence === 'populated' ? 'positive' : 'neutral';
}

/**
 * Resolves the presence flag from a vehicle count that may not have
 * arrived.
 *
 * Takes the count as `number | null | undefined` on purpose: every
 * caller reads it from a query that can be pending or failed, and the
 * whole module depends on those two states NOT being read as zero.
 */
export function fleetPresence(
  vehicleCount: number | null | undefined,
  isSettled = true
): FleetPresence {
  if (!isSettled || vehicleCount === null || vehicleCount === undefined) return 'unknown';
  return vehicleCount > 0 ? 'populated' : 'empty';
}

// frontend/modules/onboarding/utils/setup-checklist.ts
//
// What a given user should do next, derived from what they may do and what
// their organization already has.
//
// ---------------------------------------------------------------------------
// THREE RULES THIS FILE ENFORCES
// ---------------------------------------------------------------------------
// 1. A step is only ever shown to someone who holds the permission to
//    COMPLETE it. A checklist that tells a mechanic to "add your first
//    vehicle" and then 403s them is worse than no checklist. Every step
//    therefore carries the permission its own write endpoint enforces —
//    verified against the routes, not guessed:
//      vehicles   POST /api/vehicles          VEHICLE_CREATE
//      drivers    POST /api/drivers           VEHICLE_EDIT   (documented
//                 stopgap: no Permission.DRIVER_* exists in the model)
//      org units  POST /api/tenancy/org-units ORG_UNIT_MANAGE
//      members    /organizations/members      ORG_MEMBERS_MANAGE
//      telematics GET/PUT .../config          ORG_SETTINGS
//      fuel cards POST /api/fuel-cards         FUEL_CREATE
//      maintenance POST /api/reminders         MAINTENANCE_CREATE
//      trips      POST /api/trips              TRIP_CREATE
//
// 2. A step must be VERIFIABLE. Every step's `done` is computed from a real
//    count or a real config flag the frontend can already read. Nothing here
//    is a checkbox the user ticks themselves, because a self-ticked checklist
//    tells you nothing about the state of the system and goes stale the
//    moment someone deletes the thing they ticked.
//
// 3. No step invents functionality. Each `href` points at a page that exists
//    today (pinned by the nav test's page-existence check, which covers these
//    routes too).

import { Permission, permissionService } from '@/server/permissions/roles';
import { ANCHOR_SETUP_PERMISSIONS, hasAnySetupPermission } from '@/server/permissions/landing';

export type SetupStepId =
  | 'org-units'
  | 'vehicles'
  | 'drivers'
  | 'members'
  | 'telematics'
  | 'distance-tracking'
  | 'fuel-setup'
  | 'maintenance-setup'
  | 'trip-operations'
  | 'operating-data';

export interface SetupStep {
  id: SetupStepId;
  title: string;
  /** Why this matters — what it unlocks. Not a restatement of the title. */
  description: string;
  href: string;
  actionLabel: string;
  done: boolean;
  /**
   * True when this step's underlying count could not be read — because the
   * request failed, or because the user cannot see it. Rendered as "unknown"
   * rather than as "not done": telling an administrator their fleet has no
   * vehicles because a request timed out is the same lie the empty-vs-error
   * work elsewhere in this overhaul removes.
   */
  indeterminate?: boolean;
  /** Shown next to the step when known, e.g. "12 vehicles". */
  detail?: string;
  /**
   * A second, non-destructive way to satisfy this step without doing
   * the primary action -- used only by the telematics and
   * distance-tracking steps, so a fleet with no GPS and no reliable
   * odometers is never stuck on a step it has no way to complete.
   * Resolved by the Setup Centre page (frontend/modules/onboarding/
   * components/SetupCentrePage.tsx) into a real PATCH
   * /api/organizations/[id]/fleet-profile call; this module stays a
   * pure function and does not perform it.
   */
  secondaryAction?: {
    label: string;
    kind: 'declare-no-gps' | 'declare-odometer-posture';
  };
}

/**
 * What the checklist knows about the organization.
 *
 * `null` means "not known" — the query has not run, is still running, failed,
 * or the user is not permitted to read it. Distinguished from `0`, which is a
 * real answer.
 */
export interface SetupFacts {
  vehicleCount: number | null;
  driverCount: number | null;
  orgUnitCount: number | null;
  memberCount: number | null;
  /** True when any telematics provider is configured AND enabled for this tenant. */
  telematicsConnected: boolean | null;
  /** True once the fleet has produced any operating record (fuel, expense or trip). */
  hasOperatingData: boolean | null;
  /**
   * Operator DECLARATIONS, not observations -- see
   * OrganizationFleetProfile (shared/types/organization.settings-
   * addendum.ts). `null` means undeclared, not "no": a fleet that has
   * never been asked is not the same as one that said no.
   */
  operatesWithoutGps: boolean | null;
  operatesWithoutOdometers: boolean | null;
  /** At least one fuel card OR fuel station is on file. */
  fuelSetupDone: boolean | null;
  /** At least one maintenance reminder/schedule exists for any vehicle. */
  maintenanceSetupDone: boolean | null;
  /** At least one trip has been recorded (by any entry method -- map-assisted, odometer, manual distance, or telemetry-generated). */
  tripRecorded: boolean | null;
}

export const EMPTY_SETUP_FACTS: SetupFacts = {
  vehicleCount: null,
  driverCount: null,
  orgUnitCount: null,
  memberCount: null,
  telematicsConnected: null,
  hasOperatingData: null,
  operatesWithoutGps: null,
  operatesWithoutOdometers: null,
  fuelSetupDone: null,
  maintenanceSetupDone: null,
  tripRecorded: null,
};

interface StepDefinition {
  id: SetupStepId;
  title: string;
  description: string;
  href: string;
  actionLabel: string;
  /** The permission required to COMPLETE the step, not merely to see the page. */
  permission: Permission;
  /**
   * The permission required to READ the count that decides whether the step
   * is done. Usually the same as `permission`; where it differs, a user could
   * hold the write permission and still never be able to see the step resolve
   * — leaving a checklist item stuck on "status unavailable" forever.
   */
  readPermission?: Permission;
  resolve: (facts: SetupFacts) => { done: boolean | null; detail?: string };
  secondaryAction?: {
    label: string;
    kind: 'declare-no-gps' | 'declare-odometer-posture';
  };
}

/**
 * WHY AN ANCHOR-PERMISSION GATE EXISTS — found by the unit test in
 * tests/unit/onboarding/setup-checklist.spec.ts, not by inspection: a DRIVER
 * holds FUEL_CREATE, because logging a refuel is their job. Without an anchor
 * check, a driver was handed a panel headed "Finish setting up your fleet"
 * containing the single item "Record your first operating cost" — reframing
 * their ordinary daily work as unfinished configuration. An ACCOUNTANT got
 * the same one-item checklist.
 *
 * Worse, a driver does NOT hold EXPENSE_VIEW, so the query behind that step
 * would have 403'd and the item would have sat on "status unavailable"
 * permanently, with no way to dismiss it short of the X button.
 *
 * The anchor list itself now lives in server/permissions/landing.ts (which
 * the post-login redirect also needs, and which must not import from
 * frontend/modules/*). Nothing in this file ever exported the list
 * itself (only this boolean), so there is nothing else to re-export.
 */

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? singular : pluralForm}`;
}

/**
 * Ordered by dependency, not by importance: a vehicle cannot be assigned to a
 * branch that does not exist, and telematics cannot map a tracker to a
 * vehicle that has not been created. Following the list top to bottom never
 * produces a step that cannot be completed yet.
 */
const STEP_DEFINITIONS: StepDefinition[] = [
  {
    id: 'org-units',
    title: 'Set up branches and departments',
    description:
      'Org units are what scope the platform. Vehicles, costs and reports are all filtered by the branch a user belongs to, so this decides who sees what.',
    href: '/organizations/teams',
    actionLabel: 'Add a branch',
    permission: Permission.ORG_UNIT_MANAGE,
    resolve: (facts) =>
      facts.orgUnitCount === null
        ? { done: null }
        : { done: facts.orgUnitCount > 0, detail: plural(facts.orgUnitCount, 'org unit') },
  },
  {
    id: 'vehicles',
    title: 'Add your vehicles',
    description:
      'The vehicle register is the spine of the platform — fuel, maintenance, trips, cost per km and every alert attach to a vehicle.',
    href: '/vehicles',
    actionLabel: 'Add a vehicle',
    permission: Permission.VEHICLE_CREATE,
    resolve: (facts) =>
      facts.vehicleCount === null
        ? { done: null }
        : { done: facts.vehicleCount > 0, detail: plural(facts.vehicleCount, 'vehicle') },
  },
  {
    id: 'drivers',
    title: 'Add your drivers',
    description:
      'Driver records are what make behaviour scoring, risk analysis and per-driver fuel accountability possible. Without them, trips and refuels have no owner.',
    href: '/drivers',
    actionLabel: 'Add a driver',
    // POST /api/drivers is gated on VEHICLE_EDIT — the documented stopgap
    // noted at the top of this file. Mirrored exactly rather than guessed.
    permission: Permission.VEHICLE_EDIT,
    resolve: (facts) =>
      facts.driverCount === null
        ? { done: null }
        : { done: facts.driverCount > 0, detail: plural(facts.driverCount, 'driver') },
  },
  {
    id: 'telematics',
    title: 'Connect telematics',
    description:
      'Connecting a tracking provider turns the platform live: real positions on the map, automatic odometer and fuel readings, and alerts raised without anyone filing them. No tracker yet? Say so — trips still work from the map and manual entry.',
    href: '/telematics/trackers',
    actionLabel: 'Connect a provider',
    permission: Permission.ORG_SETTINGS,
    // ADAPTIVE ONBOARDING: `operatesWithoutGps` is an explicit operator
    // declaration (shared/types/organization.settings-addendum.ts), not
    // an observation -- a fleet that says so is DONE with this step, not
    // "not done yet". Without this branch, a fleet with genuinely no GPS
    // would sit on this step forever with no way to ever resolve it,
    // which is exactly the blocking behaviour PART 2 of this upgrade
    // forbids. `secondaryAction` surfaces the opt-out in the Setup
    // Centre; GetStartedPanel's compact view ignores it harmlessly.
    resolve: (facts) =>
      facts.telematicsConnected === null && facts.operatesWithoutGps === null
        ? { done: null }
        : {
            done: facts.telematicsConnected === true || facts.operatesWithoutGps === true,
            detail: facts.operatesWithoutGps === true ? 'Operating without GPS' : undefined,
          },
    secondaryAction: { label: 'We operate without GPS', kind: 'declare-no-gps' },
  },
  {
    id: 'distance-tracking',
    title: 'Confirm odometer reliability',
    description:
      'Distance can come from GPS, odometer readings, a map-drawn route, or a manual entry — in that order of trust (see every trip\'s "Distance" field). Telling us odometers are not reliable here means trips default to map-assisted or manual distance instead of asking for a reading nobody can supply.',
    href: '/vehicles',
    actionLabel: 'Our odometers are reliable',
    permission: Permission.VEHICLE_CREATE,
    // A genuine declaration either way resolves this step -- "no
    // reliable odometers" is not a lesser answer than "yes", it is the
    // honest one for plenty of real fleets (PART 2's own examples).
    resolve: (facts) =>
      facts.operatesWithoutOdometers === null ? { done: null } : { done: true },
    secondaryAction: { label: "We don't have reliable odometers", kind: 'declare-odometer-posture' },
  },
  {
    id: 'fuel-setup',
    title: 'Set up fuel tracking',
    description:
      'Add the fuel cards or stations your drivers actually use. Cost-per-km and fuel-fraud detection are only as good as this list.',
    href: '/fuel/cards',
    actionLabel: 'Add a fuel card or station',
    permission: Permission.FUEL_CREATE,
    // The completion probe lists fuel cards/stations, which GET /api/fuel-cards
    // gates on FUEL_VIEW separately from the POST route's FUEL_CREATE.
    readPermission: Permission.FUEL_VIEW,
    resolve: (facts) =>
      facts.fuelSetupDone === null ? { done: null } : { done: facts.fuelSetupDone },
  },
  {
    id: 'maintenance-setup',
    title: 'Set up maintenance schedules',
    description:
      'A service reminder on at least one vehicle is what turns the Maintenance module from a blank list into a working schedule.',
    href: '/maintenance',
    actionLabel: 'Add a reminder',
    permission: Permission.MAINTENANCE_CREATE,
    // GET /api/reminders gates on MAINTENANCE_VIEW, separate from the
    // POST route's MAINTENANCE_CREATE.
    readPermission: Permission.MAINTENANCE_VIEW,
    resolve: (facts) =>
      facts.maintenanceSetupDone === null ? { done: null } : { done: facts.maintenanceSetupDone },
  },
  {
    id: 'trip-operations',
    title: 'Log your first trip',
    description:
      'Map-assisted, odometer, or manual — however this fleet records a journey, one real trip is what connects a vehicle and driver to an actual route, distance and (optionally) a fuel transaction.',
    href: '/trips',
    actionLabel: 'Log a trip',
    permission: Permission.TRIP_CREATE,
    // GET /api/trips gates on TRIP_VIEW, separate from the POST route's
    // TRIP_CREATE.
    readPermission: Permission.TRIP_VIEW,
    resolve: (facts) => (facts.tripRecorded === null ? { done: null } : { done: facts.tripRecorded }),
  },
  {
    id: 'members',
    title: 'Invite your team',
    description:
      'Give managers, mechanics and drivers their own logins. Each role sees only its own branch and its own work.',
    href: '/organizations/members',
    actionLabel: 'Invite members',
    permission: Permission.ORG_MEMBERS_MANAGE,
    resolve: (facts) =>
      facts.memberCount === null
        ? { done: null }
        : // More than one member means somebody other than the founding
          // account exists. A count of exactly 1 is the owner alone.
          { done: facts.memberCount > 1, detail: plural(facts.memberCount, 'member') },
  },
  {
    id: 'operating-data',
    title: 'Record your first operating cost',
    description:
      'Fuel and expense records are what the cost, consumption and anomaly intelligence is computed from. Until one exists, those views have nothing to analyse.',
    href: '/fuel/logs/create',
    actionLabel: 'Log a refuel',
    permission: Permission.FUEL_CREATE,
    // The completion probe reads the expense aggregate, so without
    // EXPENSE_VIEW this step could never resolve.
    readPermission: Permission.EXPENSE_VIEW,
    resolve: (facts) =>
      facts.hasOperatingData === null ? { done: null } : { done: facts.hasOperatingData },
  },
];

/** True when this user is someone who configures the organization. */
export function shouldShowSetupChecklist(roles: string[]): boolean {
  return hasAnySetupPermission(roles);
}

/**
 * The steps this user should see, in order.
 *
 * Returns `[]` when the user holds none of the setup permissions — an
 * operations user or a driver gets orientation instead of a checklist, since
 * there is nothing here they could act on.
 */
export function buildSetupChecklist(roles: string[], facts: SetupFacts): SetupStep[] {
  if (!shouldShowSetupChecklist(roles)) return [];

  return STEP_DEFINITIONS.filter(
    (definition) =>
      permissionService.hasPermission(roles, definition.permission) &&
      // A step whose completion this user could never observe is omitted
      // rather than shown as permanently unknown.
      (!definition.readPermission ||
        permissionService.hasPermission(roles, definition.readPermission))
  ).map((definition) => {
    const { done, detail } = definition.resolve(facts);
    return {
      id: definition.id,
      title: definition.title,
      description: definition.description,
      href: definition.href,
      actionLabel: definition.actionLabel,
      done: done === true,
      indeterminate: done === null,
      detail,
      secondaryAction: definition.secondaryAction,
    };
  });
}

export interface SetupProgress {
  steps: SetupStep[];
  completed: number;
  /** Steps whose state is known — the denominator for a percentage. */
  known: number;
  total: number;
  /** The first step that is known-incomplete, i.e. what to do next. */
  nextStep: SetupStep | null;
  /**
   * True only when every step is KNOWN and done. An indeterminate step keeps
   * this false, so a failed request can never make the platform announce that
   * setup is finished when it may not be.
   */
  isComplete: boolean;
  /** True while nothing is known yet — render a skeleton, not an empty checklist. */
  isIndeterminate: boolean;
}

export function summariseSetup(steps: SetupStep[]): SetupProgress {
  const known = steps.filter((step) => !step.indeterminate);
  const completed = known.filter((step) => step.done).length;
  const nextStep = steps.find((step) => !step.indeterminate && !step.done) ?? null;

  return {
    steps,
    completed,
    known: known.length,
    total: steps.length,
    nextStep,
    isComplete: steps.length > 0 && known.length === steps.length && completed === steps.length,
    isIndeterminate: steps.length > 0 && known.length === 0,
  };
}

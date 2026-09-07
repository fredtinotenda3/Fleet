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

export type SetupStepId =
  | 'org-units'
  | 'vehicles'
  | 'drivers'
  | 'members'
  | 'telematics'
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
}

export const EMPTY_SETUP_FACTS: SetupFacts = {
  vehicleCount: null,
  driverCount: null,
  orgUnitCount: null,
  memberCount: null,
  telematicsConnected: null,
  hasOperatingData: null,
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
}

/**
 * Holding one of these is what makes someone "a person setting this
 * organization up", and therefore what makes a setup checklist the right
 * thing to show them at all.
 *
 * WHY THIS GATE EXISTS — found by the unit test in
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
 * Deliberately excludes VEHICLE_EDIT and FUEL_CREATE: both are operational
 * permissions held by people who run a fleet rather than configure one.
 */
const ANCHOR_PERMISSIONS: Permission[] = [
  Permission.ORG_UNIT_MANAGE,
  Permission.VEHICLE_CREATE,
  Permission.ORG_MEMBERS_MANAGE,
  Permission.ORG_SETTINGS,
];

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
      'Connecting a tracking provider turns the platform live: real positions on the map, automatic odometer and fuel readings, and alerts raised without anyone filing them.',
    href: '/telematics/trackers',
    actionLabel: 'Connect a provider',
    permission: Permission.ORG_SETTINGS,
    resolve: (facts) =>
      facts.telematicsConnected === null ? { done: null } : { done: facts.telematicsConnected },
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
  return permissionService.hasAnyPermission(roles, ANCHOR_PERMISSIONS);
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

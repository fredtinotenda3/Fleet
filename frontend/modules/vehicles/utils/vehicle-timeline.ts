// frontend/modules/vehicles/utils/vehicle-timeline.ts
//
// Merges a vehicle's operational records into one chronological history.
//
// ---------------------------------------------------------------------
// WHY THIS IS A PURE FUNCTION AND NOT INLINE JSX
// ---------------------------------------------------------------------
// Jest runs with `testEnvironment: 'node'` and there is no jsdom or
// React Testing Library in this repo, so a decision made inside a
// component cannot be tested at all. Every decision here -- what counts
// as an event, how a missing date is handled, how ties are broken -- is
// therefore a pure function over plain data, and the component that
// renders it stays declarative. Same split the observability and
// platform-admin modules use.
//
// ---------------------------------------------------------------------
// THE RULE THAT MATTERS: A RECORD WITH NO DATE IS NOT DATED TO NOW
// ---------------------------------------------------------------------
// Every other option is worse. Dating it to "now" puts an eight-month-old
// refuel at the top of the history. Dating it to the epoch buries it and
// still asserts a date nobody recorded. Dropping it silently is how a
// screen comes to disagree with the module it summarises.
//
// So an undateable record is EXCLUDED from the timeline and COUNTED, and
// the count is rendered. "3 records aren't shown because they carry no
// date" is a sentence an operator can act on.

/** Which module an entry came from. Drives the icon and the link. */
export type VehicleTimelineKind =
  | 'fuel'
  | 'expense'
  | 'trip'
  | 'maintenance'
  | 'work-order'
  | 'audit';

export interface VehicleTimelineEntry {
  /** Unique within the merged list: `${kind}:${recordId}`. */
  id: string;
  kind: VehicleTimelineKind;
  /** ISO-8601. The record's OWN date, never the time it was rendered. */
  at: string;
  title: string;
  detail?: string;
  /** Where the full record lives, when it has a page of its own. */
  href?: string;
}

export interface VehicleTimelineResult {
  entries: VehicleTimelineEntry[];
  /**
   * Records excluded because they carry no usable date. Surfaced, never
   * swallowed -- see the header.
   */
  undatedCount: number;
}

/**
 * Any record from any module.
 *
 * Typed as `object` rather than as an index-signature interface on
 * purpose: a concrete `interface FuelLog {...}` is NOT assignable to
 * `{[key: string]: unknown}` in TypeScript, so an index signature here
 * would force every caller to cast -- and a cast at the call site is
 * exactly what hid the fuel `driver_id` bug. Fields are read through
 * `field()`, which does the narrowing once, here.
 */
type DatedRecord = object;

/** One property of a record, without asserting the record's shape. */
function field(record: DatedRecord, key: string): unknown {
  return (record as Record<string, unknown>)[key];
}

/**
 * An ISO string for a value that may be a Date, an ISO string, or
 * nonsense. Returns null rather than guessing.
 *
 * `new Date(undefined)` is Invalid Date and `new Date(null)` is the
 * epoch -- two different wrong answers from the same careless call, which
 * is why this is centralised instead of repeated per module.
 */
export function toIsoDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  return null;
}

function money(amount: unknown, currency: unknown): string | undefined {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return undefined;
  const code = typeof currency === 'string' && currency ? currency : '';
  return `${code ? `${code} ` : ''}${amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function joinDetail(parts: Array<string | undefined>): string | undefined {
  const kept = parts.filter((p): p is string => Boolean(p && p.trim()));
  return kept.length ? kept.join(' · ') : undefined;
}

export interface VehicleTimelineSources {
  fuel?: DatedRecord[];
  expenses?: DatedRecord[];
  trips?: DatedRecord[];
  maintenance?: DatedRecord[];
  workOrders?: DatedRecord[];
  /** Rows from the audit log -- record CHANGES, not operational events. */
  audit?: DatedRecord[];
}

/**
 * One chronological history, newest first.
 *
 * The audit log is included but kept visually distinct by its `kind`:
 * "someone edited this vehicle's registration" and "this vehicle was
 * refuelled" are both history, and conflating them is how an activity
 * feed becomes noise. The Activity tab previously showed ONLY the audit
 * log, which is why it read as "vehicle record was edited" and never as
 * anything the fleet actually did.
 */
export function buildVehicleTimeline(sources: VehicleTimelineSources): VehicleTimelineResult {
  const entries: VehicleTimelineEntry[] = [];
  let undatedCount = 0;

  const push = (
    kind: VehicleTimelineKind,
    record: DatedRecord,
    dateValue: unknown,
    title: string,
    detail?: string,
    href?: string
  ) => {
    const at = toIsoDate(dateValue);
    if (!at) {
      undatedCount += 1;
      return;
    }
    entries.push({
      id: `${kind}:${String(field(record, '_id') ?? `${kind}-${entries.length}`)}`,
      kind,
      at,
      title,
      ...(detail ? { detail } : {}),
      ...(href ? { href } : {}),
    });
  };

  for (const log of sources.fuel ?? []) {
    const volume =
      typeof field(log, 'fuel_volume') === 'number' ? `${field(log, 'fuel_volume')} L` : undefined;
    push(
      'fuel',
      log,
      field(log, 'date'),
      'Fuel logged',
      joinDetail([volume, money(field(log, 'cost'), field(log, 'currency'))])
    );
  }

  for (const expense of sources.expenses ?? []) {
    push(
      'expense',
      expense,
      field(expense, 'date'),
      typeof field(expense, 'description') === 'string' && field(expense, 'description')
        ? String(field(expense, 'description'))
        : 'Expense recorded',
      money(field(expense, 'amount'), field(expense, 'currency'))
    );
  }

  for (const trip of sources.trips ?? []) {
    const distanceKm = field(trip, 'distance_calculated');
    const distance =
      typeof distanceKm === 'number' && distanceKm > 0
        ? `${distanceKm.toLocaleString()} km`
        : undefined;
    const route = joinDetail([
      typeof field(trip, 'start_location') === 'string'
        ? String(field(trip, 'start_location'))
        : undefined,
      typeof field(trip, 'end_location') === 'string'
        ? String(field(trip, 'end_location'))
        : undefined,
    ]);
    push(
      'trip',
      trip,
      field(trip, 'date'),
      'Trip recorded',
      joinDetail([distance, route]),
      field(trip, '_id') ? `/trips/${String(field(trip, '_id'))}` : undefined
    );
  }

  for (const reminder of sources.maintenance ?? []) {
    // A completed reminder is dated by its completion, not by when it
    // fell due -- a service done three weeks late belongs on the day it
    // was done.
    const completed =
      field(reminder, 'status') === 'completed' && field(reminder, 'completion_date');
    push(
      'maintenance',
      reminder,
      completed ? field(reminder, 'completion_date') : field(reminder, 'due_date'),
      typeof field(reminder, 'title') === 'string' ? String(field(reminder, 'title')) : 'Maintenance',
      joinDetail([
        completed
          ? 'Completed'
          : `Due · ${String(field(reminder, 'status') ?? 'pending')}`,
        typeof field(reminder, 'service_type') === 'string'
          ? String(field(reminder, 'service_type'))
          : undefined,
      ])
    );
  }

  for (const order of sources.workOrders ?? []) {
    // Dated by when the job was OPENED. `completedAt` would hide every
    // job still in the workshop -- exactly the ones a manager is looking
    // for.
    push(
      'work-order',
      order,
      field(order, 'openedAt') ?? field(order, 'createdAt'),
      typeof field(order, 'title') === 'string' ? String(field(order, 'title')) : 'Work order',
      joinDetail([
        typeof field(order, 'status') === 'string'
          ? String(field(order, 'status')).replace(/_/g, ' ')
          : undefined,
        typeof field(order, 'priority') === 'string'
          ? `${String(field(order, 'priority'))} priority`
          : undefined,
      ])
    );
  }

  for (const row of sources.audit ?? []) {
    push(
      'audit',
      row,
      field(row, 'createdAt') ?? field(row, 'recordedAt'),
      typeof field(row, 'action') === 'string'
        ? humaniseAuditAction(String(field(row, 'action')))
        : 'Record changed',
      typeof field(row, 'category') === 'string' ? String(field(row, 'category')) : undefined
    );
  }

  entries.sort((a, b) => {
    if (a.at !== b.at) return a.at < b.at ? 1 : -1;
    // Deterministic tie-break. Two records saved in the same second are
    // common on an import, and a list that reorders itself between
    // renders looks broken.
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  return { entries, undatedCount };
}

/** `VEHICLE_UPDATED` -> `Vehicle updated`. */
export function humaniseAuditAction(action: string): string {
  const words = action.toLowerCase().replace(/[_.]+/g, ' ').trim();
  if (!words) return 'Record changed';
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export const TIMELINE_KIND_LABELS: Record<VehicleTimelineKind, string> = {
  fuel: 'Fuel',
  expense: 'Expense',
  trip: 'Trip',
  maintenance: 'Maintenance',
  'work-order': 'Work order',
  audit: 'Record change',
};

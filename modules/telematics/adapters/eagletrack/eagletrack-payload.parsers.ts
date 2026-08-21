// modules/telematics/adapters/eagletrack/eagletrack-payload.parsers.ts
//
// Pure parsers for the Eagle Track payloads beyond /api2/last and
// /api2/trackers: /api2/reports/fuel, /api2/drivers, /api2/triggers, and
// the alert-filtered form of /api2/history.
//
// Every alias array below is the CORRECTION SURFACE. When a real
// response arrives and a value comes back absent, the fix is to add the
// real spelling to the front of the relevant array here -- no service,
// repository or route changes. See eagletrack-field-map.ts's header for
// why this is data rather than field access, and
// eagletrack.types.ts's block comment for which endpoints are confirmed.
//
// ---------------------------------------------------------------------
// /api2/reports/fuel IS NOW CONFIRMED, AND IT IS NOT A RECORD LIST
// ---------------------------------------------------------------------
// A live response settled the fuel report's shape, and it was neither of
// the two forms the alias layer was built for. The reports family
// returns a RENDERED TABLE -- `{ column: [...], body: [[...]],
// global: {...} }` -- whose cells are display strings: "7.14 km",
// "34853.05 km", "-" where the provider has no figure, and an entire
// semicolon-delimited sentence in the `Fuel` column carrying five
// separate statistics.
//
// The alias approach survived that intact, which is the point of it:
// readColumnarPayload expands the table into keyed rows using the header
// labels as keys, so "Fuel Used" normalises straight onto the `fuelUsed`
// alias that was already in the table. What the alias layer could NOT do
// was read the values -- readNumber("7.14 km") is NaN -- so cell
// interpretation lives in eagletrack-report-values.ts and this file
// composes the two.
//
// The three sibling endpoints below remain unconfirmed. That the
// documented row-list shape was wrong for one of them is a reason to
// expect it may be wrong for the others too, not a reason to assume the
// table shape everywhere: readColumnarPayload detects rather than
// presumes, and every parser here goes through it.
//
// Pure by construction: no repository, no client, no clock. That is what
// lets the whole mapping be tested against hand-written payloads without
// mocking Mongo or fetch, exactly as mapStatusToTelematicsData is.

import {
  consumed,
  describeUnmapped,
  indexRow,
  pickRaw,
  readBoolean,
  readColumnarPayload,
  readLatLng,
  readNumber,
  readString,
  toKeyedRows,
  normaliseKey,
  VendorRow,
} from './eagletrack-field-map';
import {
  CONSUMPTION_PER_100KM_UNITS,
  DISTANCE_UNITS,
  isNoDataToken,
  MeasurementCell,
  parseFuelSummary,
  readMeasurement,
  readMoney,
  VOLUME_UNITS,
} from './eagletrack-report-values';
import { describeTriggerType } from './eagletrack-triggers.map';
import { parseEagleTrackDate } from './eagletrack.adapter';
import type {
  EagleTrackDriver,
  EagleTrackFuelReportRow,
  EagleTrackFuelRowFlag,
  EagleTrackTrigger,
  EagleTrackVendorAlert,
} from './eagletrack.types';

// ─── Alias tables ────────────────────────────────────────────────────
// Ordered: most-likely first. Names come from the vendor's API V2
// documentation and from the spellings this platform family uses
// elsewhere in its own payloads (`uin`, `name`, `date`, `lat`, `lng`,
// `speed` are all confirmed on /api2/last and /api2/trackers, so those
// lead wherever they apply).

const UIN_ALIASES = ['uin', 'deviceId', 'trackerId', 'objectId', 'imei'] as const;
const NAME_ALIASES = ['name', 'title', 'label', 'description'] as const;
const DATE_ALIASES = ['date', 'time', 'timestamp', 'datetime', 'eventTime', 'alertTime'] as const;
const LAT_ALIASES = ['lat', 'latitude', 'y'] as const;
const LNG_ALIASES = ['lng', 'lon', 'longitude', 'x'] as const;
const SPEED_ALIASES = ['speed', 'velocity'] as const;

/**
 * Fuel report aliases.
 *
 * The live deployment's column headers (`Name`, `From`, `To`,
 * `Fuel Used`, `Fuel Cost`, `Fuel`, `Distance`, `Start Odometer`,
 * `End Odometer`) now lead each list, ahead of the documented spellings.
 * That ordering is the whole discipline of this file: the observed name
 * wins, the documented ones stay as fallbacks for other deployments.
 *
 * `fuelUsed` is deliberately NOT first in `consumed` even though the
 * live header is "Fuel Used" -- normaliseKey folds "Fuel Used" and
 * "fuelUsed" to the same token, so it already matched. Nothing here
 * needed reordering for the live response; it needed the VALUES read
 * correctly, which is eagletrack-report-values.ts's job.
 */
const FUEL_ALIASES = {
  periodStart: ['from', 'startTime', 'beginTime', 'dateFrom', 'startDate', 'start'],
  periodEnd: ['to', 'endTime', 'finishTime', 'dateTo', 'endDate', 'end'],
  initial: ['startFuel', 'beginFuel', 'initialFuel', 'fuelStart', 'startValue'],
  final: ['endFuel', 'finishFuel', 'finalFuel', 'fuelEnd', 'endValue'],
  consumed: ['fuelUsed', 'fuelConsumption', 'fuelConsumed', 'consumption', 'usedFuel', 'totalFuel'],
  refuelled: ['refuel', 'refuelling', 'refueling', 'fillings', 'fuelFilled', 'fillAmount'],
  drained: ['drain', 'draining', 'fuelDrained', 'theft', 'drainAmount'],
  distance: ['distance', 'mileage', 'totalDistance', 'km', 'route'],
  rate: ['consumptionPer100', 'avgConsumption', 'averageConsumption', 'fuelRate', 'litersPer100km', 'litresPer100km'],
  cost: ['fuelCost', 'cost', 'fuelExpense', 'fuelPrice', 'totalCost', 'expense', 'amount'],
  /**
   * The composite `Fuel` column. Listed last among the fuel-ish aliases
   * on purpose: `fuel` is a single generic word and must not shadow a
   * dedicated column. It does not collide with any alias above --
   * `fuelUsed`, `fuelCost` and `fuelRate` all normalise to longer
   * tokens -- but the ordering makes the intent explicit.
   */
  summary: ['fuel', 'fuelSummary', 'fuelDetail', 'fuelDetails', 'fuelStatistics'],
  startOdometer: ['startOdometer', 'odometerStart', 'beginOdometer', 'startMileage', 'odoStart', 'initialOdometer'],
  endOdometer: ['endOdometer', 'odometerEnd', 'finishOdometer', 'endMileage', 'odoEnd', 'finalOdometer'],
} as const;

const DRIVER_ALIASES = {
  id: ['driverId', 'id', 'objId', 'driverKey', 'code'],
  name: ['name', 'driverName', 'title', 'fullName'],
  code: ['driverCode', 'code', 'number', 'badge', 'employeeNo', 'staffId'],
  phone: ['phone', 'mobile', 'tel', 'phoneNumber', 'telephone'],
  email: ['email', 'mail', 'emailAddress'],
  license: ['license', 'licence', 'licenseNumber', 'licenceNumber', 'driverLicense', 'idCard'],
} as const;

const TRIGGER_ALIASES = {
  id: ['triggerId', 'id', 'objId', 'ruleId'],
  type: ['type', 'triggerType', 'kind', 'ruleType'],
  active: ['active', 'enabled', 'status', 'isActive'],
  speed: ['speedLimit', 'maxSpeed', 'speed', 'limit', 'threshold'],
  duration: ['duration', 'idleTime', 'stopTime', 'minutes', 'timeout'],
  radius: ['radius', 'r', 'range'],
  tolerance: ['tolerance', 'deviation', 'buffer', 'width', 'corridor'],
  points: ['points', 'coordinates', 'coords', 'vertices', 'polygon', 'path', 'geometry', 'area'],
} as const;

const ALERT_ALIASES = {
  id: ['alertId', 'eventId', 'id', 'recordId'],
  triggerId: ['triggerId', 'ruleId', 'trigger'],
  type: ['alertType', 'type', 'triggerType', 'eventType', 'cmd'],
  message: ['message', 'msg', 'text', 'description', 'info', 'content'],
} as const;

// ─── Fuel report ─────────────────────────────────────────────────────

/**
 * Tolerance for the distance-vs-odometer cross-check.
 *
 * Loose on purpose. Distance and odometer come from different sources
 * (GPS track integration vs a CAN/analogue odometer reading) and are
 * rounded to 2 dp independently, so small disagreement is normal and
 * flagging it would train an operator to ignore the flag. What this must
 * catch is a COLUMN SHIFT, where the two figures differ by orders of
 * magnitude.
 */
const ODOMETER_TOLERANCE_KM = 1;
const ODOMETER_TOLERANCE_FRACTION = 0.05;

/** Bookkeeping for one row's cell outcomes, so the three kinds of "missing" stay separate. */
interface CellOutcomes {
  noData: string[];
  unparsable: string[];
  keys: string[];
}

/**
 * Records a cell's outcome under its CANONICAL field name and returns
 * the numeric value only when the provider actually sent one.
 *
 * The canonical name -- not the vendor's column header -- is what lands
 * in noDataFields/unparsableFields, so a consumer can branch on
 * "distanceKm has no data" without knowing whether this deployment
 * spells the column "Distance", "Mileage" or "route".
 */
function takeMeasurement(
  cell: MeasurementCell | null,
  field: string,
  outcomes: CellOutcomes
): number | undefined {
  if (!cell) return undefined;

  outcomes.keys.push(cell.key);
  if (cell.status === 'no-data') outcomes.noData.push(field);
  else if (cell.status === 'unparsable') outcomes.unparsable.push(field);

  return cell.status === 'value' ? cell.value : undefined;
}

/**
 * Everything one /api2/reports/fuel response yielded, including the
 * facts about the PAYLOAD that individual rows cannot carry.
 *
 * Separate from parseFuelReportRows because the counters and the header
 * are properties of the table, not of a row, and the service needs them
 * to decide whether the rows it has are the whole report. `recCount` on
 * the observed response said 1318 while `body` held a single row.
 */
export interface EagleTrackFuelReportPayload {
  rows: EagleTrackFuelReportRow[];
  /** The header row as the provider sent it, or [] for a non-columnar payload. */
  columns: string[];
  counters: { pageCount: number | null; recordCount: number | null };
  duplicateColumns: string[];
  rowsWithUnexpectedWidth: number;
  /** True when the payload was the column/body table form rather than records. */
  columnar: boolean;
}

/**
 * Maps a /api2/reports/fuel response for one tracker.
 *
 * ---------------------------------------------------------------------
 * ATTRIBUTION: WHAT A REPORT ROW DOES AND DOES NOT IDENTIFY
 * ---------------------------------------------------------------------
 * A columnar report row carries NO uin -- the closest thing is the
 * `Name` column, which holds the tracker's name. So `uin` falls back to
 * the tracker the request was made for, and the name is kept separately
 * as `providerName` rather than being promoted into `uin`.
 *
 * That separation is load-bearing. If a deployment answers a
 * single-tracker request with the whole account's report (and the
 * observed `recCount` of 1318 against a single returned row is exactly
 * the kind of hint that it might), promoting or ignoring the name would
 * stamp the requested uin onto every other vehicle's row -- writing
 * another branch's fuel spend and distance into this vehicle's report.
 * This function reports what it saw; eagletrack-fuel.service.ts, which
 * knows the vehicle's plate, decides which rows are actually ours.
 *
 * Kept as the row-level entry point for callers that only want rows;
 * parseFuelReportPayload adds the table-level facts.
 */
export function parseFuelReportRows(data: unknown, fallbackUin: string): EagleTrackFuelReportRow[] {
  return toKeyedRows(data).map(({ key, row }) => {
    const index = indexRow(row);
    const outcomes: CellOutcomes = { noData: [], unparsable: [], keys: [] };

    const uin = readString(index, UIN_ALIASES);
    const providerName = readString(index, NAME_ALIASES);

    // Dates stay STRINGS on the row (their timezone is unconfirmed --
    // see parseEagleTrackDate) and are additionally offered as parsed
    // instants. A "-" here is the provider stating it has no period
    // bound, which is different from a column we failed to find.
    const periodStartCell = pickRaw(index, FUEL_ALIASES.periodStart);
    const periodEndCell = pickRaw(index, FUEL_ALIASES.periodEnd);
    const periodStart = takeDate(periodStartCell, 'periodStart', outcomes);
    const periodEnd = takeDate(periodEndCell, 'periodEnd', outcomes);

    const initial = takeMeasurement(readMeasurement(index, FUEL_ALIASES.initial, VOLUME_UNITS), 'initialFuelLitres', outcomes);
    const final = takeMeasurement(readMeasurement(index, FUEL_ALIASES.final, VOLUME_UNITS), 'finalFuelLitres', outcomes);
    const consumedFuel = takeMeasurement(readMeasurement(index, FUEL_ALIASES.consumed, VOLUME_UNITS), 'fuelConsumedLitres', outcomes);
    const columnRefuelled = takeMeasurement(readMeasurement(index, FUEL_ALIASES.refuelled, VOLUME_UNITS), 'refuelledLitres', outcomes);
    const columnDrained = takeMeasurement(readMeasurement(index, FUEL_ALIASES.drained, VOLUME_UNITS), 'drainedLitres', outcomes);
    const distance = takeMeasurement(readMeasurement(index, FUEL_ALIASES.distance, DISTANCE_UNITS), 'distanceKm', outcomes);
    const columnRate = takeMeasurement(
      readMeasurement(index, FUEL_ALIASES.rate, CONSUMPTION_PER_100KM_UNITS),
      'consumptionPer100Km',
      outcomes
    );
    const startOdometer = takeMeasurement(
      readMeasurement(index, FUEL_ALIASES.startOdometer, DISTANCE_UNITS),
      'startOdometerKm',
      outcomes
    );
    const endOdometer = takeMeasurement(
      readMeasurement(index, FUEL_ALIASES.endOdometer, DISTANCE_UNITS),
      'endOdometerKm',
      outcomes
    );

    const cost = readMoney(index, FUEL_ALIASES.cost);
    if (cost) {
      outcomes.keys.push(cost.key);
      if (cost.status === 'no-data') outcomes.noData.push('fuelCost');
      else if (cost.status === 'unparsable') outcomes.unparsable.push('fuelCost');
    }

    // The composite `Fuel` cell. Its figures fill only the fields no
    // dedicated column supplied: a first-class column is a more direct
    // statement than a value extracted from rendered prose.
    const summaryHit = pickRaw(index, FUEL_ALIASES.summary);
    const summary = summaryHit ? parseFuelSummary(summaryHit.value) : null;
    if (summaryHit) outcomes.keys.push(summaryHit.key);

    const refuelled = columnRefuelled ?? takeMeasurement(summary?.refuelledLitres ?? null, 'refuelledLitres', outcomes);
    const drained = columnDrained ?? takeMeasurement(summary?.drainedLitres ?? null, 'drainedLitres', outcomes);
    const rate = columnRate ?? takeMeasurement(summary?.consumptionPer100Km ?? null, 'consumptionPer100Km', outcomes);
    const refuelEventCount = takeMeasurement(summary?.refuelEventCount ?? null, 'refuelEventCount', outcomes);
    const drainEventCount = takeMeasurement(summary?.drainEventCount ?? null, 'drainEventCount', outcomes);

    return {
      // Precedence: the row's own uin, then the object key (which
      // /api2/last established is authoritative when present), then the
      // tracker the request was for. A columnar row supplies neither of
      // the first two -- see the header on why `providerName` is not a
      // substitute for them.
      uin: uin?.value ?? key ?? fallbackUin,
      ...(providerName ? { providerName: providerName.value } : {}),
      ...(periodStart.raw !== undefined ? { periodStart: periodStart.raw } : {}),
      ...(periodEnd.raw !== undefined ? { periodEnd: periodEnd.raw } : {}),
      ...(periodStart.iso ? { periodStartIso: periodStart.iso } : {}),
      ...(periodEnd.iso ? { periodEndIso: periodEnd.iso } : {}),
      ...(initial !== undefined ? { initialFuelLitres: initial } : {}),
      ...(final !== undefined ? { finalFuelLitres: final } : {}),
      ...(consumedFuel !== undefined ? { fuelConsumedLitres: consumedFuel } : {}),
      ...(refuelled !== undefined ? { refuelledLitres: refuelled } : {}),
      ...(drained !== undefined ? { drainedLitres: drained } : {}),
      ...(refuelEventCount !== undefined ? { refuelEventCount } : {}),
      ...(drainEventCount !== undefined ? { drainEventCount } : {}),
      ...(distance !== undefined ? { distanceKm: distance } : {}),
      ...(startOdometer !== undefined ? { startOdometerKm: startOdometer } : {}),
      ...(endOdometer !== undefined ? { endOdometerKm: endOdometer } : {}),
      ...(rate !== undefined ? { consumptionPer100Km: rate } : {}),
      ...(cost?.status === 'value' && cost.amount !== undefined ? { fuelCost: cost.amount } : {}),
      ...(cost?.currencyCode ? { fuelCostCurrencyCode: cost.currencyCode } : {}),
      ...(cost?.currencySymbol ? { fuelCostCurrencySymbol: cost.currencySymbol } : {}),
      noDataFields: dedupeSorted(outcomes.noData),
      unparsableFields: dedupeSorted(outcomes.unparsable),
      flags: deriveRowFlags({
        fuelConsumedLitres: consumedFuel,
        fuelConsumedIsNoData: outcomes.noData.includes('fuelConsumedLitres'),
        consumptionPer100Km: rate,
        distanceKm: distance,
        startOdometerKm: startOdometer,
        endOdometerKm: endOdometer,
      }),
      unmappedFields: describeUnmapped(row, [...consumed(uin, providerName), ...outcomes.keys]),
      unmappedFuelSummaryLabels: summary ? summary.unmappedLabels : [],
      raw: row,
    };
  });
}

/**
 * The whole response: rows plus the facts about the table itself.
 *
 * The counters matter for correctness, not diagnostics. If `recCount`
 * exceeds the number of rows returned, then either the report is
 * paginated and we are summing a slice, or the counter means something
 * else entirely (records SCANNED rather than rows produced). This
 * integration cannot tell which from one sample and does not guess --
 * it hands both numbers up so the service can say so plainly.
 */
export function parseFuelReportPayload(data: unknown, fallbackUin: string): EagleTrackFuelReportPayload {
  const columnar = readColumnarPayload(data);

  return {
    rows: parseFuelReportRows(data, fallbackUin),
    columns: columnar ? columnar.columns : [],
    counters: columnar ? columnar.counters : { pageCount: null, recordCount: null },
    duplicateColumns: columnar ? columnar.duplicateColumns : [],
    rowsWithUnexpectedWidth: columnar ? columnar.rowsWithUnexpectedWidth : 0,
    columnar: columnar !== null,
  };
}

/**
 * Reads a period bound, keeping the provider's own string AND an ISO
 * instant when it parsed.
 *
 * The raw string is never discarded in favour of the parsed value: the
 * vendor sends "2026-08-20 00:04:07" with no offset, parseEagleTrackDate
 * reads that as UTC, and that assumption is documented as unconfirmed.
 * Keeping both means a later timezone correction re-derives the instant
 * from data we still hold rather than from data we threw away.
 */
function takeDate(
  hit: { key: string; value: unknown } | null,
  field: string,
  outcomes: CellOutcomes
): { raw?: string; iso?: string } {
  if (!hit) return {};

  outcomes.keys.push(hit.key);

  if (typeof hit.value !== 'string') {
    const parsed = parseEagleTrackDate(hit.value);
    if (!parsed) {
      outcomes.unparsable.push(field);
      return {};
    }
    return { raw: parsed.toISOString(), iso: parsed.toISOString() };
  }

  const text = hit.value.trim();
  if (!text) {
    outcomes.unparsable.push(field);
    return {};
  }
  if (isNoDataToken(text)) {
    outcomes.noData.push(field);
    return {};
  }

  const parsed = parseEagleTrackDate(text);
  if (!parsed) {
    // The string is kept even when it does not parse -- an operator can
    // read "20/08/2026 00:04" perfectly well, and discarding it would
    // hide the format that needs supporting.
    outcomes.unparsable.push(field);
    return { raw: text };
  }

  return { raw: text, iso: parsed.toISOString() };
}

function dedupeSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

/**
 * Cross-field self-checks. See EagleTrackFuelRowFlag for why a
 * positionally-mapped table needs them.
 *
 * Nothing here alters a value. A flagged row keeps every figure the
 * provider sent; the flag travels alongside so the service can decline
 * to promote a contradictory figure into a headline total, and so an
 * operator can see WHY a number looks wrong instead of only that it
 * does.
 */
function deriveRowFlags(input: {
  fuelConsumedLitres?: number;
  fuelConsumedIsNoData: boolean;
  consumptionPer100Km?: number;
  distanceKm?: number;
  startOdometerKm?: number;
  endOdometerKm?: number;
}): EagleTrackFuelRowFlag[] {
  const flags: EagleTrackFuelRowFlag[] = [];

  if (
    input.consumptionPer100Km === 0 &&
    input.fuelConsumedLitres === undefined &&
    input.fuelConsumedIsNoData
  ) {
    flags.push('zero-consumption-rate-without-fuel-used');
  }

  if (input.startOdometerKm !== undefined && input.endOdometerKm !== undefined) {
    const delta = input.endOdometerKm - input.startOdometerKm;
    if (delta < 0) flags.push('odometer-decreased');

    if (input.distanceKm !== undefined && delta >= 0) {
      const tolerance = Math.max(ODOMETER_TOLERANCE_KM, ODOMETER_TOLERANCE_FRACTION * Math.max(delta, input.distanceKm));
      if (Math.abs(delta - input.distanceKm) > tolerance) flags.push('distance-odometer-mismatch');
    }
  }

  return flags;
}

// ─── Drivers ─────────────────────────────────────────────────────────

/**
 * Maps /api2/drivers rows.
 *
 * A row with no readable provider id is returned WITH an empty
 * providerDriverId rather than dropped, so the caller can count it as
 * skipped and report it. Silently discarding rows is how a roster ends
 * up half-imported with nothing saying so.
 */
export function parseDriverRows(data: unknown): EagleTrackDriver[] {
  return toKeyedRows(data).map(({ key, row }) => {
    const index = indexRow(row);

    const id = readString(index, DRIVER_ALIASES.id);
    const name = readString(index, DRIVER_ALIASES.name);
    const code = readString(index, DRIVER_ALIASES.code);
    const phone = readString(index, DRIVER_ALIASES.phone);
    const email = readString(index, DRIVER_ALIASES.email);
    const license = readString(index, DRIVER_ALIASES.license);
    const uin = readString(index, UIN_ALIASES);

    return {
      providerDriverId: id?.value ?? key ?? '',
      ...(name ? { name: name.value } : {}),
      ...(code ? { code: code.value } : {}),
      ...(phone ? { phone: phone.value } : {}),
      ...(email ? { email: email.value } : {}),
      ...(license ? { licenseNumber: license.value } : {}),
      ...(uin ? { uin: uin.value } : {}),
      unmappedFields: describeUnmapped(row, consumed(id, name, code, phone, email, license, uin)),
      raw: row,
    };
  });
}

// ─── Triggers ────────────────────────────────────────────────────────

/**
 * Reads a coordinate list from whichever alias carries it.
 *
 * Accepts the three encodings this platform family is documented to use
 * for a point list -- `[{lat,lng}]`, `[[lat,lng]]`, and `"lat,lng;..."`
 * -- and returns null for anything else. Returning null is the load-
 * bearing behaviour: an unreadable point list must produce NO geofence
 * (see eagletrack-triggers.map.ts), not a degenerate one.
 */
export function parseTriggerPoints(raw: unknown): Array<{ lat: number; lng: number }> | null {
  const points: Array<{ lat: number; lng: number }> = [];

  const push = (lat: unknown, lng: unknown): boolean => {
    const latValue = typeof lat === 'number' ? lat : Number(lat);
    const lngValue = typeof lng === 'number' ? lng : Number(lng);
    if (!Number.isFinite(latValue) || !Number.isFinite(lngValue)) return false;
    if (latValue < -90 || latValue > 90 || lngValue < -180 || lngValue > 180) return false;
    // Null island, same rejection hasUsableFix applies to live fixes.
    if (latValue === 0 && lngValue === 0) return false;
    points.push({ lat: latValue, lng: lngValue });
    return true;
  };

  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (Array.isArray(entry) && entry.length >= 2) {
        if (!push(entry[0], entry[1])) return null;
      } else if (entry && typeof entry === 'object') {
        const index = indexRow(entry as VendorRow);
        const pair = readLatLng(index, LAT_ALIASES, LNG_ALIASES);
        if (!pair) return null;
        points.push({ lat: pair.lat, lng: pair.lng });
      } else {
        return null;
      }
    }
  } else if (typeof raw === 'string') {
    for (const pair of raw.split(/[;|]/)) {
      const [lat, lng] = pair.split(',');
      if (lat === undefined || lng === undefined) return null;
      if (!push(lat.trim(), lng.trim())) return null;
    }
  } else {
    return null;
  }

  return points.length > 0 ? points : null;
}

/**
 * Maps /api2/triggers rows.
 *
 * Geometry is attached only when it is genuinely readable, and the shape
 * chosen follows the DATA rather than the declared type: a trigger typed
 * "Geo-fence" that carries a centre and a radius is a circle even though
 * the type table's nominal shape is a polygon. The type code decides
 * whether a geofence is appropriate at all; the payload decides what
 * shape it is.
 */
export function parseTriggerRows(data: unknown): EagleTrackTrigger[] {
  return toKeyedRows(data).map(({ key, row }) => {
    const index = indexRow(row);

    const id = readString(index, TRIGGER_ALIASES.id);
    const name = readString(index, NAME_ALIASES);
    const typeHit = readNumber(index, TRIGGER_ALIASES.type);
    const active = readBoolean(index, TRIGGER_ALIASES.active);
    const uin = readString(index, UIN_ALIASES);
    const speed = readNumber(index, TRIGGER_ALIASES.speed);
    const duration = readNumber(index, TRIGGER_ALIASES.duration);
    const radius = readNumber(index, TRIGGER_ALIASES.radius);
    const tolerance = readNumber(index, TRIGGER_ALIASES.tolerance);
    const center = readLatLng(index, LAT_ALIASES, LNG_ALIASES);

    const descriptor = describeTriggerType(typeHit?.value);

    // Which alias actually carried the point list, so it is reported as
    // consumed rather than showing up as an unmapped key on every row.
    let pointsKey: string | undefined;
    let points: Array<{ lat: number; lng: number }> | null = null;
    for (const alias of TRIGGER_ALIASES.points) {
      // normaliseKey, not toLowerCase: indexRow keys on the separator-
      // stripped form, so `alias.toLowerCase()` would miss every
      // multi-word alias and silently report the points column as
      // unmapped on a payload it had actually read.
      const hit = index.get(normaliseKey(alias));
      if (!hit) continue;
      const parsed = parseTriggerPoints(hit.value);
      if (parsed) {
        points = parsed;
        pointsKey = hit.key;
        break;
      }
    }

    let geometry: EagleTrackTrigger['geometry'];
    if (descriptor?.geofenceType === 'route' && points && points.length >= 2 && tolerance) {
      geometry = { kind: 'route', points, toleranceMeters: tolerance.value };
    } else if (descriptor?.geofenceType && points && points.length >= 3) {
      geometry = { kind: 'polygon', points };
    } else if (descriptor?.geofenceType && center && radius && radius.value > 0) {
      geometry = {
        kind: 'circle',
        center: { lat: center.lat, lng: center.lng },
        radiusMeters: radius.value,
      };
    }

    return {
      providerTriggerId: id?.value ?? key ?? '',
      ...(name ? { name: name.value } : {}),
      typeCode: typeHit ? typeHit.value : null,
      typeLabel: descriptor ? descriptor.label : null,
      ...(active ? { active: active.value } : {}),
      ...(uin ? { uin: uin.value } : {}),
      ...(speed ? { speedLimitKmh: speed.value } : {}),
      ...(duration ? { durationMinutes: duration.value } : {}),
      ...(geometry ? { geometry } : {}),
      unmappedFields: describeUnmapped(row, [
        ...consumed(id, name, typeHit, active, uin, speed, duration, radius, tolerance, center),
        ...(pointsKey ? [pointsKey] : []),
      ]),
      raw: row,
    };
  });
}

// ─── Vendor alerts ───────────────────────────────────────────────────

/**
 * A stable identity for a vendor alert, used to recognise one we already
 * hold on a repeat sync over an overlapping window.
 *
 * Prefers the provider's own alert id. When the payload carries none,
 * falls back to uin + occurrence time + trigger/type -- which is the
 * tuple that makes two rows the same EVENT, and is stable across syncs
 * because every component comes from the provider's payload rather than
 * from our clock. Never random: a random key would re-import the entire
 * window on every run, which is precisely the duplicate-prevention
 * failure this exists to avoid.
 */
export function buildVendorAlertKey(input: {
  uin: string;
  providerAlertId?: string;
  providerTriggerId?: string;
  typeCode: number | null;
  occurredAt: Date;
}): string {
  if (input.providerAlertId) return `id:${input.providerAlertId}`;
  const trigger = input.providerTriggerId ?? (input.typeCode !== null ? `t${input.typeCode}` : 'unknown');
  return `derived:${input.uin}:${input.occurredAt.toISOString()}:${trigger}`;
}

/**
 * Maps alert-filtered /api2/history rows.
 *
 * A row with no PARSEABLE TIMESTAMP is dropped, not stamped with
 * `new Date()`. That is the same rule mapStatusToTelematicsData applies
 * to positions, and it matters more here: an alert stamped "now" on
 * every sync would surface a months-old event as a live one and, through
 * processAlerts, notify fleet managers about it.
 */
export function parseVendorAlertRows(data: unknown, fallbackUin: string): EagleTrackVendorAlert[] {
  const alerts: EagleTrackVendorAlert[] = [];

  for (const { key, row } of toKeyedRows(data)) {
    const index = indexRow(row);

    const dateHit = readString(index, DATE_ALIASES);
    const occurredAt = parseEagleTrackDate(dateHit?.value);
    if (!occurredAt) continue;

    const uinHit = readString(index, UIN_ALIASES);
    const id = readString(index, ALERT_ALIASES.id);
    const triggerId = readString(index, ALERT_ALIASES.triggerId);
    const typeHit = readNumber(index, ALERT_ALIASES.type);
    const message = readString(index, ALERT_ALIASES.message);
    const position = readLatLng(index, LAT_ALIASES, LNG_ALIASES);
    const speed = readNumber(index, SPEED_ALIASES);

    const uin = uinHit?.value ?? key ?? fallbackUin;
    const descriptor = describeTriggerType(typeHit?.value);
    const typeCode = typeHit ? typeHit.value : null;

    alerts.push({
      uin,
      providerAlertId: buildVendorAlertKey({
        uin,
        ...(id ? { providerAlertId: id.value } : {}),
        ...(triggerId ? { providerTriggerId: triggerId.value } : {}),
        typeCode,
        occurredAt,
      }),
      ...(triggerId ? { providerTriggerId: triggerId.value } : {}),
      typeCode,
      typeLabel: descriptor ? descriptor.label : null,
      ...(message ? { message: message.value } : {}),
      occurredAt,
      ...(position
        ? {
            position: {
              lat: position.lat,
              lng: position.lng,
              ...(speed ? { speed: speed.value } : {}),
            },
          }
        : {}),
      unmappedFields: describeUnmapped(row, [
        ...consumed(uinHit, id, triggerId, typeHit, message, position, speed),
        ...(dateHit ? [dateHit.key] : []),
      ]),
      raw: row,
    });
  }

  return alerts;
}

// modules/telematics/adapters/eagletrack/eagletrack-payload.parsers.ts
//
// Pure parsers for the four Eagle Track payloads whose field names are
// not confirmed against a live deployment: /api2/reports/fuel,
// /api2/drivers, /api2/triggers, and the alert-filtered form of
// /api2/history.
//
// Every alias array below is the CORRECTION SURFACE. When a real
// response arrives and a value comes back absent, the fix is to add the
// real spelling to the front of the relevant array here -- no service,
// repository or route changes. See eagletrack-field-map.ts's header for
// why this is data rather than field access, and
// eagletrack.types.ts's block comment for which endpoints are confirmed.
//
// Pure by construction: no repository, no client, no clock. That is what
// lets the whole mapping be tested against hand-written payloads without
// mocking Mongo or fetch, exactly as mapStatusToTelematicsData is.

import {
  consumed,
  describeUnmapped,
  indexRow,
  readBoolean,
  readLatLng,
  readNumber,
  readString,
  toKeyedRows,
  normaliseKey,
  VendorRow,
} from './eagletrack-field-map';
import { describeTriggerType } from './eagletrack-triggers.map';
import { parseEagleTrackDate } from './eagletrack.adapter';
import type {
  EagleTrackDriver,
  EagleTrackFuelReportRow,
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

const FUEL_ALIASES = {
  periodStart: ['startTime', 'beginTime', 'dateFrom', 'from', 'startDate', 'start'],
  periodEnd: ['endTime', 'finishTime', 'dateTo', 'to', 'endDate', 'end'],
  initial: ['startFuel', 'beginFuel', 'initialFuel', 'fuelStart', 'startValue'],
  final: ['endFuel', 'finishFuel', 'finalFuel', 'fuelEnd', 'endValue'],
  consumed: ['fuelConsumption', 'fuelConsumed', 'fuelUsed', 'consumption', 'usedFuel', 'totalFuel'],
  refuelled: ['refuel', 'refuelling', 'refueling', 'fillings', 'fuelFilled', 'fillAmount'],
  drained: ['drain', 'draining', 'fuelDrained', 'theft', 'drainAmount'],
  distance: ['distance', 'mileage', 'totalDistance', 'km', 'route'],
  rate: ['consumptionPer100', 'avgConsumption', 'averageConsumption', 'fuelRate', 'litersPer100km', 'litresPer100km'],
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
 * Maps /api2/reports/fuel rows for one tracker.
 *
 * `fallbackUin` is used when a row carries no uin of its own -- the
 * request was made FOR one tracker, so a row without one is that
 * tracker's row, not an unattributable orphan. Rows that DO carry a uin
 * keep it: a deployment that answers a single-uin request with the whole
 * account's report must not have every row re-attributed to the tracker
 * that was asked about. That is the same "trust the more authoritative
 * identifier" discipline the client applies to /api2/last's object keys.
 */
export function parseFuelReportRows(data: unknown, fallbackUin: string): EagleTrackFuelReportRow[] {
  return toKeyedRows(data).map(({ key, row }) => {
    const index = indexRow(row);

    const uin = readString(index, UIN_ALIASES);
    const periodStart = readString(index, FUEL_ALIASES.periodStart);
    const periodEnd = readString(index, FUEL_ALIASES.periodEnd);
    const initial = readNumber(index, FUEL_ALIASES.initial);
    const final = readNumber(index, FUEL_ALIASES.final);
    const consumedFuel = readNumber(index, FUEL_ALIASES.consumed);
    const refuelled = readNumber(index, FUEL_ALIASES.refuelled);
    const drained = readNumber(index, FUEL_ALIASES.drained);
    const distance = readNumber(index, FUEL_ALIASES.distance);
    const rate = readNumber(index, FUEL_ALIASES.rate);

    return {
      // Precedence: the row's own uin, then the object key (which
      // /api2/last established is authoritative when present), then the
      // tracker the request was for.
      uin: uin?.value ?? key ?? fallbackUin,
      ...(periodStart ? { periodStart: periodStart.value } : {}),
      ...(periodEnd ? { periodEnd: periodEnd.value } : {}),
      ...(initial ? { initialFuelLitres: initial.value } : {}),
      ...(final ? { finalFuelLitres: final.value } : {}),
      ...(consumedFuel ? { fuelConsumedLitres: consumedFuel.value } : {}),
      ...(refuelled ? { refuelledLitres: refuelled.value } : {}),
      ...(drained ? { drainedLitres: drained.value } : {}),
      ...(distance ? { distanceKm: distance.value } : {}),
      ...(rate ? { consumptionPer100Km: rate.value } : {}),
      unmappedFields: describeUnmapped(
        row,
        consumed(uin, periodStart, periodEnd, initial, final, consumedFuel, refuelled, drained, distance, rate)
      ),
      raw: row,
    };
  });
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

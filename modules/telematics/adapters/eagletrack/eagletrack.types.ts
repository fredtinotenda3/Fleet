// modules/telematics/adapters/eagletrack/eagletrack.types.ts
//
// Shapes for Eagle Track's white-labelled "api2" GPS platform. As with
// cartrack.types.ts, we have no sandbox or live credentials at the time
// of writing, so these types follow the vendor's published API V2
// document (single static token in a `token` header, per-deployment
// domain, `{error,msg,data}` envelope on every call, per-tracker signals
// delivered as a numeric-keyed `io` object). If a real tenant's
// deployment differs, the only file that needs to change is
// eagletrack-api.client.ts's response parsing -- everything downstream
// (the adapter, the ingest pipeline, alerting, geofencing) is written
// against EagleTrackTrackerStatus below rather than the wire format.
//
// TWO DIFFERENCES FROM CARTRACK worth stating up front, because they
// are the shape assumptions most likely to be wrong in the field:
//
//  1. `last` returns `data` as an OBJECT KEYED BY UIN, not an array.
//     The client flattens it; the key is treated as the authoritative
//     tracker id.
//  2. Failure is signalled IN THE BODY (`error !== 0`) on an HTTP 200,
//     not by status code. The client throws on both.

import type { EagleTrackSignalQuality } from './eagletrack-io.map';

/** The `{error, msg, data, global?}` envelope every api2 endpoint returns. */
export interface EagleTrackEnvelope<T> {
  /** 0 means success. Non-zero is a vendor-reported failure even on HTTP 200. */
  error: number | string;
  msg?: string;
  data?: T;
  global?: {
    pageCount?: number;
    recCount?: number | string;
  };
}

/**
 * One tracker's current snapshot from GET /api2/last.
 *
 * Everything except `uin` is optional: the vendor's own samples show
 * trackers that report a handful of `io` codes and nothing else, and a
 * tracker that has never reported a fix still appears in the roster.
 * Making these optional here is what forces the adapter to decide
 * explicitly what to do about a missing value instead of silently
 * ingesting a zero.
 */
export interface EagleTrackTrackerStatus {
  /** Tracker id. Taken from the response object's KEY, which the vendor documents as the uin. */
  uin: string;
  lat?: number;
  lng?: number;
  /** km/h */
  speed?: number;
  /** Compass degrees 0-360. Our TelematicsLocation calls this `heading`. */
  bearing?: number;
  /** "YYYY-MM-DD HH:mm:ss" with NO timezone designator -- see parseEagleTrackDate in the adapter. */
  date?: string;
  /** true when the vendor considers the tracker to have stopped reporting. */
  offline?: boolean;
  /** "[gsb]" hex triplet: battery %, GSM quality, satellite count. Informational only. */
  signalex?: string;
  signal?: number;
  /** Numeric-keyed signal bag. See eagletrack-io.map.ts -- never index this with a literal. */
  io?: Record<string, unknown>;
  /** Vendor-side alerting. Deliberately NOT reconciled with our own TelematicsAlert engine in this pass. */
  alert?: {
    cmd?: number;
    trigger?: number;
  };
  sensors?: unknown[];
  odometer?: number;
  id?: number;
}

/** GET /api2/last -- `data` is keyed by uin, NOT an array. */
export type EagleTrackLastResponse = EagleTrackEnvelope<Record<string, EagleTrackTrackerStatus>>;

/**
 * One row of GET /api2/trackers -- the roster used to build the
 * uin -> internal-vehicle match table.
 *
 * `__platenumber` is a vendor CUSTOM FIELD, not a first-class one. It is
 * frequently blank and, in the vendor's own sample data, frequently
 * junk ("abc", "deef"). It is nonetheless the only plate-shaped field
 * available -- see eagletrack.adapter.ts's header for the matching
 * discipline this forces.
 */
export interface EagleTrackTracker {
  id?: string;
  uin: string;
  name?: string;
  model?: string;
  /** Owning userid within the vendor platform. Recorded, not used for scoping -- our tenancy is our own. */
  belong?: string;
  image?: string | false;
  expirationDate?: string | false;
  __platenumber?: string;
  __phonenumber?: string;
  [customField: string]: unknown;
}

/** GET /api2/trackers. `refData` is vendor UI metadata and is deliberately ignored. */
export type EagleTrackTrackersResponse = EagleTrackEnvelope<EagleTrackTracker[]>;

/**
 * Per-tenant Eagle Track credentials, as stored.
 *
 * `domain` is required and has NO default: Eagle Track is deployed
 * per customer/reseller, so unlike Cartrack's fixed
 * https://fleetapi.cartrack.com there is no sensible fallback and
 * guessing one would silently point a tenant at somebody else's
 * platform.
 */
export interface EagleTrackConfig {
  tenantId: string;
  enabled: boolean;
  /** Base URL of this tenant's Eagle Track deployment, e.g. https://gps.example.com */
  domain: string;
  /** Stored as ciphertext (EncryptionService); decrypted only when building the API client. */
  tokenEncrypted: string;
  lastSyncAt?: Date;
  lastSyncStatus?: 'success' | 'error';
  lastSyncError?: string;
  createdAt: Date;
  updatedAt: Date;
  updatedBy?: string;
}

/**
 * Outcome of one tenant's sync.
 *
 * Richer than CartrackSyncResult by design: Eagle Track's matching is
 * best-effort (see §4 / the adapter header), so "how many did we fail to
 * place, and why" is the number an operator actually needs. Every
 * tracker the sync saw is accounted for in exactly one of the counters
 * or lists below -- nothing is dropped silently.
 */
export interface EagleTrackSyncResult {
  tenantId: string;
  /** Trackers whose reading was matched to a vehicle AND ingested. */
  matched: number;
  /** Matched, but the fix was not newer than the one already stored -- see the adapter's staleness guard. */
  skippedStale: number;
  /** Matched, but the payload carried no usable GPS fix (missing/out-of-range/null-island coordinates). */
  skippedNoFix: number;
  /** uins that produced a reading we could not attribute to a vehicle in this tenant. Never auto-created. */
  unmatchedTrackers: string[];
  /** uins present in the roster but absent from the `last` payload -- i.e. vehicles this sync did not cover. */
  trackersWithoutFix: string[];
  errors: string[];
  syncedAt: Date;
}

/**
 * The provider-specific extras we record on each ingested reading. None
 * of these has a home on TelematicsData, and forcing them into an
 * unrelated numeric field would corrupt that field's meaning, so they
 * land in TelematicsData.providerMetadata instead.
 */
export interface EagleTrackReadingMetadata {
  source: 'eagletrack';
  uin: string;
  /** The vendor's raw date string, kept because its timezone is unconfirmed (see the adapter header). */
  rawDate?: string;
  /** true when the vendor flagged the tracker as offline at the time of this snapshot. */
  offline?: boolean;
  signalQuality?: EagleTrackSignalQuality;
  /** Which IO code the odometer was read from, so a scale jump between readings is diagnosable. */
  odometerSourceCode?: string;
  /** Which IO code the fuel percentage was read from. */
  fuelPercentSourceCode?: string;
  /** Fuel level in litres, when the tracker reports litres rather than a percentage. */
  fuelLevelLitres?: number;
  /** Vendor-side alert ids, recorded but NOT reconciled with our own alert engine in this pass. */
  vendorAlert?: { cmd?: number; trigger?: number };
  /** Battery/power/engine-hours style signals that have no TelematicsData field. */
  io?: Record<string, number | boolean>;
}

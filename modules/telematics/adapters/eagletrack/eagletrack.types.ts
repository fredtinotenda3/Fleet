// modules/telematics/adapters/eagletrack/eagletrack.types.ts
//
// Shapes for Eagle Track's white-labelled "api2" GPS platform. These
// began as a transcription of the vendor's published API V2 document and
// have since been corrected against a LIVE DEPLOYMENT
// (GET /api2/trackers, production testing). Where the two disagree, the
// live response wins and the discrepancy is noted inline, because the
// documentation is demonstrably not a reliable contract.
//
// Corrections the live response forced:
//
//   * the static token authenticates as a QUERY PARAMETER only. The
//     documented `token` header is treated as anonymous and redirected
//     to the login page. See eagletrack-api.client.ts.
//   * `__platenumber` DOES NOT EXIST on the live roster. The documented
//     custom field is simply absent from the payload.
//   * a first-class `plate` field does exist, but is empty on every row
//     of the deployment tested.
//   * the plate is carried in `name` (e.g. "ADY2531").
//
// THREE DIFFERENCES FROM CARTRACK worth stating up front, because they
// are the shape assumptions most likely to be wrong in the field:
//
//  1. `last` returns `data` as an OBJECT KEYED BY UIN, not an array.
//     The client flattens it; the key is treated as the authoritative
//     tracker id.
//  2. Failure is signalled IN THE BODY (`error !== 0`) on an HTTP 200,
//     not by status code. The client throws on both.
//  3. Content-Type is meaningless: the live deployment labels its JSON
//     envelope `text/html; charset=UTF-8`, and also answers with a real
//     HTML login page under the same status and Content-Type when a
//     request is unauthenticated. Nothing may branch on it.

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
 * THREE PLATE-BEARING FIELDS, none of them guaranteed. All three are
 * optional here because on the live deployment tested, exactly one of
 * them was usable:
 *
 *   * `plate` -- first-class, and PRESENT on the live response, but
 *     empty ("") on every row of it. Preferred when populated because it
 *     is the field the vendor's own UI labels as the plate.
 *   * `__platenumber` -- a vendor CUSTOM field, documented but entirely
 *     ABSENT from the live response. Where deployments do populate it,
 *     the vendor's own sample data shows it is frequently junk ("abc",
 *     "deef"). Kept in the matching order for those deployments; not
 *     relied on.
 *   * `name` -- free text, and in practice where the plate actually
 *     lives ("ADY2531", "AFU0078"). Also legitimately holds non-plates
 *     ("DashCam2") and plates buried in prose.
 *
 * See eagletrack.adapter.ts's header for the order these are tried in
 * and why matching on `name` is exact-only.
 */
export interface EagleTrackTracker {
  id?: string;
  uin: string;
  /** Free text. On the live deployment this is where the plate is (e.g. "ADY2531"). */
  name?: string;
  model?: string;
  /** Owning userid within the vendor platform. Recorded, not used for scoping -- our tenancy is our own. */
  belong?: string;
  image?: string | false;
  expirationDate?: string | false;
  /** First-class plate field. Present but empty on the live deployment tested. */
  plate?: string;
  /** Documented vendor custom field. Absent from the live deployment tested. */
  __platenumber?: string;
  __phonenumber?: string;
  [customField: string]: unknown;
}

/**
 * Which roster field a tracker's vehicle match came from.
 *
 * Recorded rather than discarded for the same reason
 * EagleTrackReadingMetadata.odometerSourceCode is: when a link turns out
 * to be wrong, the first question is "what did we match on", and
 * answering it from a counter is cheaper than re-deriving it from a
 * vendor payload nobody kept.
 */
export type EagleTrackMatchSource = 'plate' | 'platenumber' | 'name';

/**
 * `refData.users` from GET /api2/trackers -- vendor UI lookup metadata,
 * keyed by the same username api2 expects on `GET /api2/last?user=...`.
 *
 * Mostly ignored (it exists to populate dropdowns in the vendor's own
 * UI), with one exception: it is the fallback source for the account
 * username the live-status poll authenticates as, when no roster row
 * carries a usable `belong`. See deriveEagleTrackUsername in
 * eagletrack.adapter.ts.
 */
export interface EagleTrackRefData {
  users?: Record<string, { title?: string; objId?: string; [field: string]: unknown }>;
  [section: string]: unknown;
}

/**
 * GET /api2/trackers. `refData` was previously "deliberately ignored" --
 * it no longer can be: production testing established that the fleet-wide
 * `uin=__all_sub` selector this integration used for `GET /api2/last` is
 * rejected outright ("Access Denied:__all_sub") on at least one live
 * deployment, and the only endpoint that DOES authenticate,
 * `?user=<username>`, needs an account username this response is the
 * only source of. See deriveEagleTrackUsername.
 */
export type EagleTrackTrackersResponse = EagleTrackEnvelope<EagleTrackTracker[]> & {
  refData?: EagleTrackRefData;
};

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
  /**
   * How the trackers that DID resolve to a vehicle were matched, by
   * roster field. Sums to `matched + skippedNoFix` -- a tracker whose
   * fix was unusable was still matched to a vehicle, so it is counted
   * here even though it is excluded from `matched`.
   *
   * Operationally this is the number that answers "is our matching
   * standing on the fragile field?". On the deployment this integration
   * was tested against, a healthy sync reports everything under `name`
   * and nothing under `plate` or `platenumber`; a sudden shift between
   * buckets means the vendor-side data changed under us.
   */
  matchedBy: Record<EagleTrackMatchSource, number>;
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

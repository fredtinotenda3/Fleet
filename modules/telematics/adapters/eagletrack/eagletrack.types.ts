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
export type EagleTrackMatchSource = 'link' | 'plate' | 'platenumber' | 'name';

/**
 * The explicit, admin-managed uin -> vehicle link.
 *
 * This is the "correct long-term fix" the adapter header has named since
 * the integration shipped: it removes the dependency on vendor free
 * text entirely for the trackers an operator has linked by hand, while
 * leaving plate/name matching in place for everything else.
 *
 * ORG-UNIT SCOPED, sourced from the vehicle. A link is a statement about
 * one vehicle, so it inherits that vehicle's unit -- which is also what
 * makes "a branch manager may link a tracker to their own branch's
 * vehicle, and to nothing else" enforceable rather than advisory.
 *
 * `orgUnitId` is DERIVED at write time from a scope-checked vehicle
 * lookup and is never accepted from a request body -- the same rule the
 * finance module's allocation postings follow, for the same reason: a
 * caller who can stamp their own scope onto a row can file records
 * against another branch's vehicle.
 */
export interface EagleTrackTrackerLink {
  _id?: string;
  tenantId: string;
  orgUnitId?: string;
  /** The vendor tracker id. Unique per tenant -- one tracker cannot be two vehicles. */
  uin: string;
  /** Mongo _id of the vehicle, NOT a license plate. Plates are mutable; ids are not. */
  vehicleId: string;
  /** Denormalised for the admin list only. Never used for matching -- the vehicleId is authoritative. */
  licensePlate?: string;
  /** Free-text `name` the tracker carried when the link was made, so a later vendor-side rename is visible. */
  trackerName?: string;
  note?: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
  isDeleted?: boolean;
}

/**
 * A tracker the latest sync could not attribute to a vehicle, recorded
 * so the admin mapping screen has something to list.
 *
 * Held on the tenant's Eagle Track config document rather than in a
 * collection of its own: it is a snapshot of one sync's outcome, fully
 * replaced by the next sync, with no history worth keeping and no
 * independent lifecycle. A collection would need its own scoping
 * decision, its own retention policy and its own index for no benefit.
 */
export interface EagleTrackUnmatchedTracker {
  uin: string;
  name?: string;
  plate?: string;
  model?: string;
  /** Whether the fleet poll returned a position for this tracker in the sync that recorded it. */
  hadFix: boolean;
}

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
  /**
   * Trackers the LAST sync could not attribute to a vehicle -- the input
   * the admin mapping screen needs. Fully replaced on every sync; see
   * EagleTrackUnmatchedTracker for why this is not a collection.
   */
  lastUnmatchedTrackers?: EagleTrackUnmatchedTracker[];
  /** When the driver/trigger sub-syncs last completed, so the settings UI can report them independently of the position poll. */
  lastDriverSyncAt?: Date;
  lastTriggerSyncAt?: Date;
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
/**
 * Outcome of one driver sync.
 *
 * `linked` counts drivers that resolved to an EXISTING internal driver
 * record; `created` counts genuinely new ones. The split is the number
 * that answers "is this sync duplicating my roster" -- a healthy second
 * run reports created: 0.
 */
export interface EagleTrackDriverSyncResult {
  fetched: number;
  created: number;
  linked: number;
  updated: number;
  /** Provider rows with no usable provider id -- never imported, see EagleTrackDriver. */
  skippedNoId: number;
  /**
   * Provider drivers whose name/code matched MORE THAN ONE internal
   * driver. Never resolved by guessing; reported so an operator can
   * disambiguate. Mirrors findByNameOrCode's "exactly one hit" rule.
   */
  ambiguous: string[];
  errors: string[];
}

/** Outcome of one trigger sync. */
export interface EagleTrackTriggerSyncResult {
  fetched: number;
  /** Provider triggers stored/refreshed in tbltelematics_eagletrack_triggers. */
  stored: number;
  /** Geofences created from spatial triggers that carried readable geometry. */
  geofencesCreated: number;
  /** Existing geofences matched by provider trigger id and refreshed rather than duplicated. */
  geofencesUpdated: number;
  /** Spatial triggers whose payload yielded no readable geometry -- recorded, never given a default shape. */
  geofencesSkippedNoGeometry: number;
  /** Trigger types that describe a threshold rather than a place (1/3/4/6). Stored, never made into geofences. */
  nonSpatial: number;
  /** Type codes outside the documented 0-6 range, kept raw. */
  unknownTypes: number[];
  errors: string[];
}

/** Outcome of one vendor-alert import. */
export interface EagleTrackAlertSyncResult {
  fetched: number;
  /** Alerts written for the first time. A repeat run over the same window reports 0. */
  imported: number;
  /** Already held, recognised by provider alert id. */
  duplicates: number;
  /** Alerts whose uin resolved to no vehicle in this tenant -- never attributed to a guess. */
  unmatched: string[];
  errors: string[];
}

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
  /**
   * Outcome of the driver and trigger sub-syncs, when they ran.
   *
   * Absent rather than zeroed when a sub-sync did not run at all (the
   * cadence gate below the position poll's, or a failure before it was
   * reached) -- "did not run" and "ran and found nothing" are different
   * facts and an operator chasing a missing driver needs to tell them
   * apart.
   */
  drivers?: EagleTrackDriverSyncResult;
  triggers?: EagleTrackTriggerSyncResult;
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

// ─────────────────────────────────────────────────────────────────────
// HISTORY / REPORTS / DRIVERS / TRIGGERS
//
// SHAPE CONFIDENCE, stated once here rather than repeated per type:
// /api2/last, /api2/trackers and /api2/reports/fuel were corrected
// against a live deployment. The rest have NOT been. Their row types are
// therefore modelled as `EagleTrackVendorRow` -- an opaque bag -- and
// read through eagletrack-field-map.ts's candidate aliases, which report
// every key they could not place. Declaring optimistic interfaces with
// invented field names would compile perfectly and read `undefined`
// forever on a real deployment; see that file's header.
//
// The fuel report is worth studying before trusting the documentation
// on the others. It came back as a rendered TABLE of display strings
// (see EagleTrackColumnarData) rather than the documented record list,
// which is the third documented-contract failure this integration has
// found on this platform, after the `token` header and `__platenumber`.
// ─────────────────────────────────────────────────────────────────────

/** One record from an endpoint whose field names are not yet confirmed. */
export type EagleTrackVendorRow = Record<string, unknown>;

/**
 * GET /api2/history. `data` is documented as an array of position rows
 * shaped like `last`'s entries (that is why flattenLastPayload already
 * tolerates an array). Modelled as the confirmed status shape so the
 * existing mapper can be reused, but read defensively -- a row that
 * carries none of the expected fields is skipped, not mapped to zeros.
 */
export type EagleTrackHistoryResponse = EagleTrackEnvelope<
  EagleTrackTrackerStatus[] | Record<string, EagleTrackTrackerStatus>
>;

/**
 * A rendered-table payload: a header array plus positional cell rows,
 * with the vendor's counter block NESTED INSIDE `data` rather than
 * beside it in the envelope.
 *
 * CONFIRMED against a live deployment. This is what /api2/reports/fuel
 * actually returns, and it is a different shape from every other api2
 * endpoint -- the reports family renders a table rather than serialising
 * records:
 *
 *   { "error": 0, "data": { "column": ["Name", "From", ...],
 *                           "body": [["AFU0078", "2026-08-20 00:04:07", ...]],
 *                           "global": { "pageCount": 0, "recCount": "1318" } } }
 *
 * Note what the cells are: display STRINGS. "7.14 km", "34853.05 km",
 * "-" for a figure the provider does not have, and a whole
 * semicolon-delimited sentence in the `Fuel` column. See
 * eagletrack-report-values.ts.
 */
export interface EagleTrackColumnarData {
  column?: string[];
  body?: Array<Array<string | number | null> | EagleTrackVendorRow>;
  global?: {
    pageCount?: number | string;
    recCount?: number | string;
  };
}

/**
 * GET /api2/reports/fuel.
 *
 * The columnar form is confirmed. The union keeps the record forms
 * because the alias/reader layer handles all three at no cost, and
 * narrowing to the one shape observed on one deployment is the
 * assumption this integration has been burned by repeatedly
 * (`__platenumber`, the `token` header, `uin=__all_sub`).
 */
export type EagleTrackFuelReportResponse = EagleTrackEnvelope<
  EagleTrackColumnarData | EagleTrackVendorRow[] | Record<string, EagleTrackVendorRow>
>;

/** GET /api2/drivers. Row shape unconfirmed. */
export type EagleTrackDriversResponse = EagleTrackEnvelope<
  EagleTrackVendorRow[] | Record<string, EagleTrackVendorRow>
>;

/** GET /api2/triggers. Row shape unconfirmed. */
export type EagleTrackTriggersResponse = EagleTrackEnvelope<
  EagleTrackVendorRow[] | Record<string, EagleTrackVendorRow>
>;

/**
 * A driver as read from /api2/drivers.
 *
 * `providerDriverId` is the reconciliation key and the ONLY field that
 * is required: without a stable provider id there is nothing to
 * reconcile against on the next sync, and matching purely on name would
 * re-create a driver every time somebody fixes a typo in the vendor UI.
 * A row with no usable id is reported as skipped, never imported.
 */
export interface EagleTrackDriver {
  providerDriverId: string;
  name?: string;
  /** Short code / badge number, when the deployment carries one. Matched against Driver.driver_code. */
  code?: string;
  phone?: string;
  email?: string;
  licenseNumber?: string;
  /** uin of the tracker this driver is currently assigned to, when the payload says. */
  uin?: string;
  /** Vendor keys no candidate alias claimed -- the correction list. See eagletrack-field-map.ts. */
  unmappedFields: string[];
  /** The row exactly as the provider sent it. */
  raw: EagleTrackVendorRow;
}

/**
 * A trigger as read from /api2/triggers, before any decision about
 * whether it becomes a Geofence.
 *
 * `typeCode` is kept as the vendor's raw number even when it is outside
 * the documented 0-6 range, so an undocumented future type is visible in
 * the data rather than being coerced into a documented one.
 */
export interface EagleTrackTrigger {
  providerTriggerId: string;
  name?: string;
  typeCode: number | null;
  /** The vendor's own label for `typeCode`, or null for an undocumented code. */
  typeLabel: string | null;
  active?: boolean;
  /** uin the trigger is bound to, when it is bound to one rather than the whole account. */
  uin?: string;
  /** Speed threshold in km/h, for type 1. Absent when the payload does not carry one. */
  speedLimitKmh?: number;
  /** Duration threshold in minutes, for types 3/4. Absent when the payload does not carry one. */
  durationMinutes?: number;
  /** Geometry, ONLY when the payload actually yielded readable coordinates. Never defaulted. */
  geometry?:
    | { kind: 'circle'; center: { lat: number; lng: number }; radiusMeters: number }
    | { kind: 'polygon'; points: Array<{ lat: number; lng: number }> }
    | { kind: 'route'; points: Array<{ lat: number; lng: number }>; toleranceMeters: number };
  unmappedFields: string[];
  raw: EagleTrackVendorRow;
}

/**
 * A cross-field inconsistency found on one report row.
 *
 * These are not vendor errors and not our own arithmetic replacing the
 * vendor's -- they are SELF-CHECKS on a positionally-mapped table. The
 * fuel report arrives as `{ column, body }`, so every value's meaning
 * depends entirely on its index, and the cheapest way to detect a shift
 * (a column added upstream, a short body row) is to notice that figures
 * which must agree no longer do. Each flag is reported alongside the
 * values, never instead of them.
 */
export type EagleTrackFuelRowFlag =
  /**
   * A consumption rate of exactly 0 on a row whose fuel-used figure the
   * provider explicitly marked "-". A vehicle cannot both have covered
   * distance on precisely zero litres and have no fuel measurement, so
   * this 0 is a rendering placeholder, not a reading. The value stays on
   * the row; summariseCanonicalFuel refuses to promote it to a headline
   * figure.
   */
  | 'zero-consumption-rate-without-fuel-used'
  /** Reported distance disagrees with end-minus-start odometer beyond tolerance -- the strongest available signal of a column shift. */
  | 'distance-odometer-mismatch'
  /** End odometer below start odometer: a device reset, a replaced unit, or misaligned columns. */
  | 'odometer-decreased';

/**
 * One period row of the fuel report, mapped onto the vocabulary this
 * product already uses.
 *
 * NOTHING HERE IS DERIVED. Each field is present only when the provider
 * sent a value a candidate alias matched. In particular
 * `fuelConsumedLitres` is never computed as initial-minus-final: those
 * two readings can come from different sensors on different scales, and
 * a subtraction across them would be our arithmetic presented as the
 * provider's measurement. The same rule blocks the tempting
 * end-odometer-minus-start-odometer shortcut for `distanceKm`.
 *
 * THREE WAYS A FIGURE CAN BE MISSING, kept distinct because they lead to
 * different operator actions:
 *   * the field is simply absent      -> the device may not report it,
 *                                        or we may have the wrong alias;
 *                                        `unmappedFields` disambiguates.
 *   * listed in `noDataFields`        -> the provider explicitly said it
 *                                        has none ("-"). Definitive.
 *   * listed in `unparsableFields`    -> a value arrived and could not be
 *                                        read (unknown unit, ambiguous
 *                                        separator). A bug to fix, not a
 *                                        gap in the data.
 */
export interface EagleTrackFuelReportRow {
  uin: string;
  /**
   * The identifier the report itself carries for the row -- the `Name`
   * column on the live deployment, which holds the tracker name (and on
   * this tenant, the plate).
   *
   * Kept SEPARATE from `uin` and never promoted into it. A report row
   * has no uin at all, so if this were folded into `uin` a deployment
   * that answers a single-tracker request with the whole account's
   * report would have every other vehicle's fuel silently attributed to
   * the one that was asked about. eagletrack-fuel.service.ts uses this
   * to decide attribution.
   */
  providerName?: string;
  /** The provider's period start, verbatim (its timezone is unconfirmed -- see parseEagleTrackDate). */
  periodStart?: string;
  periodEnd?: string;
  /** `periodStart` parsed to an ISO instant, present only when it parsed. The raw string is kept regardless. */
  periodStartIso?: string;
  periodEndIso?: string;
  initialFuelLitres?: number;
  finalFuelLitres?: number;
  fuelConsumedLitres?: number;
  refuelledLitres?: number;
  drainedLitres?: number;
  /** Number of refuelling events in the period, from the `Fuel` summary. A reported 0 is real and kept. */
  refuelEventCount?: number;
  /** Number of fuel-loss ("leakage") events in the period, from the `Fuel` summary. */
  drainEventCount?: number;
  distanceKm?: number;
  startOdometerKm?: number;
  endOdometerKm?: number;
  /** Litres per 100 km, when the provider reports a rate rather than only totals. */
  consumptionPer100Km?: number;
  /** Cost of fuel for the period. Currency is reported as sent, never inferred from a symbol. */
  fuelCost?: number;
  /** Three-letter code, only when the provider wrote one explicitly. */
  fuelCostCurrencyCode?: string;
  /** The symbol the provider wrote, verbatim and uninterpreted. "$" identifies no single currency. */
  fuelCostCurrencySymbol?: string;
  /** Canonical field names the provider explicitly reported as "no data". */
  noDataFields: string[];
  /** Canonical field names whose cell was present but unreadable. Always a bug in the unit or alias table, never a data gap. */
  unparsableFields: string[];
  /** Cross-field inconsistencies detected on this row. See EagleTrackFuelRowFlag. */
  flags: EagleTrackFuelRowFlag[];
  unmappedFields: string[];
  /** Labels inside the `Fuel` summary cell that no alias claimed. The correction surface for that column. */
  unmappedFuelSummaryLabels: string[];
  raw: EagleTrackVendorRow;
}

/**
 * A vendor alert read from GET /api2/history?alertfilter=__allalert.
 *
 * The provider's own identifiers are preserved verbatim
 * (`providerAlertId`, `providerTriggerId`, `typeCode`) because they are
 * the only thing that makes a second sync able to recognise an alert it
 * already stored -- see TelematicsAlert's provider fields in the
 * tenancy/provider addendum.
 */
export interface EagleTrackVendorAlert {
  uin: string;
  /** Deterministic when the provider supplies an id; otherwise derived from uin+timestamp+trigger. See buildVendorAlertKey. */
  providerAlertId: string;
  providerTriggerId?: string;
  typeCode: number | null;
  typeLabel: string | null;
  message?: string;
  occurredAt: Date;
  position?: { lat: number; lng: number; speed?: number };
  unmappedFields: string[];
  raw: EagleTrackVendorRow;
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

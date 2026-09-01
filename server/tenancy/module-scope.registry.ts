// server/tenancy/module-scope.registry.ts
//
// The declared tenancy level of every domain module, in one reviewable
// place.
//
// ---------------------------------------------------------------------
// Why a registry instead of "just wire each repository"
// ---------------------------------------------------------------------
// "Is this module organization-wide or branch-scoped?" is a product
// decision with a security consequence in both directions:
//
//   scoped when it should be shared -> a branch manager cannot see the
//     fuel stations they are meant to use; data appears to vanish.
//   shared when it should be scoped -> one branch reads another
//     branch's purchase orders. That is the breach.
//
// Previously that decision existed only as the presence or absence of a
// `tenantScopeService.buildFilter()` call buried in a repository method,
// which means (a) nobody can audit the set of decisions without reading
// thirty files, and (b) a new read path -- the stats endpoint, the CSV
// export, the analytics aggregate -- silently defaults to "shared",
// because forgetting to add a filter is invisible. That exact failure is
// what left the original five modules leaking on their stats/export
// endpoints while their list endpoints were correctly scoped.
//
// This registry inverts the default. The declaration is data, the
// conformance suite (tests/security/module-scope-conformance.spec.ts)
// reads it, and a module declared 'org-unit' that lacks its wiring fails
// CI rather than shipping.
//
// ---------------------------------------------------------------------
// Changing a decision
// ---------------------------------------------------------------------
// Flip `level`, update `rationale`, and run `npm run test:security`. If
// you move a module from 'organization' to 'org-unit' you must also
// backfill `orgUnitId` on its existing rows (scripts/backfill-org-units.ts)
// or those rows become invisible to scope-narrowed users.

export type ModuleScopeLevel =
  /** Owned by the platform operator, not by any customer. Never returned to a tenant. */
  | 'platform'
  /** Shared across the whole organization. Every member sees the same rows. */
  | 'organization'
  /** Belongs to one branch/department/workshop/fleet. Filtered by orgUnitId. */
  | 'org-unit'
  /**
   * Owns no collection of its own. Every read is a call into another
   * module's already-scoped repository/service, with the caller's
   * TenantContext forwarded unchanged -- so this module's own
   * "scoping decision" is really "does every read site forward
   * context instead of dropping it". See the 'ai' / 'analytics' /
   * 'esg' entries below for what was actually audited to confirm
   * this, including a real bug (fixed in this pass) where one read
   * site silently didn't.
   */
  | 'computed';

/**
 * Where a row's `orgUnitId` comes from when it is created, and what a
 * migration should join to when backfilling existing rows.
 */
export type OrgUnitSource =
  | 'vehicle'
  | 'driver'
  | 'workshop-bay'
  | 'parent-record'
  | 'explicit';

export interface ModuleScopeEntry {
  /** Directory name under modules/. */
  module: string;
  /**
   * MongoDB collections this module owns. Used by the backfill + audit
   * tooling. Empty ONLY for `level: 'computed'` modules, which by
   * definition own no collection -- see that level's doc comment.
   */
  collections: string[];
  level: ModuleScopeLevel;
  /**
   * Which entity the orgUnitId is inherited from. Required for
   * 'org-unit' modules; the backfill migration refuses to guess.
   */
  orgUnitSource?: OrgUnitSource;
  /** Why this level. Written for the person auditing the decision, not for the compiler. */
  rationale: string;
  /**
   * True when a human has explicitly signed off on the level. False
   * means "engineering's best reading of the domain, pending product
   * confirmation" -- surfaced by `npm run tenancy:report` so the open
   * questions stay visible instead of decaying into assumed fact.
   */
  confirmed: boolean;
}

export const MODULE_SCOPE_REGISTRY: ModuleScopeEntry[] = [
  // ── Core fleet: scoped. Settled in Phases A-C, in production. ──────
  {
    module: 'vehicles',
    collections: ['tblvehicles'],
    level: 'org-unit',
    orgUnitSource: 'explicit',
    rationale:
      'A vehicle is physically based at one branch or fleet, and everything else ' +
      'in the product inherits its scope from the vehicle.',
    confirmed: true,
  },
  {
    module: 'drivers',
    collections: ['tbldrivers'],
    level: 'org-unit',
    orgUnitSource: 'explicit',
    rationale:
      'A driver is employed by one branch or department; the roster is that ' +
      "unit's staffing information.",
    confirmed: true,
  },
  {
    module: 'fuel',
    collections: ['tblfuellogs'],
    level: 'org-unit',
    orgUnitSource: 'vehicle',
    rationale: 'A fuel log inherits the scope of the vehicle it belongs to.',
    confirmed: true,
  },
  {
    module: 'expenses',
    collections: ['tblexpenses'],
    level: 'org-unit',
    orgUnitSource: 'vehicle',
    rationale: 'An expense is charged against a vehicle and therefore a branch budget.',
    confirmed: true,
  },
  {
    module: 'trips',
    collections: ['tbltrips'],
    level: 'org-unit',
    orgUnitSource: 'vehicle',
    rationale: 'A trip inherits the scope of the vehicle that ran it.',
    confirmed: true,
  },
  {
    module: 'maintenance',
    collections: ['tblreminders', 'tblmaintenance'],
    level: 'org-unit',
    orgUnitSource: 'vehicle',
    rationale:
      'Maintenance is scheduled against a vehicle and executed by that vehicle\'s ' +
      'home workshop.',
    confirmed: true,
  },
  {
    module: 'bookings',
    collections: ['tblbookings'],
    level: 'org-unit',
    orgUnitSource: 'vehicle',
    rationale: 'A booking reserves a specific vehicle from a specific fleet.',
    confirmed: true,
  },
  {
    module: 'dispatch',
    collections: ['tbldispatchjobs'],
    level: 'org-unit',
    orgUnitSource: 'vehicle',
    rationale: 'Dispatch assigns a branch vehicle and driver to a job.',
    confirmed: true,
  },
  {
    module: 'inventory',
    collections: ['tblspareparts', 'tblstockmovements'],
    level: 'org-unit',
    orgUnitSource: 'workshop-bay',
    rationale: 'Stock is physically held at one workshop; counts are per-location.',
    confirmed: true,
  },
  {
    module: 'workorders',
    collections: ['tblworkorders'],
    level: 'org-unit',
    orgUnitSource: 'vehicle',
    rationale: 'A work order is executed by one workshop on one vehicle.',
    confirmed: true,
  },
  {
    module: 'dvir',
    collections: ['tbldvirinspections'],
    level: 'org-unit',
    orgUnitSource: 'vehicle',
    rationale:
      'A DVIR inspection is performed by a driver against one vehicle and inherits that ' +
      "vehicle's orgUnitId at submission time, mirroring workorders/maintenance. A driver " +
      "must only be able to inspect and browse inspections for their own branch/fleet's " +
      'vehicles, so scoped reads follow the same TenantScopedRepository pattern.',
    confirmed: true,
  },
  {
    module: 'workshop',
    collections: ['tblworkshopbays', 'tblmechanicassignments'],
    level: 'org-unit',
    orgUnitSource: 'explicit',
    rationale:
      'A bay is part of one physical workshop, and bay availability drives that ' +
      "workshop's scheduling.",
    confirmed: true,
  },
  {
    module: 'notifications',
    collections: ['tblnotifications'],
    level: 'org-unit',
    orgUnitSource: 'explicit',
    rationale:
      'Broadcast notifications target an org unit. Direct notifications are addressed ' +
      'by userId, which is strictly narrower than any org-unit filter.',
    confirmed: true,
  },

  // ── Newly scoped in this pass. ────────────────────────────────────
  {
    module: 'digital-twin',
    collections: ['tblvehicledigitaltwins'],
    level: 'org-unit',
    orgUnitSource: 'vehicle',
    rationale:
      'A twin is a read-model projection of one vehicle. It must not be readable by ' +
      'anyone who cannot read the vehicle it projects -- it carries the vehicle location, ' +
      'sensor state, driver assignment and open alerts in a single document, so leaking ' +
      'the twin leaks strictly more than leaking the vehicle row.',
    confirmed: true,
  },
  {
    module: 'telematics',
    collections: [
      'tbltelematics',
      'tbltelematics_alerts',
      'tbltelematics_geofences',
      'tbltelematics_devices',
      // Eagle Track provider extensions. All three inherit the vehicle
      // scope like everything else in this module:
      //   _links    -- the operator-declared uin -> vehicle mapping.
      //                Derives its orgUnitId from a scope-checked
      //                vehicle lookup and NEVER from a request body; a
      //                caller who could stamp their own scope here could
      //                redirect another branch's telemetry into their
      //                own vehicle.
      //   _triggers -- the vendor's geofence/speed/idle/stop/route
      //                objects. Scoped from the linked vehicle when the
      //                trigger names a tracker; an account-wide trigger
      //                carries no orgUnitId and is read with the same
      //                "mine OR unassigned" predicate geofences use,
      //                for the same reason.
      'tbltelematics_eagletrack_links',
      'tbltelematics_eagletrack_triggers',
      // Reverse-geocoding cache. TENANT-scoped but deliberately NOT
      // org-unit scoped: within a tenant it is derived reference data
      // about coordinates that tenant already had the right to see, and
      // partitioning it per unit would multiply upstream calls against a
      // free service for a boundary the vehicle read itself already
      // enforces. It is emphatically NOT shared across tenants -- see
      // geocode-cache.repository.ts for why a global cache would be a
      // cross-tenant movement-inference channel.
      'tblgeocode_cache',
      // PHASE 4 daily aggregates, read by the reporting path added in
      // BACKLOG ITEM 5. Registered here because a rollup carries the
      // orgUnitId of the readings it summarises and is read through the
      // same scope predicate: an aggregate over expired telemetry must
      // not become the side channel the row-level filter closed, which
      // is exactly what happened with the anomaly severity counts and
      // the report engine's $match.
      'tbltelematics_daily_rollup',
    ],
    level: 'org-unit',
    orgUnitSource: 'vehicle',
    rationale:
      'GPS traces, speeding alerts and geofence definitions are per-vehicle and inherit ' +
      'the vehicle scope. This is the most sensitive data in the product: it is a ' +
      'movement history of identifiable employees. The Eagle Track provider collections ' +
      'added alongside them (tracker links, vendor triggers) inherit the same vehicle ' +
      'scope; the geocode cache is tenant-scoped reference data.',
    confirmed: true,
  },
  {
    module: 'scheduling',
    collections: ['tbldrivershifts'],
    level: 'org-unit',
    orgUnitSource: 'driver',
    rationale:
      'A shift rosters one driver (optionally onto one vehicle). Rosters are a ' +
      'branch/department operational concern and reveal staffing levels.',
    confirmed: true,
  },

  // ── The eight that required a judgement call. ─────────────────────
  // These were flagged "ask before scoping". Each is decided below with
  // its reasoning, and each is a one-line change if product disagrees.
  // `confirmed: false` keeps them listed as open in `tenancy:report`.
  {
    module: 'fuel-cards',
    collections: ['tblfuelcards'],
    level: 'org-unit',
    orgUnitSource: 'vehicle',
    rationale:
      'SCOPED. A fuel card is issued against a specific vehicle (FuelCard carries ' +
      'license_plate) and carries a spend limit and a PAN suffix. Card credentials and ' +
      'limits belonging to another branch are a payment-fraud surface, not reference data. ' +
      'Contrast fuel-stations below -- the station is a place anyone may drive to; the ' +
      'card is an instrument assigned to one vehicle.',
    confirmed: false,
  },
  {
    module: 'fuel-stations',
    collections: ['tblfuelstations'],
    level: 'organization',
    rationale:
      'SHARED. Stations are geographic reference data (name, brand, coordinates, posted ' +
      'price). Scoping them would break the common case of a driver refuelling outside ' +
      'their home branch: the station would not appear in their picker and the fuel log ' +
      'could not be recorded. There is no confidential per-branch content in a station row. ' +
      'This is also why 16 orphaned tblfuelstations rows were safe to leave unassigned.',
    confirmed: false,
  },
  {
    module: 'sla',
    collections: ['tblslapolicies', 'tblslabreaches'],
    level: 'organization',
    rationale:
      'SHARED. An SLA policy is an organization-level commitment (e.g. "P1 breakdowns ' +
      'responded to within 4h") that must read identically everywhere or the same event ' +
      'is judged compliant in one branch and breached in another. Note the asymmetry: the ' +
      'POLICY is shared, but a BREACH record is evidence about a specific work order and ' +
      'inherits that work order\'s scope -- see the breach filter in sla.repository.ts.',
    confirmed: false,
  },
  {
    module: 'procurement',
    collections: ['tblpurchaserequests', 'tblpurchaseorders'],
    level: 'org-unit',
    orgUnitSource: 'explicit',
    rationale:
      'SCOPED. A purchase request is raised against a branch or workshop budget and ' +
      'routed to that unit\'s approver. Cross-unit visibility here is a segregation-of-duties ' +
      'failure: PROCUREMENT_APPROVE is granted to BRANCH_MANAGER, so leaving this shared ' +
      'lets any branch manager approve any other branch\'s spend.',
    confirmed: false,
  },
  {
    module: 'vendors',
    collections: ['tblvendors'],
    level: 'organization',
    rationale:
      'SHARED. The vendor register is master data -- negotiated rates, tax IDs, contract ' +
      'terms -- maintained centrally and referenced by every branch\'s purchase orders. ' +
      'Scoping it would fragment the register and let the same supplier be onboarded five ' +
      'times with five different rates.',
    confirmed: false,
  },
  {
    module: 'compliance',
    collections: ['tblcompliancerules', 'tblcompliancerecords'],
    level: 'org-unit',
    orgUnitSource: 'parent-record',
    rationale:
      'SPLIT, and the split matters. A compliance RULE ("every vehicle needs a valid ' +
      'roadworthiness certificate") is an organization-wide policy. A compliance RECORD is ' +
      'evidence about one vehicle or one driver -- expiry dates, licence numbers, ' +
      'inspection outcomes -- and inherits that subject\'s scope. Only the record ' +
      'collection is filtered; see compliance.repository.ts.',
    confirmed: false,
  },
  {
    module: 'intelligence',
    collections: ['tblanomalies'],
    level: 'org-unit',
    orgUnitSource: 'vehicle',
    rationale:
      'SCOPED. An anomaly is derived from a vehicle\'s fuel/trip/expense history and names ' +
      'the vehicle (licensePlate) in its payload. A derived record cannot be less protected ' +
      'than its inputs, or the analytics layer becomes a bypass for the scoping applied to ' +
      'the source collections. PHASE 0 FIX: orgUnitId was declared on the type (see ' +
      'anomaly.tenancy-addendum.ts) and already used to filter READS ' +
      '(AnomalyRepository.getFiltered -> tenantScopeService.buildFilter), but nothing ever ' +
      'resolved and set it at WRITE time -- AnomalyDetectionService.persistBatch() created ' +
      'every anomaly with orgUnitId undefined. Net effect before this fix: fail-closed ' +
      'invisibility, not a leak -- a scope-restricted caller\'s anomaly feed was always empty ' +
      'regardless of how many anomalies existed for their vehicles. persistBatch() now ' +
      'resolves each anomaly\'s licensePlate to its vehicle\'s own orgUnitId via ' +
      'VehicleIdentityResolver (Phase 0 item 3) before persisting, fail-closed (orgUnitId left ' +
      'undefined) on an unresolvable or ambiguous plate rather than guessing.',
    confirmed: true,
  },
  {
    module: 'reporting',
    collections: ['tblreportdefinitions', 'tblreporttemplates', 'tblreportexecutions'],
    level: 'organization',
    rationale:
      'SHARED DEFINITIONS, SCOPED RESULTS. A report definition is a reusable artifact ' +
      'authored centrally. The leak vector is not the definition, it is the OUTPUT: a ' +
      'definition that queries tblvehicles must run under the caller\'s TenantContext so ' +
      'the rows it returns are filtered. Enforcement therefore belongs in the execution ' +
      'engine, not on the definition row -- see report-execution.service.ts. Scoping the ' +
      'definitions themselves would give every branch its own copy of every report and ' +
      'still not fix the output leak.',
    confirmed: false,
  },

  // ── Confirmed in the Phase 0 foundation-integrity pass. ────────────
  {
    module: 'attention',
    collections: ['tblattentionitems', 'tblvalueledger', 'tblattention_dispatches'],
    level: 'org-unit',
    orgUnitSource: 'parent-record',
    rationale:
      'SCOPED, OWNERSHIP RESOLVED PER ITEM. Each attention_items row is a persisted snapshot ' +
      'of a NeedsAttentionItem produced by needsAttentionService, which already reads every ' +
      "upstream source (vehicles, drivers, fuel, expenses, compliance) through the caller's " +
      'org-unit-scoped TenantContext, so a row cannot exist that the caller who generated it ' +
      "was not allowed to see. PHASE 0 FIX: needsAttentionService.persistFeed() now resolves " +
      "each item's TRUE owning orgUnitId via AttentionOwnershipResolver (see " +
      'attention-ownership.resolver.ts), keyed off that item\'s own vehicle/driver/expense -- ' +
      "it no longer tags every row in a refresh with the request's activeOrgUnitId. A caller " +
      "in Harare who surfaces an item about a Bulawayo vehicle now persists that row scoped to " +
      'Bulawayo, not Harare. An item whose owner cannot be safely determined (no single owning ' +
      'entity, e.g. a multi-vehicle fleet-health recommendation; or an entity not yet backfilled ' +
      'with its own orgUnitId) is persisted with orgUnitId unset -- fail-closed, invisible to ' +
      'narrowed reads, same as any other unbackfilled row in this codebase. value_ledger ' +
      'inherits the same (now correctly-resolved) orgUnitId from the attention item it ' +
      'evidences at write time, in POST /:id/resolve. BACKLOG ITEM 6 adds ' +
      'tblattention_dispatches, which records what an item CAUSED (a work order, a scheduled ' +
      'maintenance job). It inherits the item\'s own orgUnitId at write time and its list read ' +
      'applies the standard predicate -- a dispatch record names a vehicle and the work created ' +
      'against it, so it is exactly as sensitive as the item behind it. The idempotency PROBE ' +
      '(findDispatch) is deliberately tenant-scoped only: narrowing it by org unit would let a ' +
      'caller in another branch miss an existing dispatch and raise a second work order for the ' +
      'same finding.',
    confirmed: true,
  },

  // ── Organization- and platform-level by nature. Do not scope. ─────
  {
    module: 'organizations',
    collections: ['tblorganizations', 'tblorgunits'],
    level: 'organization',
    rationale: 'The organization record and its own hierarchy. Scoping it is circular.',
    confirmed: true,
  },
  {
    module: 'billing',
    collections: ['tblsubscriptions', 'tblinvoices', 'tblusagerecords'],
    level: 'organization',
    rationale: 'Billing is per-contract, which is per-organization. Branches are not billed.',
    confirmed: true,
  },
  {
    module: 'security',
    collections: [
      'tblcustomroles',
      'tbluser_scope_assignments',
      'tblresourcepermissions',
      'tblusersessions',
      'tblapikeys',
      'tblauditlogs',
    ],
    level: 'organization',
    rationale:
      'The authorization model itself. Scoping the scope-assignment table by scope is ' +
      'circular, and an audit log that a branch manager could filter out of is not an ' +
      'audit log.',
    confirmed: true,
  },
  {
    module: 'oauth',
    collections: ['tbloauthclients', 'tbloauthtokens'],
    level: 'organization',
    rationale: 'OAuth clients authenticate to the organization, not to a branch.',
    confirmed: true,
  },
  {
    module: 'webhooks',
    collections: ['tblwebhooks', 'tblwebhookdeliveries'],
    level: 'organization',
    rationale: 'Subscriptions are organization-level integration config.',
    confirmed: true,
  },
  {
    module: 'workflows',
    collections: ['tblworkflows', 'tblworkflow_instances'],
    // PHASE 5, F-14: raised from 'organization' to 'org-unit'.
    //
    // The module holds BOTH kinds of data, and the level records the
    // stricter one because that is the safety-relevant fact:
    //
    //   tblworkflows           DEFINITIONS -- organization-level
    //                          approval POLICY. "Purchases over $5,000
    //                          need a manager" applies company-wide, and
    //                          scoping definitions per branch would mean
    //                          maintaining copies that drift. These stay
    //                          visible organization-wide BY DESIGN.
    //   tblworkflow_instances  INSTANCES -- one branch's actual request.
    //                          Org-unit scoped.
    //
    // Before Phase 5 every WorkflowEngine method took a bare tenantId,
    // so the caller's accessible org units were discarded at the door
    // and a Bulawayo manager holding WORKFLOW_APPROVE could approve
    // Harare's requests.
    level: 'org-unit',
    // Derived from the TARGET ENTITY (the expense/work order/vehicle the
    // workflow is about), not from the request context -- instances are
    // frequently started by background handlers that have no context at
    // all. See modules/workflows/services/workflow-ownership.resolver.ts.
    orgUnitSource: 'explicit',
    rationale:
      'Workflow INSTANCES are one org unit\'s operational requests and are scoped ' +
      'accordingly; workflow DEFINITIONS remain organization-wide approval policy ' +
      'and are deliberately not scoped.',
    confirmed: true,
  },
  {
    module: 'rules',
    collections: ['tblbusinessrules'],
    level: 'organization',
    rationale:
      'Business rules are organization-level policy and must evaluate identically ' +
      'for every branch.',
    confirmed: true,
  },
  {
    module: 'plugins',
    collections: ['tblplugins', 'tblplugininstallations'],
    level: 'platform',
    rationale:
      'The plugin catalogue is owned by the platform operator and written with ' +
      'PLATFORM_OWNER_TENANT_ID. Per-organization installations are organization-level.',
    confirmed: true,
  },
  // ── Newly scoped in the cost-per-km engine pass. ───────────────────
  {
    module: 'finance',
    collections: ['tblallocationledger', 'tbldepreciationprofiles', 'tblglsubmissions'],
    level: 'org-unit',
    orgUnitSource: 'vehicle',
    rationale:
      'SCOPED, WITH ONE OPEN PRODUCT QUESTION. Allocation postings and depreciation profiles ' +
      'inherit the orgUnitId of the vehicle they charge -- the same rule fuel/expenses/trips/' +
      'maintenance already follow, and the reason orgUnitId is derived from a scoped vehicle ' +
      'lookup on every write rather than accepted from the request body (otherwise a branch ' +
      "manager could post fabricated costs against another branch's vehicle and stamp their own " +
      'scope on them, corrupting that branch\'s cost-per-km with a cost they cannot even see). ' +
      'OPEN QUESTION: tblglsubmissions has no vehicle to inherit from, so its orgUnitId comes ' +
      "from resolveCreationOrgUnitId (the submitter's own assignment). That assumes each branch " +
      'closes its own books. If the customer instead submits ONE consolidated GL figure per ' +
      'account for the whole organization, GL submissions should be organization-level -- a ' +
      'branch-scoped reconciliation report would otherwise compare a branch platform total ' +
      'against a consolidated GL total and show a guaranteed variance that is an artefact of ' +
      'scoping, not a real reconciliation gap. Left confirmed:false until product answers ' +
      'branch-vs-consolidated; surfaced by `npm run tenancy:report`.',
    confirmed: false,
  },

  // ── Registered in the Phase 0 foundation-integrity pass. ───────────
  // 'ai', 'analytics', 'esg' own no collection of their own -- confirmed
  // by grepping for `collectionName =` and any *.repository.ts file
  // under each module directory (none exist). Every read they perform
  // is a call into another module's already-scoped repository/service.
  // Their real scoping question is therefore not "which orgUnitId
  // field do our rows carry" but "does every call site forward the
  // caller's TenantContext instead of dropping it" -- audited
  // individually below, not assumed.
  {
    module: 'ai',
    collections: [],
    level: 'computed',
    rationale:
      'NO OWNED COLLECTION. All five services (fleet-health, driver-risk, ' +
      'predictive-maintenance, fuel-fraud, expense-anomaly) accept an optional TenantContext ' +
      'and narrow every underlying read to it (see each service file and ai.controller.ts, ' +
      'which resolves TenantContext once per request via resolveTenantContext/' +
      'resolveTenantContextWithUser and forwards it into every one of the five). ' +
      'needsAttentionService (also in this module) composes all five plus compliance and ' +
      'maintenance reads the same way, and is additionally covered by this pass\'s ' +
      'AttentionOwnershipResolver for the persisted-row ownership problem (see the ' +
      '\'attention\' entry above) -- that fix lives in the attention module since it concerns ' +
      'attention_items, not a new ai-owned collection. Verified (not assumed) by ' +
      'tests/security/{needs-attention,driver-risk,fuel-fraud,expense-anomaly}-scope.spec.ts, ' +
      'each of which asserts a caller with restricted accessibleOrgUnitIds cannot see another ' +
      'org unit\'s prediction. This module NEVER gates a whole feature on scope being unset ' +
      '(fail-closed default) -- see ai.controller.ts\'s scopedAiUnavailable() helper, kept as ' +
      'the template for the next AI endpoint.',
    confirmed: true,
  },
  {
    module: 'analytics',
    collections: [],
    level: 'computed',
    rationale:
      'NO OWNED COLLECTION. fleetAnalyticsService composes vehicle/expense/fuel/maintenance/trip ' +
      'repository *Stats calls, each already org-unit-scoped via an optional TenantContext ' +
      'parameter, forwarded from analytics.controller.ts\'s single resolveTenantContext() call ' +
      'per request. PHASE 0 FINDING (fixed in this pass, not merely documented): ' +
      'getCostBreakdown()\'s "cost by vehicle" panel called ' +
      'vehicleRepository.getVehicleAnalytics(tenantId, startDate, endDate) WITHOUT the context ' +
      'every sibling call in the same method received -- and getVehicleAnalytics did not even ' +
      'accept an org-unit-scope parameter to begin with, unlike getVehicleStats on the same ' +
      'repository. Net effect before this fix: the per-vehicle cost breakdown on the analytics ' +
      'dashboard returned every vehicle in the tenant regardless of the caller\'s org-unit ' +
      'scope, while the KPI/operational-metrics panels on the same dashboard were correctly ' +
      'scoped -- exactly the "aggregate endpoint forgotten, list endpoint scoped" pattern this ' +
      'registry exists to catch. getVehicleAnalytics now accepts an optional context and ' +
      'applies tenantScopeService.buildFilter the same way getVehicleStats does; ' +
      'getCostBreakdown now forwards it. analyticsScopeService (the "which slice of MY scoped ' +
      'data" concern -- vehicle/driver/branch drill-down) is a separate, correctly-layered ' +
      'concern on top, not a substitute for this authorization-level scoping.',
    confirmed: true,
  },
  {
    module: 'esg',
    collections: [],
    level: 'computed',
    rationale:
      'NO OWNED COLLECTION. esgExportService.buildExport composes fleetHealthService, ' +
      'driverRiskService, and complianceService reads, all forwarded the single TenantContext ' +
      'esg.controller.ts resolves per request. Audited call-by-call: every one of the three ' +
      'underlying reads received `context`; none was found calling through with it dropped ' +
      '(contrast with the analytics finding above). Covered by ' +
      'tests/security/esg-export-scope.spec.ts, which asserts a restricted caller\'s export ' +
      'cannot include a vehicle/driver/compliance record outside their accessible org units.',
    confirmed: true,
  },
];

const BY_MODULE = new Map(MODULE_SCOPE_REGISTRY.map((e) => [e.module, e]));

export function getModuleScope(module: string): ModuleScopeEntry | undefined {
  return BY_MODULE.get(module);
}

/** Modules that must filter reads by the caller's accessible org units. */
export function orgUnitScopedModules(): ModuleScopeEntry[] {
  return MODULE_SCOPE_REGISTRY.filter((e) => e.level === 'org-unit');
}

/** Collections that carry an `orgUnitId` field and are eligible for backfill. */
export function orgUnitScopedCollections(): string[] {
  return orgUnitScopedModules().flatMap((e) => e.collections);
}

/** Decisions still awaiting explicit product sign-off. */
export function unconfirmedDecisions(): ModuleScopeEntry[] {
  return MODULE_SCOPE_REGISTRY.filter((e) => !e.confirmed);
}
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
  | 'org-unit';

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
  /** MongoDB collections this module owns. Used by the backfill + audit tooling. */
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
    ],
    level: 'org-unit',
    orgUnitSource: 'vehicle',
    rationale:
      'GPS traces, speeding alerts and geofence definitions are per-vehicle and inherit ' +
      'the vehicle scope. This is the most sensitive data in the product: it is a ' +
      'movement history of identifiable employees.',
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
      'the source collections.',
    confirmed: false,
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
    collections: ['tblworkflows', 'tblworkflowruns'],
    level: 'organization',
    rationale: 'Automation definitions are organization-level configuration.',
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

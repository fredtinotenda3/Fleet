============================================================
ELITE EXECUTION CONTROL — MANDATORY
You are NOT being asked to merely review this specification.
You are being given authority to ENGINEER the repository toward the
highest-quality production state that the existing architecture can
support.
The specification below is the PRODUCT TARGET.
It is NOT a command to blindly implement every bullet.
The repository is the source of truth.
________________________________________
1.	REPOSITORY-FIRST EXECUTION
________________________________________
Before changing anything:
1.	Inspect the repository structure.
2.	Inspect package.json and every available npm script.
3.	Inspect the database/schema/model layer.
4.	Inspect existing backend modules and route structure.
5.	Inspect existing frontend navigation and page structure.
6.	Trace the existing telemetry → trip → analytics → intelligence
→ attention → action → ledger pipeline.
7.	Inspect existing tests and test infrastructure.
8.	Inspect existing documentation.
9.	Inspect git status and recent commits.
10.	Determine which requirements in this document are already:
COMPLETE
POLISHED
PARTIAL
INCORRECT
BACKEND ONLY
FRONTEND ONLY
INTEGRATION MISSING
TESTING MISSING
PRODUCTION CONFIGURATION MISSING
GENUINELY MISSING
DO NOT implement something merely because this prompt mentions it.
If the repository already solves it correctly:
LEAVE IT ALONE.
If it exists but is incomplete:
EXTEND IT.
If it is defective:
REPAIR IT AT THE CORRECT ARCHITECTURAL LAYER.
If it genuinely does not exist:
IMPLEMENT IT.
________________________________________
2.	EXECUTION PRIORITY
________________________________________
When multiple issues compete for attention, use this priority:
P0 — Security / tenant isolation / data corruption / financial integrity
P1 — Production-breaking bugs / broken critical workflows
P2 — Core fleet operational functionality
P3 — Intelligence / analytics / automation
P4 — Enterprise UX / accessibility / performance
P5 — Secondary modules
P6 — Cosmetic improvements
Never sacrifice a P0/P1 issue to make progress on a P4/P5 feature.
________________________________________
3.	VERTICAL SLICE RULE
________________________________________
Do not implement isolated frontend screens.
A feature is only considered implemented when its required chain is
coherent:
DATA
→ DOMAIN MODEL
→ REPOSITORY
→ SERVICE
→ AUTHORIZATION
→ API
→ VALIDATION
→ FRONTEND
→ LOADING STATE
→ EMPTY STATE
→ ERROR STATE
→ MUTATION
→ AUDITABILITY
→ TESTS
→ PRODUCTION VERIFICATION
If some layers already exist, implement only the missing layers.
Do not duplicate existing services, repositories, APIs, calculation
engines, event systems, telemetry pipelines, ledgers, or UI systems.
________________________________________
4.	NO FALSE COMPLETION
________________________________________
Never say:
"implemented"
when only the UI exists.
Never say:
"working"
when only a mocked response exists.
Never say:
"verified"
without actually running the relevant verification.
Never say:
"production ready"
if a required external dependency, hardware signal, provider API,
environment variable, deployment configuration, or data source is
still missing.
Use precise classifications:
IMPLEMENTED + VERIFIED
IMPLEMENTED + PARTIALLY VERIFIED
IMPLEMENTED + EXTERNAL DEPENDENCY
PARTIAL
BACKEND ONLY
FRONTEND ONLY
BLOCKED BY EXTERNAL DEPENDENCY
NOT APPLICABLE
GENUINELY MISSING
________________________________________
5.	DATA TRUTH
________________________________________
This is an operational intelligence platform.
FALSE PRECISION IS WORSE THAN MISSING DATA.
Every displayed value must have a defensible provenance:
ACTUAL / MEASURED
CALCULATED / DERIVED
ESTIMATED
UNAVAILABLE
NOT APPLICABLE
Never transform:
missing → 0
unknown → normal
stale → live
estimated → actual
unavailable → healthy
missing driver → current driver
missing location → fabricated address
Every important analytical value should be traceable to its source
or calculation.
________________________________________
6.	SECURITY MUST BE TESTED, NOT ASSUMED
________________________________________
For every new or modified feature, explicitly test:
• organization isolation
• branch/org-unit isolation
• forged orgUnitId
• unauthorized read
• unauthorized mutation
• unauthorized export
• privilege escalation
• object ownership
• API-key scope
• role restrictions
• historical-record access
A Harare Branch user must never obtain Bulawayo data.
A client-side filter is NOT authorization.
Server-side scope enforcement is mandatory.
________________________________________
7.	REAL DATA OVER DEMONSTRATION DATA
________________________________________
Never create fake production-looking records simply to make a dashboard
look impressive.
If no real data exists:
show a high-quality empty state explaining what is required.
If a value can only be estimated:
label it ESTIMATED.
If hardware/provider support is required:
implement the safe integration surface where possible and explicitly
document the dependency.
Do not hide missing capability behind fabricated UI.
________________________________________
8.	DON'T OVER-ENGINEER
________________________________________
"Elite" does NOT mean unnecessarily complex.
Prefer:
existing architecture
existing abstractions
existing services
existing repositories
existing event infrastructure
existing calculation logic
existing design system
existing tests
over introducing new frameworks or parallel systems.
Make the smallest architectural change that produces the strongest
correct result.
Refactor only when the existing implementation creates a real
correctness, security, maintainability, or scalability problem.
________________________________________
9.	CONTINUOUS VERIFICATION
________________________________________
After each coherent vertical slice:
1.	Type-check.
2.	Run targeted tests.
3.	Run relevant security tests.
4.	Run integration/E2E tests where available.
5.	Inspect the actual UI.
6.	Test empty/loading/error/stale states.
7.	Test unauthorized access.
8.	Test tenant/org-unit isolation.
9.	Check for regressions.
10.	Continue only after the slice is stable.
Do not accumulate hundreds of unverified changes and hope the final
test run works.
________________________________________
10.	VISUAL QUALITY IS FUNCTIONAL QUALITY
________________________________________
Do not treat the UI as decoration.
The interface must make operational decisions easier.
Every screen should answer:
WHAT IS HAPPENING?
WHAT MATTERS?
WHY DOES IT MATTER?
WHAT SHOULD I DO?
WHAT HAPPENED AFTER I ACTED?
Charts must communicate decisions.
Tables must support investigation.
Alerts must contain evidence.
Empty states must explain what is missing.
Stale states must be obvious.
Unavailable signals must not resemble healthy zero values.
________________________________________
11.	HARDWARE / TELEMATICS REALISM
________________________________________
Where simulated telemetry is used:
the simulator must behave like a real provider,
not like random numbers.
Where real hardware/provider data exists:
use the real signal.
Where hardware does not provide a signal:
show UNAVAILABLE or NOT APPLICABLE.
Never manufacture hardware capability merely because a competitor
supports it.
The product must be provider-agnostic internally.
The customer-facing experience should remain consistent whether the
underlying data originated from EagleTrack, Cartrack, Trakzee, another
provider, or the simulator.
________________________________________
12.	AUTONOMOUS DECISION MAKING
________________________________________
Do not ask me for approval for obvious engineering decisions.
You have authority to:
fix bugs
refactor defective code
add tests
add indexes
add safe migrations
add backfills
improve queries
improve UX
remove dead code
repair broken integrations
add missing validation
improve accessibility
improve observability
improve documentation
Ask only when a decision genuinely requires information that cannot be
determined from the repository or this specification.
________________________________________
13.	WHEN THE SCOPE IS TOO LARGE
________________________________________
Do NOT lower quality simply to finish more bullets.
Instead:
1.	Finish the current vertical slice.
2.	Verify it.
3.	Record exact progress.
4.	Package only verified work.
5.	Continue from the exact stopping point.
Never return a giant partially implemented change and describe it as
complete.
________________________________________
14.	FINAL ENGINEERING QUESTION
________________________________________
Before declaring a delivery complete, ask yourself:
"If I were the fleet manager of a serious Zimbabwean transport,
distribution, agricultural, logistics, mining, or commercial fleet,
would I trust this screen with a real operational decision?"
Then ask:
"If this number were challenged by a finance controller, could I
explain exactly where it came from?"
Then:
"If this user belonged to Harare Branch, could they possibly see
Bulawayo data?"
Then:
"If the telemetry stopped working, would the interface tell the truth?"
Then:
"If an action is recommended, can the user actually act on it and
later verify whether it worked?"
If any answer is NO, the feature is not finished.
________________________________________
15.	DO NOT OPTIMIZE FOR CODE VOLUME
________________________________________
The goal is NOT:
more files
more components
more APIs
more charts
more features
more commits
The goal is:
MORE OPERATIONAL VALUE
MORE DATA TRUTH
MORE SECURITY
MORE CONNECTIVITY
MORE EXPLAINABILITY
MORE RELIABILITY
MORE CUSTOMER TRUST
with the least unnecessary complexity.
============================================================
END — ELITE EXECUTION CONTROL
ELITE MODE — FLEET OPERATING INTELLIGENCE PLATFORM (MASTER PROMPT)
You are continuing development of my existing Fleet Operating Intelligence Platform in this SAME conversation/workspace.
You have: the complete repository, all previous implementation work (Phases 0–7, security hardening, data integrity, worker deployment), the Vehicle Operational Hub mission already scoped, the remaining product-gap list already scoped, the visual-realism / instrument-fidelity requirement already scoped, and previous audits, architectural decisions, security fixes, test results, and design-system work.
DO NOT START OVER. This is an existing, substantially engineered enterprise platform. This prompt is ADDITIVE. It merges every prior instruction set into one so nothing is duplicated or contradicted. The mission: finish, integrate, harden, and elevate the existing product into a complete Fleet Operating Intelligence Platform — informative at a glance, live in real time, safe by alerting, provable by reporting, and deep in every operational domain a fleet actually runs (fuel, driver behavior, cargo temperature, tires, jobs/routes, trailers, loads, inventory, e-locks, engine RPM, PTO, tolls) — while matching best-in-class commercial fleet telematics platforms (the class of product represented by Trakzee/Uffizio, Samsara, Verizon Connect, Geotab) in capability. Trakzee/Uffizio is a reference for what capabilities a serious fleet platform needs — not something to copy visually, structurally, or verbatim. Build our own product, our own UI, our own naming, our own architecture.
You are operating as: Principal Software Engineer · Staff Backend Engineer · Staff Frontend Engineer · Enterprise Architect · Security Engineer · Database Engineer · Distributed Systems Engineer · QA/Test Engineer · DevOps Engineer · Product Engineer · Senior UX/UI Engineer · Fleet-domain Product Strategist (understanding what a fleet manager, dispatcher, workshop lead, finance controller, and executive each need to see and act on).
Think at enterprise production scale.
________________________________________
1.	ABSOLUTE RULES
DO NOT:
• start over, rebuild the platform, or rewrite working architecture unnecessarily
• create duplicate systems, APIs, services, ledgers, telemetry pipelines, trip engines, map systems, workflow engines, AI systems, or authorization systems
• reset the database, destroy existing data, or fabricate data
• invent backend capabilities that already exist
• move authoritative business logic into the frontend
• bypass authorization for convenience, weaken tenant isolation, or silently swallow errors
• replace real values with fake zeros, or mark estimated values as actual
• create placeholder UI and call it complete; create stub modules and call them implemented
• stop after analysis, after creating files, after TypeScript compiles, or after the UI looks acceptable — stop only when the vertical slice is genuinely done and verified
• ask me to perform obvious engineering work myself
• copy Trakzee's (or any competitor's) UI, copy, structure, or branding — it is inspiration for capability coverage only
YOU MAY:
• make substantial changes when justified; refactor poor code when necessary for correctness
• improve existing UX significantly; fix adjacent bugs discovered during implementation
• improve architecture where the existing implementation is genuinely defective
• add tests, indexes, migrations/backfills (safely, dry-run first), remove genuinely dead code
• improve performance, accessibility, and observability
DO NOT BE ARTIFICIALLY LIMITED. Build the highest-quality production implementation the existing architecture can support.
________________________________________
1.	VERIFY BEFORE MODIFYING — THE MOST IMPORTANT RULE
Do not blindly trust this prompt or previous reports. The repository is the source of truth. For every capability, including every new one introduced below:
2.	Locate the existing implementation (backend route, service, repository, frontend page/component, data model).
3.	Trace it end-to-end.
4.	Determine its actual state.
5.	Identify the smallest correct architectural intervention.
6.	Reuse what works. Repair what is defective. Implement what is genuinely missing.
7.	Test it. Verify the resulting UX. Verify authorization and tenant/org-unit boundaries.
Classify each area as: COMPLETE / COMPLETE BUT NEEDS POLISH / PARTIAL / INCORRECT / BACKEND ONLY / FRONTEND ONLY / INTEGRATION MISSING / TESTING MISSING / PRODUCTION CONFIGURATION MISSING / GENUINELY MISSING.
If something is already correct: LEAVE IT ALONE. Do not modify working code merely to show activity.
________________________________________
2.	EXISTING ARCHITECTURE IS THE FOUNDATION
The platform already contains: vehicle management, fuel, trips, maintenance, expenses, work orders, activity timelines, live maps, telemetry, stale-telemetry detection, trip generation, trip playback, reverse geocoding, driver assignment/inheritance, analytics, attention items, workflows, rules, outbox, event processing, Command Centre, dispatch groundwork, AI services, allocation ledger, finance, multi-currency, value ledger, organization/branch/role management, API keys, audit logging, org-unit isolation, provider registry (Cartrack/EagleTrack/mock), workers, observability, and a design system.
VERIFY BEFORE TOUCHING ANY OF THESE. The objective is integration and completion — not architectural duplication. Several new capability areas (fuel, driving behavior, temperature, trailer/load, RPM, PTO) are natural extensions of the existing telemetry/trip/AI pipeline, not new pipelines. Route them through it.
________________________________________
3.	PRODUCT NORTH STAR
The platform must not feel like "a collection of fleet CRUD pages." It must feel like a Fleet Operating Intelligence Platform — one where every domain (fuel, behavior, cargo condition, tires, jobs, trailers, loads, inventory, security, engine health, tolls) feeds the same loop:
Operational Truth → Financial Truth → Telematics → Canonical Data → Events → Rules/Automation → AI Intelligence → Attention/Opportunity → Decision → Action → Operations → Outcome Verification → Value Realized
Every capability area should strengthen this loop, not sit beside it as an isolated widget.
________________________________________
4.	PRIMARY MISSION — VEHICLE OPERATIONAL HUB
The Vehicle Details / Vehicle Operational Hub is the flagship screen and top implementation priority. It represents one vehicle as an operational entity. A fleet manager should open one vehicle and understand its complete operational story without jumping through disconnected modules. The page must answer:
NOW — Where is it? Is it moving/tracking? Who is driving? Is telemetry fresh? What events (speeding, braking, driver score) are happening? Do forms auto-fill known fields (fuel type, assigned driver) instead of asking the user to re-enter them?
TODAY — Trips, distance, duration, fuel, cost, incidents, anomalies?
PERIOD — Utilization trend, fuel efficiency trend, cost trend, maintenance consumed, improving or deteriorating?
HISTORY — What trips occurred, where, who drove, what happened, what did it cost?
INTELLIGENCE — Is something abnormal, why, what evidence, what action is recommended, what happened after action?
4.1 Live State
Integrate a vehicle-scoped map into Vehicle Details (only the selected vehicle, never the fleet). Show position, coordinates, address, speed, heading, ignition, odometer, provider, telemetry timestamp, tracking status. Clearly distinguish Live / Recently updated / Stale / Last known / No telemetry / Not tracked / Unavailable. Never fabricate coordinates, addresses, or speed; never convert missing telemetry into zero; never present stale data as live. Reuse existing telemetry/staleness infrastructure — no second pipeline.
4.2 Trip Generation Correctness
Verify (don't blindly replace) the existing engine's handling of: ignition, movement, GPS validity, timestamp continuity, telemetry gaps, duplicate telemetry, idempotency, overlapping/partial trips. Ignition-ON-while-stationary must not silently become a misleading trip.
4.3 Trip Location Enrichment
Coordinates are authoritative; address is enrichment. Flow: Telemetry → Trip Generation → Start/End Coordinates → Async Geocoding → Cached Address → Display. Never block ingestion on geocoding; never fabricate an address; if geocoding fails, keep the trip and coordinates, mark address unresolved.
4.4 Driver Inheritance
Current vehicle assignment is the source of truth for new records (fuel, trips, expenses, work orders, etc.), auto-filled in forms. Historical records must never be rewritten when assignment changes. Enforce override authorization server-side; never trust client-supplied ownership.
4.5 Trip Fuel Intelligence
Provenance-ranked: measured provider consumption → telemetry fuel delta → validated consumption model → distance × configured rate. Label every value ACTUAL/MEASURED / CALCULATED / ESTIMATED / UNAVAILABLE. Never silently upgrade a calculation to "actual"; never show fake zero.
4.6 Fuel/Trip Reconciliation
Vehicle-level block with Today/7d/30d/Custom ranges: trip count, distance, fuel used, fuel purchased, spend, efficiency, cost/km, expected consumption, variance. Surface fuel anomaly/fraud/expense-anomaly signals via the existing AI/evidence architecture — do not invent new anomaly logic. Track live fuel levels, detect sudden drains and monitor idling
4.7 Vehicle Analytics
Range selector (Today/7d/30d/Custom). Metrics where supported: trips, distance, driving/idle time, idling cost, fuel used/cost, expenses, maintenance cost, total operating cost, cost/km, efficiency, average trip distance/duration, overspeed, harsh events, utilization, downtime. Distinguish 0 from no data/unavailable.
4.8 Trend Intelligence
Daily/weekly/monthly charts (distance, trips, fuel, fuel cost, total cost, cost/km, efficiency, utilization) that answer real questions (is usage rising/falling, is efficiency deteriorating, is cost/km increasing) — never decorative.
4.9 Trip History
Table (date, origin, destination, driver, times, duration, distance, fuel, fuel cost, cost/km, status, anomaly indicator). Selecting a row reuses the existing Trip Detail/Playback — no second trip-detail architecture.
4.10 Trip Playback
Reuse existing playback: route, markers, scrubber, play/pause/restart, 0.5×–4× speed, start/end markers, ignition/odometer/address sync. Strictly vehicle-scoped — never load fleet-wide telemetry.
4.11 Operational Header
Real-time header: name, registration, type, operational state, driver, location, speed, odometer, today's trips/distance/fuel/cost, telemetry freshness, tracking health — understandable in seconds.
4.12 Timeline
Extend the existing six-source timeline only where real events exist: ignition ON/OFF, trip start/end, fuel purchase, driver assignment/unassignment, alert/resolution, maintenance, work order, expense, AI finding. Never fabricate events; maintain correct chronology.
4.13 Cost Intelligence
Use the existing allocation ledger/finance architecture (never a parallel calculation engine): fuel, maintenance, expense, work-order, and other operating cost; total cost; cost/km; cost/trip; fuel cost/km; daily/weekly/monthly averages.
4.14 Trip-Level Cost & Fuel Detail
• Cost per trip and cost/km shown on trip list and trip detail; total trip cost for a period.
• Trip cost charts: cost per trip, cost/km trend, most/least expensive trips, cost distribution.
• Estimated fuel cost per trip when actual is unavailable, clearly labelled ESTIMATED, using the existing consumption model.
• Per-trip fuel reconciliation: fuel taken (fuel logs) vs fuel used (telemetry, where reliable) vs fuel expected (distance × rate), with variance flagged via existing intelligence services. Label ACTUAL/CALCULATED/ESTIMATED/UNAVAILABLE.
4.15 Command Centre Actions on Vehicle Detail
Surface vehicle-specific attention items on Vehicle Detail; allow dispatch/resolve actions inline where permissions allow.
4.15 Avoid Data Duplication when entry, if data already entered it must say d
Already exist not duplicate data
________________________________________
5.	VISUAL INSTRUMENT FIDELITY — REALISM REQUIREMENT
A realistic simulator emitting signals through the canonical TelematicsProvider interface is not sufficient on its own — the interface must look and behave like real telematics hardware and real fleet software. A user should not be able to tell from the screen alone whether data came from Cartrack, EagleTrack, or the simulator.
5.1 Visual Instrument Fidelity
• Speedometer/tachometer: round gauges with tick marks, numbered scale, redline zone (tach), an eased/momentum-based needle (never snapping per poll), digital centre readout, correct unit labels (km/h, RPM ×1000).
• Fuel/coolant/battery: radial or bar gauges with correctly coloured low/high warning zones (red low fuel, red hot coolant, amber low voltage) and a visible warning light in the danger zone.
• Odometer/tripmeter/engine hours: seven-segment digital readouts, not plain text.
• Warning light cluster: standard ISO symbols (check engine, oil, battery, coolant, ABS, TPMS, seatbelt, door, DPF, DEF) — dim when off, lit when active, flashing when critical.
• Gear indicator: P R N D + numbered gears, active gear highlighted.
• TPMS: 4-wheel layout, per-wheel pressure + temp, green/amber/red.
5.2 Live Behaviour
• Client-side interpolation at 10–20 Hz between the last two server ticks plus the simulator's rate-of-change — this is what makes it look real, not just accurate.
• Needle momentum: fast rise, slight overshoot, settle.
• Fuel moves slowly and monotonically except at refuel; coolant climbs on cold start, plateaus, drops after stop; voltage dips on crank, recovers, holds ~14.4V running.
• Warning lights follow real logic (e.g., oil light ON only when engine running AND pressure < 1 bar) — never randomly toggled.
• Ignition state drives everything: off = gauges dead, accessory = battery only, run = all live, start = crank dip.
• Connection state is honest: LIVE / STALE / OFFLINE / NO DATA with distinct visual treatment, respecting (never bypassing) existing staleness detection.
5.3 Vehicle Marker on Map
Vehicle-shaped icon rotated to heading, showing speed/ignition/heading cone, animating smoothly along the route (never teleporting). Popup shows a mini live telemetry strip (speed, RPM, fuel, coolant, battery, last update, provider).
5.4 State Coverage (applies to gauges, charts, trip fuel, cost blocks, live map header)
• ACTUAL — live data, green accent, "LIVE" pill
• CALCULATED — derived, blue accent, "DERIVED" pill + tooltip with formula
• ESTIMATED — modelled, amber accent, "ESTIMATED" pill + tooltip with confidence
• UNAVAILABLE — grey, dashed gauge, "NO DATA" pill — never a fake zero
5.5 Vehicle Class Profiles
Simulation/gauge profiles for at least sedan, SUV/pickup, light truck, heavy truck, bus, van, EV — each defining gauge ranges (max speed, redline RPM, tank size, temp range, voltage range), acceleration envelope, idle behaviour, warning thresholds, and consumption curve. Gauges scale to the profile (a heavy truck tach ≠ a sedan tach). EVs show SoC + power flow instead of a tachometer — no RPM signal rendered anywhere for EV profiles.
5.6 Where This Lands
Vehicle Details (full cluster + live strip) · Live Map (animated markers + popup telemetry) · Trip Playback (gauges replay in sync with the scrubber) · Driver Scorecard (harsh-event markers on timeline) · Operational Dashboard (simulator shown alongside Cartrack/EagleTrack with identical UI treatment) · Fuel reconciliation block (refuel events plotted on the fuel gauge).
5.7 Hard Rules
Never stub a gauge (missing signal → UNAVAILABLE state, not a needle at zero). Never hardcode a fake number — every value traces to a provider tick, a calculation, or a labelled estimate. Never bypass staleness detection to fake liveness. Reuse frontend/shared/ui/patterns/ and the existing Tailwind v4 theme — do not rebuild the design system. Preserve tenancy/org-unit isolation for the simulator like any other provider. Preserve ACTUAL/CALCULATED/ESTIMATED/UNAVAILABLE in the UI, not just the backend.
5.8 Acceptance Tests To Add
• Ignition=run → speedometer needle animates between ticks (no snapping).
• Ignition=off → all gauges dead, marker shows OFFLINE.
• Stale provider tick (> threshold) → gauges show STALE, value freezes with a visible stale overlay.
• Missing coolant signal → coolant gauge shows UNAVAILABLE, not zero.
• Refuel event → fuel gauge animates upward, refuel marker appears on the timeline.
• Cold start → coolant climbs from ambient to operating temp over the expected window.
• Cranking event → voltage dips then recovers.
• EV profile → tachometer replaced by SoC + power flow; no RPM signal anywhere.
________________________________________
6.	FLEET-WIDE ANALYTICS
Every item below must exist both as a fleet-wide view (all vehicles in the caller's scope) and, where meaningful, as a vehicle-scoped view on Vehicle Detail. Where the vehicle-scoped version doesn't make sense, omit it and say why.
7.	Distance over time — line chart, daily/weekly/monthly; surfaces peak days, low-utilization days, sudden drops.
8.	Distance by vehicle — ranked horizontal bar; most/least used; idle vehicles.
9.	Distance by driver — horizontal bar; workload distribution (note distance ≠ performance).
10.	Distance by route — horizontal bar + table; most-used routes.
11.	Mode distribution — delivery/collection/empty/personal/maintenance/other; productive vs non-productive share.
12.	Vehicle × Mode analysis — distance by mode per vehicle; exposes non-productive movement.
13.	Driver × Vehicle analysis — which driver operates which vehicle; frequent switching.
14.	Route frequency — trips per route (count basis for route optimization).
15.	Vehicle activity frequency — trips vs distance per vehicle.
16.	Average distance per trip — by vehicle, driver, route, mode, date.
17.	Fleet utilization intelligence — heavily vs barely used vehicles, using existing thresholds only.
18.	Driver workload intelligence — workload distribution, explicitly not conflated with performance.
19.	Route concentration intelligence — % of total distance per route.
20.	Non-productive movement intelligence — empty/non-revenue movement share.
21.	Operational anomaly detection — reuse existing anomaly/fraud services; do not invent new thresholds.
22.	Comparison views — vehicle vs fleet average, driver vs fleet average, route vs fleet average.
________________________________________
7.	REMAINING PRODUCT MODULES (VERIFY → COMPLETE, DO NOT STUB)
Audit each against the current repository first; implement only what is genuinely missing/incomplete.
• Compliance UI — records, subject (vehicle/driver), expiry, status, renewal, expiring-soon/expired, filters, search, detail, permissions, org-unit scope.
• Dispatch UI — board, create job, assign vehicle+driver, status flow (unassigned → assigned → en_route → in_progress → completed), map of active jobs, history with cost/duration, links to trips/work orders/drivers/vehicles.
• Inventory UI (parts/consumables) — search/filter/pagination, stock levels, reorder thresholds, stock movements, receipts, adjustments, consumption linkage into work orders. (Distinct from the device/hardware inventory scope in §10.11 — resolve which the existing /api/inventory/* routes cover before building.)
• Procurement UI — requests, creation/editing, approval/rejection, purchase orders, receiving, vendor relationship, approval permissions.
• Vendors UI — directory, create/edit, contacts, tax info (if backed), contract info, linked POs/expenses.
• Document storage — upload, metadata, preview, download, deletion, categorization, expiry, search, for vehicles/drivers/work orders/compliance; strict tenant/org-unit isolation; no unrestricted object-storage paths.
• Self-service signup — registration, org initialization, owner creation, verification (if supported), rate limiting/abuse protection, secure password handling, audit logging.
• Email invitation redemption — invitation → email → secure token → acceptance → account → org → org-unit → role → audit; handle expired/invalid/used/revoked/malformed; reuse existing email service.
• Vehicle bulk import UI — CSV/XLSX upload, downloadable template, field mapping, preview, row validation, duplicate detection, dry run, confirmation, import + failure reports; no authorization bypass, no org-unit escalation, no partial data corruption.
• GL reconciliation UI — submissions, history, ledger comparison, discrepancy inspection, permitted reversal/correction; no accounting logic solely in the frontend.
• Depreciation UI — profiles, methods, useful life, asset assignment, schedules, accumulated depreciation, current value, period posting, financial impact; reuse existing financial logic.
• Executive dashboard upgrades — range selector (Today/7d/30d/Quarter/Year/YTD/Custom), CSV/PDF export, print view; never fabricate revenue/profitability if the backend contract doesn't exist — document the gap instead.
________________________________________
8.	FUEL DATA QUALITY
Normalize fuel type on write to canonical petrol | diesel | electric | hybrid, case/typo-tolerant on input (existing data has variants like Petrol, petrol, Diesel, diseal). Add a one-off migration for existing rows. Display always canonical. Add tests. Must be complete before any fuel report ships (§10.4).
________________________________________
9.	BACKEND CORRECTNESS SWEEP
Fix at the correct architectural layer — do not work around.
10.	Fail-open tenancy — loadInScope* fails open on rows with no orgUnitId. Backfill legitimate historical ownership first (dry-run, verify), then enforce fail-closed.
11.	BaseRepository._id type lie — ~20 call sites; migrate with correct MongoDB identifier typing, no indiscriminate any/unsafe casts.
12.	Allocation ledger period semantics — two conflicting definitions; standardize on one canonical rule across list and totals; update implementation, tests, docs, UI.
13.	Historical costs don't re-post into the ledger — idempotent backfill script (dry-run default), never duplicate entries.
14.	Fleet Health hardcoded benchmarks (10 km/L, $200/expense, averageDowntime: 5) — replace with org config / vehicle-type / historical baseline / configurable benchmark, or document as a deliberate default. Never present an arbitrary benchmark as measured truth.
15.	WebSocket layer unconsumed — wire the emit sites or remove them; no silent no-op.
16.	~90 orphaned API routes — route or delete; no dangling code.
17.	Sentry error monitoring non-functional — fix or document.
18.	23 pre-existing lint errors — resolve.
________________________________________
10.	PART R — FULL TELEMATICS INTELLIGENCE SUITE (TRAKZEE-CLASS CAPABILITY COVERAGE)
For each of the sixteen areas: audit what exists → classify state → complete missing layers → wire into the existing pipeline → surface the stated insights → deliver the stated benefit → add tests.
Every area inherits, without exception: tenant/org-unit isolation, server-side authorization, fail-closed behavior, and the ACTUAL / CALCULATED / ESTIMATED / UNAVAILABLE rule. No fabricated values anywhere.
For every area, also determine and document where it lands: (a) Dashboard widget, (b) Vehicle Operational Hub block, (c) Fleet-wide analytics page, (d) Live Tracking side-panel, (e) Dedicated report category, (f) Alert rule in the existing alert engine. Most areas need several, not just one.
R.0 — Informative Dashboard
Widget-based command-centre summary: fleet status counts/%, idle time + estimated idling fuel waste, refill/drain totals, fuel-vs-distance trend, maintenance due/overdue, toll cost-to-date, job/task completion, alert-type category tiles (overspeed, geofence exit, AC misuse, stay-away/stay-in zone, temperature). Drag/drop reordering and per-user widget selection (persisted per user). Expandable widgets open underlying detail. Role-differentiated composition via existing RBAC/org-unit rules. Every widget traces to a real query — empty state, never a fake zero.
R.1 — Live Tracking (fleet-wide)
Fleet-wide live map: heading-rotated markers, smooth interpolated movement (reuse Vehicle Hub animation approach), always-visible running/idle/stopped/inactive/no-data counts. Customizable control panel: multiple layouts, reorderable side-panel widgets, searchable/filterable/groupable object list. Per-vehicle popup/side-panel: telemetry strip (speed, ignition, driver, current trip distance, work hours, location/address, today's activity) + direct actions (share, view, message driver, navigate, geofence). Hardware signal strip (fuel, temp, tire, e-lock, RPM, PTO) at-a-glance without navigating away. Playback entry point reusing the existing component.
R.2 — Critical Alert Notification
One alert engine reused by every domain (fuel, behavior, temperature, tire, trailer, e-lock, RPM, PTO, toll, geofence) — extend the existing rule engine's (RuleActionRegistry) condition vocabulary rather than building parallel logic. Per-type config: severity, delivery channel(s) (SMS/email/push/in-app; IVR/voice or social-API only if already integrated/authorized — otherwise report as a missing dependency). Time-window config (e.g., "stay away from zone" outside business hours). Priority-based notification center for triage. Every alert carries an evidence pointer back to the record/telemetry tick (reuse existing AI evidence envelope) — never a bare notification.
R.3 — Detailed Reports
Confirm/extend report categories for: vehicle activity, fuel, driver behavior, temperature, tire/TPMS, trailer, load, jobs/routes, RPM, PTO, toll, e-lock, expenses, geofence/zone events, video telematics (if applicable) — each a real category, not a one-off export. Two-layer reports (summary + drill-down). Scheduling (recurring generation/delivery; confirm scheduled-report re-save issue is resolved). Exports: PDF/XLS/CSV, mobile-friendly rendering. Every report reads from the same authoritative source as its dashboard/analytics counterpart — no drift-prone parallel calculation.
R.4 — Fuel Monitoring
Live fuel level + sudden-drain detection on the Live Tracking panel (R.1), not only the Vehicle Hub. Dashboard widgets: fuel-vs-distance trend, refill/drain totals, idling fuel-waste estimate (labelled ESTIMATED with method shown). Fleet-wide fuel reports for cost control / theft detection, built on the same reconciliation logic as the vehicle-scoped block. Real-time alerts (via R.2) for refuel/drain/abnormal-idling-with-fuel-loss. Fuel-type normalization (§8) complete before any fuel report ships.
R.5 — Driving Behavior Monitoring
Verify existing driver-risk AI service / Driver Scorecard before building anything new. Real-time detection: harsh braking, harsh accel/cornering, overspeeding, excessive idling, distracted-driving where hardware supports it — reuse existing event/rule infrastructure. Driver scorecards with a clear scoring methodology (confirm/define RAG banding). Violation trend analysis (fleet-wide and per-driver). Configurable alert thresholds per violation type via R.2. Harsh-event markers confirmed wired into the Driver Scorecard timeline and Trip Playback.
R.6 — Temperature Monitoring
Cargo-condition monitoring (cold chain, food/beverage, pharma) — distinct from engine coolant (instrument cluster). Real-time temp/humidity on Live Tracking per vehicle/trailer. Historical playback synced to trip/job timeline (post-hoc cold-chain reconstruction). Dedicated dashboard/report: fluctuation trends, breach counts, duration-out-of-range. Configurable safe-range thresholds per cargo type; severity-scaled deviation alerts via R.2. No sensor → UNAVAILABLE, never assumed ambient.
R.7 — Tire Management (and TPMS)
Cross-reference the instrument-cluster TPMS work (4-wheel, per-wheel pressure/temp, color-coded) — this section is the operational/inventory layer around that signal. Tire stock/inventory: levels, locations, inspection history per tire, linked to vehicles. Lifecycle ops: repairs, rotations, replacements, scheduled inspections, wear/cracking flags. Live per-wheel pressure/temp (reuse TPMS signal, no re-ingestion). Alerts (via R.2) for low pressure/overheating/overdue maintenance. Tire cost/replacement events flow into the existing maintenance/work-order and cost-intelligence pipeline.
R.8 — Jobs and Route Optimization
Cross-reference Dispatch UI (§7) — this is the optimization intelligence layered on it, not a second dispatch system. Job allocation from real known constraints (availability, location, priority) — no invented data. Route generation from distance/time and job urgency; traffic factored only if a real routing/traffic provider is integrated, otherwise labelled distance/time-based and the gap reported. Live job/route tracking integrated with existing trip-generation/telemetry (a job's path traces to real trip data). Dynamic re-planning on change/deviation. Alerts (via R.2) for delayed start/end and route deviation beyond tolerance. Job history with linked cost/duration feeding the same allocation ledger.
R.9 — Trailer Management
Trailer as a first-class trackable entity: allocation to a towing vehicle, grouping (type/capacity/location), independent live-location when detached. Usage analytics: utilization trends, idle-trailer detection, scheduling insight. Critical alerts (via R.2) for disconnection, low device battery, pressure-sensor drops. History linked to jobs/trips (R.8). No hardware → "not tracked," never inheriting the towing vehicle's GPS as if it were the trailer's own.
R.10 — Load Monitoring
Real-time load weight/distribution on Live Tracking, sourced from actual load-sensor telemetry (never estimated from vehicle class and presented as measured). Overload/underload detection against configured limits per vehicle/axle where supported. Load analytics for capacity planning. Compliance checks against configured weight regulations, with pre-departure alerts (via R.2) where feasible. No sensor → UNAVAILABLE per vehicle, never silently omitted (an omission reads as "always fine").
R.11 — Inventory Management
Two distinct things can hide under this name — resolve which apply, do not conflate:
11.	Tracking-device/hardware inventory (GPS units, sensors, e-locks, SIMs — stock, allocation, sale, renewal, subscription).
12.	Workshop parts/consumables inventory (§7).
Audit which the existing /api/inventory/* routes / read-only slice actually cover; complete the missing UI for that specific scope. Device/hardware scope: stock/allocation of trackers/sensors/e-locks, sold/active/available status, renewal/subscription-billing visibility, sync so a device swap or SIM expiry doesn't silently kill telemetry. Parts scope: complete search/filter/pagination, stock levels, reorder thresholds, movements, receipts, consumption-into-work-orders. Either way: inventory changes affecting trackability raise a data-quality/attention item on the vehicle, never fail silently into "no telemetry."
R.12 — Elock Monitoring
E-lock as a trackable entity with linked sub-locks (multiple hatches/valves) configured individually. Live status on Live Tracking: lock/unlock state, signal strength, battery, active violations. Secure unlock event logging (who/when/where, GPS-stamped) reusing existing audit-log infrastructure. Alerts (via R.2) for unauthorized access, tampering, low battery. Org-unit/tenant isolation exactly as everywhere else.
R.13 — RPM Monitoring
Distinct from the tachometer gauge widget (a display concern) — this is the analytics/alerting layer on the same signal. RPM-band classification configurable per vehicle-class profile (reuse the profiles from §5.5). Real-time flagging of inefficient operation (over-revving) as it happens. Configurable thresholds per fleet/vehicle-type. Reports connecting RPM trends to fuel efficiency/vehicle health. EV profiles: RPM is not applicable (distinct from UNAVAILABLE), consistent with §5.5/5.8.
R.14 — PTO (Power Take-Off) Monitoring
Real-time activation/deactivation detection, timestamped, from CAN-bus data where available — report the gap rather than inferring PTO state from unrelated signals. Usage-duration tracking per trip/job. Connect PTO usage to fuel consumption/idle time via the same fuel-reconciliation logic as R.4, not a separate calculation. PTO usage report category (R.3). Applies only to relevant vehicle classes/profiles — no PTO widget for a sedan.
R.15 — Toll Management
Toll charges surfaced in Trip Playback for the relevant trip (confirm any existing dashboard tile is real, not placeholder). Toll report category (R.3): expenses, distance, transaction history. RBAC-consistent access control on toll/financial visibility. Toll data reconciled into the existing expense-tracking and allocation-ledger pipeline (never an orphaned number). No toll-data provider yet → report as a missing external dependency, never fabricate amounts.
________________________________________
11.	CROSS-CUTTING RULES FOR PART R
• One alert engine — R.2 through R.15 are all configurations on the existing rule engine, never bespoke notifiers.
• One ledger — every cost across R.4, R.7, R.8, R.9, R.10, R.13, R.14, R.15 flows into the existing allocation ledger/cost-intelligence blocks.
• One telemetry pipeline — every live signal is ingested through the canonical TelematicsProvider interface and existing staleness detection.
• One trip/job engine — route/job/trailer tracking reuse existing trip-generation and playback infrastructure.
• Vehicle-class awareness — RPM, PTO, tire/TPMS, and load are only meaningful for certain classes; say so explicitly rather than rendering a meaningless widget.
• Data truth is non-negotiable — ACTUAL/CALCULATED/ESTIMATED/UNAVAILABLE (or "not applicable" for the vehicle-class case) applies with no exceptions.
• Tenant/org-unit isolation is non-negotiable — every new report, alert, widget, and log must be proven not to leak across branches, with regression tests matching the existing cross-tenant suite.
________________________________________
12.	GLOBAL STANDARDS — SECURITY, DATA TRUTH, PERFORMANCE, UI/UX, ACCESSIBILITY, TESTING, PRODUCTION READINESS
These apply to everything in this document, including Part R.
12.1 Security — Zero Regression
Preserve authentication, authorization, tenant/organization/branch/org-unit isolation, RBAC (and ABAC where applicable), object/write ownership, API key restrictions, and auditability across every feature — vehicle, trip, playback, analytics, fuel, expenses, maintenance, work orders, compliance, inventory, procurement, vendors, documents, exports, reports, and every Part R domain. A Harare Branch user must never obtain Bulawayo data through any of them. Client-side filtering is not security — the server enforces the boundary.
12.2 Data Truth (Absolute)
Never fabricate GPS, address, speed, odometer, fuel, driver, trip, cost, revenue, utilization, analytics, AI confidence, temperature, tire pressure, load weight, RPM, PTO state, toll amount, or lock status. Every value is MEASURED/ACTUAL, DERIVED/CALCULATED, ESTIMATED, or UNAVAILABLE (or "not applicable" where a vehicle class makes a feature moot). Unknown is preferable to false precision.
12.3 Performance
No N+1 queries, no fleet-wide queries for vehicle-scoped screens, no unbounded telemetry pulls, no repeated geocoding, no giant API responses just because a page needs many pieces of data. Use existing indexes/aggregation/caching/pagination/workers/rollups/event infrastructure. Only add new indexes based on actual query patterns.
12.4 UI/UX — Premium Enterprise Bar
The product must feel intentional, sophisticated, fast, calm, trustworthy, and operationally focused — not a generic admin template, and not a Trakzee clone. Use and extend the existing design system (frontend/shared/ui/patterns/, Tailwind v4 theme) rather than introducing visual inconsistency. Pay attention to typography, hierarchy, spacing, density, contrast, tables, charts, filters, navigation, interaction states, and every empty/loading/error/stale/unavailable state. Avoid: endless stacked cards, gratuitous gradients, decorative charts, random icons, crammed tables, placeholder copy, purposeless animation, everything-as-a-modal.
12.5 Accessibility
Keyboard navigation, focus visibility, semantic controls/labels, accessible dialogs, table semantics, color contrast, color-independent status indicators (critical for tire/load/e-lock/temperature color coding), screen-reader-friendly states, responsive behavior — never sacrificed for visual polish.
12.6 Testing
Every meaningful change gets regression coverage of actual business behavior, including: cross-tenant/cross-branch access, forged orgUnitId, unauthorized vehicle/trip/playback/export/mutation, privilege escalation; telemetry/stale/no-telemetry states; driver inheritance and historical preservation; trip generation edge cases; fuel provenance states (measured/calculated/estimated/unavailable) and reconciliation/anomaly cases; geocoding success/failure/rate-limit/cache; ledger allocation/idempotency/reconciliation/historical costs/depreciation; import validation/duplicates/dry-run/failure/authorization; document upload/access/download/deletion/cross-tenant denial; and, per Part R domain, signal-truth tests (actual/calculated/estimated/unavailable/not-applicable), alert-firing tests, and reconciliation tests where the ledger is touched. Where safe, re-inject known historical defects and confirm the test fails without the fix.
Where infrastructure permits: real HTTP E2E against a running app (login, authenticated request, authorization, real vehicle/trip/dashboard request, mutation), real MongoDB integration (not mocks claimed as real), and security regression re-injecting known historical vulnerabilities.
12.7 Verification
Inspect package.json and existing scripts first; run the repository's actual commands (typecheck, lint, unit/integration/security/E2E/performance tests, build). Do not invent scripts. Do not claim success that didn't happen. Fix failures caused by your changes; never weaken tests to force green CI.
12.8 Production Readiness
Verify Vercel/Railway config, workers, cron, secrets, provider credentials, indexes (including TTL), finance backfill, scheduled reports, monitoring, backups, and environment configuration where relevant. Treat any credential exposed in chat/history as compromised and rotate through the appropriate secure mechanism. Never print secrets.
________________________________________
13.	DEAD CODE / DUPLICATION
Inspect known candidates: AnalyticsOverview.tsx, ReportPreview.tsx, the /observability/operational route, the unconsumed WebSocket layer, any duplicate Action Engine implementations, ~90 orphaned API routes, silent integrations. For each: determine actively-used / indirectly-used / intentionally-retained / deprecated / dead / duplicate — then wire it, consolidate it, deprecate it, or remove it. Trace actual usage before deleting; never delete based purely on filename.
________________________________________
14.	IMPLEMENTATION WAVES
Work in coherent vertical slices, in this order. Do not jump randomly between modules. If context/tool limits prevent completion in one turn, continue from the exact current state next turn rather than restarting.
15.	Wave 1 — Vehicle Operational Hub (§4), including instrument-cluster visual fidelity (§5).
16.	Wave 2 — Informative Dashboard (R.0) + fleet-wide Live Tracking (R.1) + Critical Alert engine unification (R.2) — later domains depend on these.
17.	Wave 3 — Detailed Reports framework (R.3), extended to accept every domain's report category as it's built.
18.	Wave 4 — Fuel Monitoring completion (R.4, ties to §4/§8) + Driving Behavior Monitoring (R.5).
19.	Wave 5 — Temperature Monitoring (R.6) + Tire Management/TPMS (R.7).
20.	Wave 6 — Jobs & Route Optimization (R.8) + Trailer Management (R.9) + Load Monitoring (R.10).
21.	Wave 7 — Inventory Management (R.11, scope-resolved) + Elock Monitoring (R.12).
22.	Wave 8 — RPM Monitoring (R.13) + PTO Monitoring (R.14) + Toll Management (R.15).
23.	Wave 9 — Fleet-Wide Analytics (§6) if not already folded into Waves 1–3.
24.	Wave 10 — Remaining product modules (§7: Compliance, Dispatch, Inventory-parts, Procurement, Vendors, Documents, Signup, Invitations, Bulk Import, GL Reconciliation, Depreciation, Executive Dashboard).
25.	Wave 11 — Backend correctness sweep (§9), dead-code decisions (§13), non-functional/production hardening (§12.8).
26.	Wave 12 — Full regression pass, cross-tenant re-verification across all sixteen Part R domains, final acceptance audit.
________________________________________
15.	DELIVERY RULE
If the work exceeds what can be completed and verified in one turn, split into multiple ZIPs by wave (e.g., Fleet-part-1.zip = Waves 1–3, Fleet-part-2.zip = Waves 4–6, and so on). Do not return a ZIP with unverified sections. Do not stub any module in §7 or Part R — if a module genuinely cannot be completed (missing hardware/provider/data contract), report it as deferred with the exact dependency required, and note what safe partial implementation exists in the meantime.
________________________________________
16.	VERIFICATION AND REPORTING
Report honestly, covering both the Vehicle Hub/product-gap work and every Part R domain (R.0–R.15):
17.	What already existed vs what was added
18.	Backend / frontend / schema changes, by domain
19.	Fuel normalization, trip cost, and fuel reconciliation changes
20.	Fleet-wide and vehicle-scoped analytics changes
21.	Playback changes
22.	Which alert types were wired into the shared rule engine
23.	Which costs were reconciled into the shared ledger
24.	Security changes
25.	Tests added, including cross-tenant and data-truth tests, per domain
26.	Verification results (actual command output, not claims)
27.	Remaining limitations per domain, and whether each is a backend limitation, hardware/provider limitation, missing data, external service dependency, or deliberate product decision — and, where a domain doesn't apply to certain vehicle classes, say so explicitly
Also include a section titled "VISUAL FIDELITY — WHAT A USER SEES" describing, screen by screen, what the user sees and why it looks like real hardware, plus manual verification steps: open Vehicle Details with one simulated vehicle, confirm needle animation, confirm warning-light logic, confirm STALE by killing the simulator feed, confirm UNAVAILABLE by removing a signal.
Do not claim completion where verification does not support it.
________________________________________
17.	DEFINITION OF DONE
A feature is not complete because a page/component/API exists, TypeScript compiles, a button exists, mocked data appears, or the happy path works. A feature is complete only when the chain is coherent:
Database → Domain → Service → Authorization → API → Validation → Frontend → Loading → Empty → Error → Mutation → Auditability → Testing → Production behavior
For features where some layers already exist, complete only the missing layers.
________________________________________
18.	FINAL ACCEPTANCE STANDARD
The platform should credibly support, for each role, without leaving the platform:
• Fleet Manager — monitor fleet, inspect vehicles, see live/last state and driver, inspect/replay trips, understand and reconcile fuel, understand costs, inspect maintenance/compliance, investigate anomalies, resolve attention items, understand trends.
• Workshop — manage work orders, consume parts, record labour, understand maintenance cost, manage inventory.
• Finance — understand operating cost, inspect allocations, reconcile GL, understand depreciation, analyze cost/km.
• Management — understand fleet health, identify problems and opportunities, understand financial impact, take action, verify outcomes, understand value realized.
• Administrator — manage organizations, branches, users, roles, permissions, API keys, audit logs, operational configuration.
And, for every one of the sixteen Part R domains, a user should be able to answer without leaving the platform: What's happening right now (fleet-wide and per vehicle)? What happened today/this period, with honest gaps? Is anything abnormal, and what's the evidence? What did it cost, and does it show up in the total cost picture? Can I get a report of this for an outside stakeholder?
All while preserving strict tenant and org-unit isolation.
The standard: when a manager opens the Informative Dashboard or the Vehicle Operational Hub, across any domain, they should not think "where do I find this?" — they should think "I understand this."
________________________________________
19.	FINAL EXECUTION INSTRUCTION
Start NOW.
20.	Inspect the current repository and compare it against this full mission, including every Part R domain.
21.	Produce a concise gap assessment covering the Vehicle Hub, the remaining product modules, and each Part R domain.
22.	Start with Wave 1 (Vehicle Operational Hub, including visual instrument fidelity) if not already complete; otherwise proceed to the next incomplete wave in order.
23.	Implement complete vertical slices. Run verification continuously.
24.	Continue through the remaining waves without waiting for approval after every obvious decision.
25.	Do not stop merely because one portion is complete — continue until the current delivery boundary is genuinely complete and verified, then report per §16.
________________________________________
ULTIMATE PRINCIPLE
Optimize for security, data truth, correctness, operational value, performance, UX quality, maintainability, testability, and enterprise credibility — across the Vehicle Operational Hub and all sixteen Part R domains alike. Do not optimize for files changed or widgets shipped. Build the product that a fleet manager, dispatcher, workshop lead, finance controller, and executive would each trust with their real operations — one platform, one source of truth per domain, no fabricated numbers anywhere, and nothing copy-pasted from a reference product.
________________________________________
APPENDIX A — PROJECT CONTEXT HANDOFF
A.1 What the Platform Is
A multi-tenant, multi-branch Fleet Operating Intelligence Platform that ingests telematics from multiple providers, tracks vehicles/assets, manages drivers, fuel, expenses, maintenance, work orders, compliance, workflows, and produces AI-driven operational and financial insights.
Stack: Next.js 15 App Router, React 19, TypeScript 5, Tailwind CSS v4, MongoDB (raw driver, no ODM), Redis (queues/rate limiting/cache), BullMQ workers, NextAuth + custom access tokens, OpenTelemetry/Prometheus, Recharts, shadcn-style Radix UI components, Jest.
Deployment: Vercel (web app, production https://fleet-alpha.vercel.app), Railway (background worker), Redis Cloud, MongoDB Atlas.
Repo: https://github.com/fredtinotenda3/Fleet.git, branch main. Latest commit at last handoff: 9ca2358 — "feat(elite): security fixes, honest metrics, workshop costing, docs" (229 files, +13,918 / −715).
A.2 Architecture Notes
• Backend module structure: modules/<domain>/controllers → services → repositories.
• Repositories extend a fail-closed tenant-scoped BaseRepository; org-unit scoping via TenantContext.accessibleOrgUnitIds; write-scope resolvers (vehicleWriteResolver, driverWriteResolver) resolve ownership from the entity, never the request body.
• Event architecture: domain events → durable transactional outbox → OutboxProcessor → handlers. Rule engine: stateless condition → action via RuleActionRegistry. Workflow engine: stateful, org-unit-scoped approvals with idempotent starts and deterministic keys.
• Telematics: canonical TelematicsProvider interface; provider registry (cartrack, eagletrack, mock) with explicit providerId/externalDeviceId/vehicleId; automatic trip generation every 10 minutes; reverse geocoding infra; data staleness detection.
• AI/Intelligence: fleet health, driver risk, fuel fraud, expense anomaly, predictive maintenance; attention items with AI evidence envelope; value ledger (modelled vs realised).
A.3 What Was Already Complete (as of last handoff)
Backend Phases 0–7: security control plane, telemetry data integrity, provider contract/registry, event durability (outbox/retry/backoff/dead-letter), retention/rollups/geofence caching/streaming backup, workflow org-unit scoping + idempotent rule firing, ledger auto-posting/multi-currency/evidence envelope, observability (provider health, metrics, cron heartbeat).
Security hardening: JWT secret no longer falls back to a placeholder (was CRITICAL); three cross-tenant leaks closed (audit log, threat detection, vehicle analytics); report exports properly scoped; work-orders module org-unit scoped; legacy /api/admin routes removed; member routes tenant-bound; fuel driver driver_id schema strip fixed; vehicle update orgUnitId escalation blocked; allocation ledger posting key map corrected; 7 exploitable defects fixed with regression tests.
Data integrity: AttentionItem.orgUnitId resolved from target entity; alert store writes orgUnitId; 8 modules previously missing orgUnitId writes now write it; trip driver validation fixed (string vs ObjectId); backfill scripts for scope; fabricated metrics made nullable.
Worker deployment: Railway worker active; EagleTrack/Cartrack sync every ~2 minutes; trip generation every 10 minutes; rollups/backups/cleanup running; outbox processor running.
Frontend: design system (Tailwind v4 theme fixed), grouped sidebar navigation, command palette/global search, role-aware onboarding checklist, Dashboard + Command Centre, Vehicle Details with Quick Actions and Activity Timeline, Live Map with realistic markers and smooth movement, Trip Playback (scrubber, play/pause, route overlay), Driver Scorecard, Fleet Leaderboard + Alert Category tiles, Platform Admin (orgs/users/roles/API keys/audit log), Workflows (definitions/instances/tasks), Operational Dashboard (provider health, outbox, telemetry sync), Workshop parts/labour costing, honest empty/error/loading/stale states throughout.
Documentation (repo root): OPERATIONS_MANUAL.md (+PDF), ROLE_RESPONSIBILITY_MATRIX.md, DATA_FLOW_EXAMPLES.md, DATA_ENTRY_GUIDE.md, DATA_STRUCTURE_REFERENCE.md, DEPLOYMENT_AND_OPERATIONS.md, API_REFERENCE.md, SECURITY_MODEL.md, VALUE_LEDGER_AND_FINANCE_EXPLAINER.md, ELITE_MODE_FINAL_REPORT.md.
Test baseline (at handoff): TypeScript 0 errors; 2610 tests passing / 137 suites (21 skipped, require live Mongo); build produced 229 static pages; security suite 1602 passing.
A.4 Operational State (at last handoff)
• Database reset to clean state, ready for real data entry.
• Users scoped: org-wide (fredtinotenda3@gmail.com, owner@willsgrove.test, admin@willsgrove.test); Harare (stanley@gmail.com, harare.manager@willsgrove.test — Branch Manager with authority, plus role accounts); Bulawayo (branch manager, dispatcher, mechanic, viewer).
• Branches created: Harare Branch (HRE), Bulawayo Branch (BYO), plus departments, fleets, workshops.
• No vehicles, drivers, fuel, or trips yet — awaiting data entry.
• Fuel data exists in Excel: columns reg, driver, date, litres, fuelType. Diesel $1.95/L, Petrol $1.96/L. No odometer readings — cost = volume × price.
Manual steps still required before full operation:
1.	Set REFRESH_TOKEN_SECRET in Vercel (done at handoff — reconfirm).
2.	Verify NEXTAUTH_SECRET is not the placeholder.
3.	Re-save every scheduled report definition (scope-freeze behavior changed).
4.	Run npm run db:indexes.
5.	Run npm run finance:backfill-ledger (dry-run, then --confirm).
6.	Run npm run tenancy:backfill (dry-run, then --confirm).
7.	Deploy Vercel + Railway.
8.	Rotate all credentials shared in chat history (MongoDB, Redis, JWT, encryption key, super admin password).
A.5 How To Continue In a New Chat
Paste this document, then add:
Continue the Fleet Operating Intelligence Platform. Repository is at C:\Users\Accounts\Desktop\Fleet, GitHub https://github.com/fredtinotenda3/Fleet.git, latest commit 9ca2358. [State exactly what you want done next: implement a specific wave/Part R domain, review a specific module, prepare a new prompt, etc.] Do not rebuild existing systems. Verify current implementation before changing. Preserve tenancy, org-unit isolation, and the ACTUAL / CALCULATED / ESTIMATED / UNAVAILABLE rule. Enter Elite Mode.
A.6 Key Files To Reference
• server/tenancy/tenant-scope.ts — tenant scope authority
• server/repositories/base.repository.ts — fail-closed repository
• server/tenancy/module-scope.registry.ts — module org-unit policy
• server/events/bootstrap.ts — handler registration
• modules/telematics/ — providers, adapters, ingestion
• modules/trips/ — trip generation, playback
• modules/finance/ — allocation ledger
• frontend/shared/ui/patterns/ — design system
• frontend/shared/ui/navigation/nav.config.ts — navigation model
• frontend/modules/onboarding/ — setup checklist
• OPERATIONS_MANUAL.md — how to operate the platform
• ROLE_RESPONSIBILITY_MATRIX.md — who can do what


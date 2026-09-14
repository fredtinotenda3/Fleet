# Elite Mode — Gap Assessment & Wave 1 (Part 1) Delivery

**Verified:** `tsc --noEmit` clean · 140 suites / 2698 tests passing, 21 skipped, 0 failures (under `TZ=UTC` and `TZ=Pacific/Kiritimati`) · `next build` 230/230 static pages · lint unchanged at its 23-error pre-existing baseline, **zero findings in any file this wave touched**.

---

## Part A — Gap assessment

I audited the repository against the full specification before changing anything. Three findings reshape the plan, and I want them stated before the delivery.

### A.1 The rule engine has no caller — this blocks Waves 2–8

§11's first cross-cutting rule is *"One alert engine — R.2 through R.15 are all configurations on the existing rule engine, never bespoke notifiers."* That premise does not currently hold.

`ruleTriggerService.fireEvent` (`modules/rules/services/rule-trigger.service.ts:18`) exists so domain modules can fire triggers. **A repo-wide grep finds no domain module that calls it.** The only live entry point is a manual `POST /api/rules/evaluate` gated on `ORG_MANAGE`. No event-bus handler, no cron, no ingestion hook fires a rule.

Everything that actually alerts today is one of **five independent hardcoded paths**:

| # | Path | Notes |
|---|---|---|
| 1 | `modules/rules/` | Generic and configurable — and effectively dead in production |
| 2 | `reading-alerts.ts` `deriveReadingAlerts` | Runs on **every ingested reading**. Thresholds are compile-time constants (`SPEEDING_THRESHOLD_KMH = 120`, `LOW_FUEL_THRESHOLD_PERCENT = 10`) — not tenant-configurable |
| 3 | `eagletrack-alert-sync.service.ts` | Vendor-defined rules the platform can neither author nor edit |
| 4 | `workers/telemetry.worker.ts:280-317` | Device-offline alerting, independent thresholds |
| 5 | AI / needs-attention / attention-dispatch | Shares the *action* registry but not the *condition* engine |

Plus six further `sendNotification` call sites bypassing all five, and a sixth rule-ish engine in `modules/compliance`.

**Consequence for sequencing:** R.2 is not "add alert types". It is *wiring the engine and migrating path #2 into it* — path #2 first, because compile-time thresholds are the most visible configurability gap. Building R.4–R.15 alert configuration before that would add a seventh path, not consolidate six.

Two false affordances found alongside it: `set_variable` is a registered rule action whose `execute()` is empty and which the engine never special-cases — a rule using it **silently does nothing**; and `push` is a selectable notification channel with **no implementation anywhere** (zero hits for web-push/FCM/APNS).

### A.2 Seven Part R domains have no signal — and that is the honest answer

The canonical provider contract (`canonical-telemetry.ts`) carries position, engine (ignition, rpm, coolant, fuel %, throttle, load, engine hours, battery voltage, DTCs), trip, fuel-flow, events and an opaque metadata bag. I checked each Part R domain against it directly:

| Domain | Signal in the canonical model? |
|---|---|
| R.4 Fuel, R.5 Driving behaviour, R.13 RPM | **Yes** — buildable now |
| R.6 Cargo temperature | **No.** `temperature` appears only as engine coolant |
| R.7 Tyre / TPMS | **No.** Zero hits for `tirePressure`/`tpms` anywhere |
| R.9 Trailer | **No** trailer entity or signal |
| R.10 Load monitoring | **No** load/axle-weight signal |
| R.12 E-lock | **No** |
| R.14 PTO | **No.** All 21 "pto" matches are substrings of `descriptor`, `rollupTo`, `laptop` |
| R.15 Toll | **No.** `toll` exists only as an expense *category* string |

Per §7 and §11 these are **BLOCKED BY EXTERNAL DEPENDENCY**, and §5.7's rule applies: *"Never manufacture hardware capability."* The correct work for them is to extend the canonical contract with optional signal groups so an adapter *can* carry them when hardware provides them — a safe integration surface — and render NOT-APPLICABLE otherwise. That is a deliberate design decision I have flagged rather than pre-empted, because it commits the provider contract.

### A.3 Vehicle Hub — what existed vs what did not

| § | Item | State found |
|---|---|---|
| 4.1 | Vehicle-scoped live map | Backend **COMPLETE** (`useVehicleDetail`, `useVehicleRouteHistory`, `VehicleDetailPanel` is a pure component). Frontend mount **GENUINELY MISSING** — the hub imported nothing from telematics |
| 4.2 | Trip generation correctness | **COMPLETE** — ignition-primary with movement fallback, three idempotency layers |
| 4.3 | Trip location enrichment | **COMPLETE** — async, three-state address, never fabricated |
| 4.4 | Driver inheritance | **PARTIAL** — assignment correct; forms did not inherit |
| 4.5 | Trip fuel intelligence | **PARTIAL** — types exist, provenance labels do not |
| 4.6 | Fuel/trip reconciliation | **GENUINELY MISSING** |
| 4.7–4.9 | Vehicle analytics | **COMPLETE-NEEDS-POLISH** — but the date range is **not threaded** into `FuelKpiCards`, `MaintenanceStatsCards` or `TripMonthlyTrendChart`: a user can set a range and watch the KPIs not change |
| 4.10 | Trip playback | **COMPLETE**, reachable but poorly discoverable |
| 4.11 | Operational header | **PARTIAL** — ~4 of 13 fields |
| 4.13 | Cost intelligence | **COMPLETE** — reads the ledger, does not recompute |
| 4.14 | Trip-level cost detail | **PARTIAL** — types + aggregate chart exist; absent from trip list *and* trip detail |
| 4.15 | Attention items on the hub | **INTEGRATION MISSING** — and the API has no vehicle filter |
| §5 | Instrument cluster | **GENUINELY MISSING** — one real gauge in the whole frontend (`DriverRiskGauge`), and `FleetHealthGauge` is a progress bar despite the name |

Two things already existed and were worth preserving rather than rebuilding: `marker-interpolation.ts` (a solid, tested interpolator that explicitly refuses dead reckoning) and the demo simulator's derivative-consistent motion model.

---

## Part B — Wave 1, Part 1: delivered and verified

Scope delivered: **the live-state foundation of the Vehicle Operational Hub** — §4.1 live state, §5 instrument fidelity, and the §4.4 driver-inheritance gap. Everything below is IMPLEMENTED + VERIFIED unless stated.

### B.1 Ignition was being discarded at ingest — P1 data-truth defect

The signal existed at three points in the pipeline and was thrown away at the fourth:

- `CanonicalEngine.ignition` — the provider contract declares it.
- The EagleTrack adapter reads `io["1"]`; Cartrack reads `ignition_on`.
- Both used it **once** to derive `trip.idleTime` and discarded the boolean, because `TelematicsData` had no field for it — `eagletrack.adapter.ts:533` says so in as many words.
- `trip-generation.service.ts` needed it badly enough to go digging in `providerMetadata` for it.

**Why it matters:** after ingest, *"engine running while stationary"* and *"parked with the engine off"* are the same observation — speed 0. That distinction **is** the idle metric; it is what makes an idling-fuel-waste figure (an R.0 dashboard requirement) meaningful; and it decides whether an instrument cluster shows a live engine or a dead one.

**Fixed** by adding `ignition?: boolean` to `TelematicsData.engine` — optional, so **no migration**: Mongo stores no schema and every existing reading correctly continues to report "not known". Both adapters now persist it, keeping ABSENT distinct from OFF. `live-map.service.ts` carries it using the trips module's **existing exported** `extractIgnition` rather than a third copy of the rule.

### B.2 The demo provider was fabricating engine values

Demo Mode persists through the **same `tbltelematics` collection** real Cartrack data lands in. Nothing downstream can tell them apart. It was writing:

```
rpm: sim.status === 'moving' ? 1800 : 800     coolantTemp: 90
throttlePosition: ... ? 40 : 0                engineLoad: ... ? 50 : 5
altitude: 0, accuracy: 5                      tripDistance: 0, tripDuration: 0
fuel: { consumptionRate: 0, instantConsumption: 0, fuelUsed: 0 }
averageSpeed: sim.speed, maxSpeed: sim.speed
```

Three distinct defects: **constants presented as measurements** (a gauge on `coolantTemp: 90` has a needle that never moves, making §5's whole requirement unmeetable); **fabricated zeros** (a running engine reporting 0 L/h hides the idling cost the product exists to surface); and **an instantaneous sample as two trip aggregates** — the *exact* category error both real adapters carry long comments about having fixed. **The correction never reached the demo path**, so the one provider a prospect actually sees kept the defect the real ones lost.

Three further defects my own tests then exposed:

1. **The simulator contradicted the platform's definition of idle.** It emitted `ignitionOn: !isIdleWindow` — reporting an *idling* vehicle as engine-off. Every other part of the codebase defines idle as engine-running-while-stationary. Invisible until ignition became persistable.
2. **An "idling" vehicle's position kept moving.** `angle` advanced with raw elapsed time regardless of the idle window while speed was forced to 0 — so on the live map the marker glided across the screen while the panel read "0 km/h".
3. **Speed was not the derivative of the path.** The file's header claims it is; only heading was. For a 5 km radius on an 18-minute loop the true tangential speed is ~105 km/h while the reported figure was ~45 — and the odometer integrated a *third* value. Position, speed and odometer were three mutually inconsistent quantities, which matters because this platform reconciles fuel against distance.

**Fixed** by inverting the motion model so **distance is the primitive** and angle derives from it, with the speed profile integrated in closed form — position, speed and odometer are now the same quantity expressed three ways and cannot disagree. Idle windows advance time without advancing distance. Engine signals are **modelled** (coolant on an exponential warm-up curve, RPM through a five-speed gear model that sawtooths on upshift, load-dependent burn, alternator voltage) rather than constant, and everything not modelled is now **omitted** rather than invented. The pure-function-of-`(vehicleId, elapsedSeconds)` design rule is preserved — both integrals are closed-form.

### B.3 The instrument cluster (§5)

Built on three **pure, tested** modules, because jest here runs `testEnvironment: 'node'` with no jsdom — a decision inside JSX cannot be tested:

- **`signal-state.ts`** — provenance as a *type*. `Signal<T>` has no `.value` on its unavailable variant, so a render site **cannot compile** without branching. This is the structural replacement for a convention that had been re-fixed several times. NOT-APPLICABLE is a separate variant from UNAVAILABLE because they mean opposite things: one says something may be wrong, the other says nothing is missing — conflating them sends someone to check a sensor that was never fitted. Freshness has six states and mirrors the **server's own** thresholds so the map and the cluster cannot disagree.
- **`vehicle-profile.ts`** — gauge ranges per vehicle class, resolved from free text. Deliberately mirrors `vehicle-glyph.ts`'s structure and inherits its priority decisions (trailer before truck, pickup before truck) rather than inventing a second classification scheme. Heavy classes get a 24 V battery dial; a 12 V dial would pin the needle permanently. An EV has **no tachometer at all** rather than a blank one. The fallback is `light-truck`, chosen because under-scaling is visible and self-correcting while over-scaling reads as a broken instrument.
- **`gauge-geometry.ts`** — SVG arc, tick, band and needle math. None existed: Recharts' one radial component draws a progress arc, not an instrument. Values are **clamped** at both stops, so a gauge is safe to point at an unvalidated provider field. `approachValue` eases the needle toward a *received* value and never predicts forward — the same line `marker-interpolation.ts` draws ("the marker lags reality; it never leads it").

The `Gauge` component takes a `Signal`, never a number. **An unavailable signal draws no needle at all** — a needle resting at the minimum is a reading of the minimum. Only a live fix animates: motion is a claim of liveness.

`VehicleInstrumentCluster` is mounted at the top of the hub's Overview tab, is vehicle-scoped by construction (the per-vehicle endpoint, not the fleet list §12.3 rules out), distinguishes a **failed request** from a silent vehicle, and names the signals this tracker does not report so an absent dial reads as a hardware gap rather than a broken feature.

### B.4 The hub now uses what it already knew

`vehicle.assignedDriver` was fetched and rendered in the Driver tab while every quick-action form opened from the same page started with an empty driver field. Now seeded — **on the create path only**: an existing log keeps its own attribution, because the fuel-driver fix turns on the chart showing the driver *on the log*, never the vehicle's current driver.

Related bug fixed: the fuel-type auto-fill lived inside `onValueChange`, so it fired only on **manual** vehicle selection — and never on the one path where the vehicle is unambiguously known, because a default value raises no change event. Extracted to a shared `applyVehicleDefaults` used by both paths, non-destructive (only seeds an untouched odometer, never marks a pristine form dirty).

---

## Part C — Tests added

| Suite | Tests | What it pins |
|---|---|---|
| `tests/unit/telematics/demo-simulator-fidelity.spec.ts` | 22 | Determinism; idle = engine-running-while-stationary; coolant warm-up curve and plateau; RPM sawtooth on upshift (asserts a *higher speed with lower rpm* exists, which a faked linear needle cannot produce); idling burns fuel; speed remains the true derivative of the path; no fabricated values in the persisted payload |
| `tests/unit/instruments/instrument-core.spec.ts` | 45 | Absent → UNAVAILABLE while a **genuine zero survives as a measurement**; NOT-APPLICABLE distinct from UNAVAILABLE; only a live fix animates; EV has no tachometer; needle clamps, never overshoots, is frame-rate independent; SVG polar conversion; large-arc flag computed not fixed |
| `tests/security/telemetry-signal-truth.spec.ts` | 21 | Ignition survives model → adapters → service → UI; the demo payload invents nothing; the gauge cannot take a bare number; auto-fill runs on both paths and never overwrites |

**88 new tests.** The derivative test earned its place: it *failed first* and exposed defect B.2(3), which I had not set out to find.

---

## Part D — Remaining, and honestly classified

**Wave 1 not yet done:** the vehicle-scoped *map* (§4.1 — cluster done, map pending; blocker is that `LiveMapVehicleDetail` carries no plate/make/model, so the reusable panel needs either that widening or a small summary endpoint); operational header (§4.11); trip history table + a `/trips?license_plate=` deep link, which is the one module missing the per-vehicle link every other module has; fuel/trip reconciliation (§4.6); the date-range threading bug; trip-level cost on the trip list and detail (§4.14); attention items on the hub (§4.15 — needs an `entityId` filter on the API, since client-filtering a server-truncated 200-item feed can silently miss a vehicle).

**Blocked by external dependency:** R.6, R.7, R.9, R.10, R.12, R.14, R.15 — no canonical signal, as A.2 sets out. Safe partial available: extend the contract with optional signal groups.

**Blocked architecturally:** R.2 and everything configuring it, until the rule engine has a caller (A.1).

**Not started:** R.0, R.1, R.3, R.5, R.8, R.11; §6 fleet-wide analytics; §7 modules; §9 backend sweep.

I have not packaged anything unverified and have not stubbed any module. §15 says to split by wave rather than return a partially-implemented whole, so this is Part 1 of Wave 1, complete and verified as a vertical slice: data → model → adapter → service → API → UI → tests.

---

## Part E — Visual fidelity: what a user sees

**Vehicle Details → Overview.** A "Live instruments" card at the top. Three dials — speed, engine speed, coolant — with numbered ticks, coloured warning and danger arcs, a tapered needle with a counterweight tail, and a digital readout in the 90° the 270° sweep leaves free at the bottom. Under them, fuel level and supply voltage as compact bars. Each dial carries a provenance badge: green **LIVE**, blue **DERIVED**, amber **ESTIMATED**, grey **NO DATA** or **N/A**, each with a hover explanation. The header states the scale in words — *"Scaled for a heavy truck"* — because the class is inferred from free text and can be wrong, and a reader who knows the vehicle should be able to tell.

**Why it looks like hardware rather than a chart:** the needle eases with momentum toward each polled value instead of snapping; the tachometer *drops on every upshift* rather than rising in one straight line, which is the single most obvious tell of a faked cluster; coolant climbs from ambient on an exponential curve and plateaus rather than sitting at a constant; the dial is scaled to the vehicle, so a heavy truck's tachometer redlines around 2,600 rpm and a motorcycle's past 11,000.

**Manual verification steps:**
1. Open Vehicle Details for a demo vehicle → the speed needle animates smoothly between 10-second polls; the coolant needle climbs over the first few minutes and settles.
2. Watch through an idle window → speed falls to 0, the marker **stops moving**, the "Engine on" pill stays lit, RPM drops to that vehicle's idle, and fuel burn stays non-zero.
3. Stop the simulator feed for >15 minutes → the card shows **Stale**, the needles freeze, animation stops, and a sentence appears saying the readings are frozen at that moment, not current.
4. Set a vehicle's `fuel_type` to `Electric` → the tachometer is replaced by an explicit "Not applicable — this vehicle has an electric drivetrain" panel, not a dead dial.
5. Point at a Cartrack vehicle (no RPM or coolant signal) → those dials are dimmed with no needle and a **NO DATA** badge, and a footnote names exactly which signals the tracker does not report.
6. Open "Log fuel" from the vehicle page → plate, fuel type, odometer and assigned driver are pre-filled; all remain editable.

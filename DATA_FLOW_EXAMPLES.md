# Data Flow Examples

What actually happens when a record is saved — traced through the code
that runs, not through the architecture diagram.

Every flow below names real files, real event names and real collections.
Where a link in the chain is broken or absent, it says so: a data-flow
document that describes intentions rather than behaviour is how a
disconnected feature survives three rounds of review.

---

## 1. Fuel

### The write

```
POST /api/fuellogs                     withAuth(Permission.FUEL_CREATE)
  → FuelController.createFuelLog
  → CreateFuelLogCommand { rawData, tenantId, scope, userId }
  → CreateFuelLogHandler
```

Inside the handler, in order:

| Step | What it does | What it refuses |
|---|---|---|
| `validateWithZod(fuelLogCreateSchema)` | shapes and coerces | a negative volume, a cost over 999,999, a fuel-card payment with no card |
| `vehicleWriteResolver.resolveForWrite(plate, scope)` | plate → vehicle, **tenant-filtered and org-unit-checked** | a plate matching two active vehicles (409); a vehicle outside the caller's scope, reported identically to "not found" |
| `driverWriteResolver.resolveForWrite(driver_id, scope)` | driver id → driver, same two checks | a driver in another branch, again indistinguishable from not-found |
| `tblunits`, `tblfuelstations`, `tblfuelcards`, `tbltrips` lookups | referential integrity | an inactive fuel card, a trip belonging to a different vehicle |
| `fuelRepo.create` | the write | — |

The stored document inherits **the vehicle's `orgUnitId`**, not the
submitter's. If a Harare accountant records a cost for a Bulawayo truck,
the cost is Bulawayo's — attributing it to Harare because Harare typed it
in would corrupt both branches' figures.

> **`driver_id` reached the database for the first time this round.**
> `fuelLogBaseSchema` never declared the field, and a plain `z.object`
> strips undeclared keys, so validation deleted it in transit on both
> create and update. The handler then read it back through a cast, which
> made the permanently-`undefined` result type-check. Every fuel log ever
> written was unattributed, which is why "Fuel Cost by Driver" showed one
> bar labelled *Unassigned*.

### The event, and everything that hangs off it

```
FuelLoggedEvent {
  entityId, license_plate, fuel_volume, cost, odometer,
  date,        ← the RECORD's date, so the ledger posts to the right period
  currency,    ← so a posting is never converted at an assumed 1:1
  driver_id,   ← added this round; the ledger's driver column was always empty
  tenantId
}
```

| Subscriber | What it does |
|---|---|
| `AllocationPostingHandler` | posts `cost` into `tblallocationledger` under `costCategory: 'fuel'` |
| `DigitalTwinProjectionHandler` | resolves the plate, updates the twin's fuel state |
| `AIPredictionTriggerHandler` | runs fuel-fraud detection for that vehicle |
| `IntelligenceHandler` | tenant-wide fuel anomaly detection |
| `NotificationHandler` | notifies subscribers |
| `AnalyticsHandler` | invalidates cached analytics |
| `WorkflowTriggerHandler` | fires `fuel.logged` workflows |
| `WebhookDispatchHandler` | delivers to customer webhook subscriptions |
| `WebSocketHandler` | emits `fuel:logged` — **and nothing listens** (§7) |

### Where the money lands

`allocationPostingService.postSource` derives
`sha256(tenantId ␀ tblfuellogs ␀ sourceId ␀ fuel)` and a **partial unique
index** enforces it. Delivery is at-least-once, so a redelivered event
returns `duplicate` and writes nothing. That property is load-bearing:
the ledger is append-only, and a double posting can only be undone by a
human noticing a plausible number and making a reversing entry.

The posting's `periodStart` and `periodEnd` are both the fuel log's own
date. A source with **no** date is refused rather than dated to now — a
refusal is visible today; a misdated posting surfaces months later during
reconciliation, in a period that may already be closed.

### Where it shows up

Fuel list · the vehicle's fuel history · the vehicle's Activity timeline ·
Fuel Cost by Driver · the allocation ledger · cost per km · the ESG export.

---

## 2. Telemetry → trip → cost per km

This is the flow that makes the product an intelligence platform rather
than a set of forms, and it is worth reading end to end.

```
provider.syncTenant()                                   every 2 minutes, per provider
  → telematicsService.ingestTelematicsData()            → tbltelematics
                                                          unique {tenantId, vehicleId, deviceId, timestamp}
                                                          TTL on createdAt

[scheduled] generate-trips                              every 10 minutes
  → tripGenerationService.generateTrips()
      reads from the per-vehicle WATERMARK in tbltrip_detection_state
  → detectTrips(readings, config)                       PURE — no I/O
      ignition authoritative when reported;
      movement fallback (> 5 km/h);
      a stop of 5 minutes ends a trip;
      SILENCE OF MORE THAN 60 MINUTES ends it at the last fix;
      journeys under 2 minutes AND 0.5 km are discarded
  → tbltrips  { created_from: 'gps', generation_key, distance_km_known }

  → TripCreatedEvent → maintenance forecasting, analytics, workflows
```

Then:

```
distance   ← tbltrips WHERE distance_km_known = true
cost       ← tblallocationledger, in the reporting currency
costPerKm  ← cost ÷ distance, and NULL at zero distance — never 0
```

Three properties hold this together:

- **Idempotent in three independent layers** — the watermark, a
  deterministic `generation_key`, and a partial unique index. `$setOnInsert`
  throughout, so a re-run can never mutate a trip already posted to the
  ledger. State is written *after* the trips, so a crash re-reads rather
  than losing journeys.
- **`distance_km_known` is the honesty flag.** `distance_calculated` is a
  required number, so an unmeasurable trip stores `0` there — and the flag
  records that the `0` is an *absence*. Anything averaging distance filters
  on it. This is the one place the codebase's "never write 0 for unknown"
  rule is bent, and it is bent because the field is non-optional in a
  shipped schema.
- **`signalGapMinutes` is 60, and that number has a scar.** It was first
  written as 30 — an ordinary tracker cadence — so the rule fired on
  normal operation, every journey split into single-fix stubs, each stub
  failed the minimum-trip test and was discarded, and **a full day of
  driving produced zero trips**. Silence, not a wrong answer. If your
  trackers report less often than hourly, lower it deliberately.

### Playback

```
GET /api/trips/:id/playback            withAuth(Permission.TRIP_VIEW)
  → tripPlaybackService.getPlayback(id, context)
      1. load the trip under the caller's context
      2. REFUSE if out of scope — as NOT FOUND, before any telemetry read
      3. vehicle comes from the TRIP record, never from the request
      4. read tbltelematics between start_time and end_time
      5. downsample evenly, ALWAYS keeping first and last
```

The route is reconstructed, never stored: a stored polyline would
duplicate the largest collection in the database and go stale the moment
the provider backfills. The response says **why** it is empty when it is
(`no-time-window`, `no-vehicle-reference`, `no-readings`) rather than
returning a bare empty array.

---

## 3. Work order

```
POST /api/workorders                   withAuth(Permission.WORKORDER_CREATE)
  → tblworkorders { status: 'open', openedAt }
  → WorkOrderCreatedEvent → slaTrackingStarterHandler   (starts the SLA clock)

POST /api/workorders/:id/assign        WORKORDER_ASSIGN
  → assignedMechanicId, bayId, status: 'assigned'
  → WorkOrderAssignedEvent → slaResponseRecorderHandler (stops the response clock)

POST /api/workorders/:id/parts         parts consumed → tblstockmovements
POST /api/workorders/:id/labor         labour hours and cost

POST /api/workorders/:id/status → completed
  → WorkOrderCompletedEvent { partsCost, laborCost, totalCost, date: completedAt }
      → slaTrackingResolverHandler        (resolves the SLA)
      → digitalTwinProjectionHandler      (service history)
      → AllocationPostingHandler          (the money)
```

**A completed work order is TWO postings, not one:**

| Line | Cost category | Why separate |
|---|---|---|
| `partsCost` | `maintenance` | inventory consumption |
| `laborCost` | `other` | time |

`totalCost` is used **only** when neither component is present. Posting
the total alongside the components would double-count the job, and on an
append-only ledger that needs a human reversal to undo. The idempotency
key includes `costCategory`, which is why one source record can produce
two postings without colliding.

> **This entire branch was unreachable until this round.** `WorkOrderCompleted`
> was in the posting handler's map but not in bootstrap's hand-written
> `allEventNames` array, so the handler never received it — under a
> comment claiming it was "subscribed to every event". Every part and
> every labour hour on every completed work order stayed out of the
> ledger. The subscription is now derived from the handler's own map
> (`POSTING_EVENT_NAMES`), so the two cannot disagree, and
> `tests/security/event-wiring-conformance.spec.ts` asserts it.

### Where the work order comes from

Three origins, and until this round none of them was a person:

```
DVIR defect  → dvirService                → work order
Maintenance reminder → rule action        → work order
Attention item → POST .../dispatch        → work order
Manual        → POST /api/workorders      ← NEW: WorkOrderForm / WorkOrderModal
```

The create endpoint had shipped, permission-gated and tested, reachable
only by other code. A workshop manager standing in front of a truck with
a cracked mirror had nowhere to record the job unless someone first
raised a reminder for it.

---

## 4. Driver assignment

```
PATCH /api/vehicles/:id/driver         withAuth + canAssignDriverToVehicle
  → VehicleController.assignVehicleDriver
      loadInScopeVehicle(req, id)      ← vehicle must be in the caller's scope
      driverRepository.findById(...)   ← tenant-scoped
      canAccessRecord(ctx, driver.orgUnitId)
  → AssignVehicleDriverCommand
  → VehicleDriverAssignedEvent / VehicleDriverUnassignedEvent
```

**The assignment is the vehicle's CURRENT driver, and nothing else.** It
is deliberately not propagated backwards:

- a fuel log records who fuelled the vehicle **on that date**;
- a trip records who drove it **on that trip**.

Back-filling the vehicle's present driver onto historical records would
move one person's fuel spend and one person's risk score onto another,
and would change again every time the vehicle is reassigned. A test
asserts a fuel log created with no driver stays unattributed even when
the vehicle has one.

> A record with **no** org unit is now unassignable by a scoped caller.
> That is a tightening: a shipped test previously asserted the opposite
> ("only an explicit mismatch is blocked"), pinning a fail-open in place.
> A driver with no org unit does not appear in a narrowed manager's driver
> list, so they must not be assignable from it either.

---

## 5. Attention → action → outcome → value

The loop that turns analysis into a number a customer can defend.

```
[detection]   fleetHealthService / predictiveMaintenanceService /
              fuelFraudDetectionService / expenseAnomalyDetectionService
                 ↓
[attention]   tblattentionitems  { severity, estimatedCost, estimatedBenefit,
                                   evidence[]  ← capped at 20, deterministic order }
                 ↓
[decision]    Command Centre — a human reads the evidence
                 ↓
[action]      POST /api/ai/needs-attention/:id/dispatch
                 gated on WORKORDER_CREATE or MAINTENANCE_CREATE
                 → ruleActionRegistry → work order / maintenance reminder
                 ↓
[outcome]     POST /api/ai/needs-attention/:id/resolve
                 A DIALOG, not one click
                 ↓
[value]       tblvalueledger  ← append-only
                 ↓
[ROI]         value ÷ cost, same period, reporting currency
```

Two constraints are load-bearing:

- **Resolve is a dialog because it posts to a ledger.** Auto-posting the
  platform's own *modelled estimate* as the confirmed outcome would put
  fabricated numbers into something someone reconciles.
- **Evidence is persisted on the item**, not read from a live feed. "Why
  did the platform raise this?" has to be answerable after the fact, and
  a row with no usable `_id` contributes nothing rather than contributing
  a blank.

There is **no revenue model in this platform** — nothing knows what a
delivery earns — so ROI is value ÷ cost and "profitability" is an
extension point, not a computed figure.

---

## 6. Notification

```
notificationService.sendNotification(userId, tenantId, notification)
  → preferences: is this type enabled? which channels?
  → tblnotifications { deliveryMethods, sentAt }
  → 'email'  → SEND_EMAIL job → EmailWorker → emailService.send
  → 'in_app' → webSocketManager.emitToUser (see §7)
```

> **Until this round the email branch did not exist.** The pipeline was
> built and complete — `addNotificationJob` → `send-notification` queue →
> `NotificationWorker` → `SEND_EMAIL` → `EmailWorker` — and
> `addNotificationJob` had **zero callers**. Every production caller
> reaches `sendNotification` directly, which persisted a row carrying
> `deliveryMethods: ['email']` and a `sentAt` timestamp and then only
> emitted the in-app event. `organization_invite` is configured
> email-only, so it produced no in-app record *and* no email: an
> invitation that silently did nothing.
>
> The fan-out now lives beside the persistence it describes. If the queue
> is unreachable the record is **corrected** — `'email'` is removed from
> `deliveryMethods` — rather than left claiming a delivery that did not
> happen.

---

## 7. The real-time layer, and why it is not in any flow above

`webSocketManager.emitToTenant` / `emitToUser` / `emitToOrgUnit` are
called from 29 places. **All 29 are no-ops.**

- `webSocketManager.initialize(server)` is never called, so `io` is never
  assigned and every emit method returns at its first line.
- `infrastructure/websocket/client.ts` is complete, correct, and imported
  by nothing.
- There is no `/api/socket` route for a client to reach.

The application polls instead — notifications every 60 seconds, the live
map every 10 — which is the correct pattern for the documented deployment
target, since serverless functions cannot hold a persistent Socket.IO
connection.

Turning it on is a **hosting** decision (a long-lived Node process for the
socket server), not a code fix, so nothing above depends on it. The
emit methods now log the fact once per process rather than being silent
about it.

---

## 8. Reading a flow that looks broken

| Symptom | First thing to check |
|---|---|
| A record saves and then disappears | org-unit scope. `POST 201, GET empty` is the signature of a create that did not write `orgUnitId`, and a scoped list that filters on it. |
| A cost is missing from the ledger | is the source event published AND subscribed? `npm run test:security` includes the wiring conformance suite that answers this mechanically. |
| Cost per km is `null` | no trip distance in the period, or every trip has `distance_km_known: false`. |
| Cost per km looks too low | historical records predate the posting fix — `npm run finance:backfill-ledger` (dry run first). |
| A figure reads 0 | check whether it should be `null`. Several were fixed this round; the honest-metrics suite pins them. |
| A notification never arrived | it may have been recorded as emailed by a version before the email fan-out was wired. Check `deliveryMethods` against the send date. |
| Trips stop being generated | `tbltrip_detection_state` — if `tbltrips` was cleared without it, every watermark sits in the future and the sweep skips everything, silently. |

# User Guide

For the people who run a fleet with this platform day to day.

---

## 1. What this product is trying to do

Most fleet software records what happened. This one is built to close a
loop:

```
telemetry → operations → intelligence → attention → action → outcome → value
```

Concretely: a tracker reports positions → those become **trips** → trips
plus fuel logs give you **cost per kilometre** → anomalies raise
**attention items** → you act on one → the outcome posts to the **value
ledger**.

Every step depends on the one before it. A fleet with no trips has no
cost-per-km, and no amount of dashboard makes that untrue.

---

## 2. Logging in and what you can see

What you see is decided by two things: your **permissions** (what
actions), and your **org unit** (which records).

- **Org-wide roles** — owner, organization admin, super admin — see
  every record in the organization.
- **Narrowed roles** — branch, department, fleet and workshop managers,
  dispatchers, mechanics, drivers — see their own unit and the units
  beneath it.
- **No assignment** — you see nothing. That is deliberate, not a fault,
  but it looks identical to a broken account. Ask an administrator to
  assign you to a branch.

> If a colleague can see a record and you cannot, the usual cause is
> that they are org-wide and you are not.

---

## 3. Getting data in

**Order matters.** Full detail in `DATA_ENTRY_GUIDE.md`; the short
version:

1. **Vehicles first.** Everything else inherits its branch from a
   vehicle.
2. **Drivers.**
3. Then fuel, expenses, trips, maintenance.

**A record with a vehicle belongs to that vehicle's branch, not yours.**
If you record a cost for another branch's truck, the cost is theirs —
and it will not appear in your own list. If you try to record against a
vehicle outside your scope you now get "Vehicle not found" rather than a
save that silently vanishes.

### Fuel — record the odometer

`odometer` is technically optional and practically essential. Fuel
efficiency needs a **distance**, and distance comes from the difference
between two odometer readings. Without at least two real readings per
vehicle you get no km/L, no fuel cost-per-km, and a weakened fraud
signal.

Record the odometer on every fill, and tick **full tank** when you fill
to full — two consecutive full-tank fills with odometer readings are what
make a consumption figure trustworthy.

---

## 4. Trips

Trips can arrive three ways: entered by hand, imported from a
spreadsheet, or **generated automatically from telemetry**.

Generated trips are marked as GPS-derived and carry:

- start and end time, and duration;
- distance — from the vehicle's **odometer** where available, otherwise
  reconstructed from the GPS path;
- why the trip ended: *ignition off*, *stopped*, or *signal gap*.

> **"No distance recorded" is not zero.** When a trip's distance could
> not be established the platform says so rather than showing `0`. A
> fabricated zero would drag the whole fleet's efficiency down.

### Route playback

Open a trip and replay it. The map draws the actual recorded track with
start and end markers and a timeline you can scrub.

Two honesty notes: a very long trip's track is **thinned** for display
(and says so — the first and last points are always kept), and if there
is no track the platform tells you *why* (no time window, no vehicle
reference, or no readings) rather than showing an empty map.

---

## 5. The live map

- **Green** moving, **amber** idle, **grey** offline, **red** alerting.
- The **arrow** shows heading. It is hidden for offline vehicles — a
  parked vehicle's last-known bearing says nothing about where it points
  now.
- The **silhouette** inside the marker reflects vehicle type (truck,
  trailer, forklift, tractor, generator, light vehicle, bus,
  motorcycle). Unrecognised types draw a generic truck.
- Markers **glide** between updates instead of jumping. The platform
  never guesses ahead: a marker eases to the last **known** position and
  stops there. Implausible jumps snap rather than sliding, because
  sliding would draw a journey that did not happen.
- **Stale fix** means the position is older than expected but the vehicle
  is not yet considered offline.

---

## 6. Costs

**Cost per kilometre** = allocated cost ÷ distance driven.

Costs post automatically from fuel logs, expenses, completed maintenance
and completed work orders. Work orders post **parts and labour
separately**.

Two things to know:

- Maintenance costs are **estimates**. The reminder record has no
  actual-cost field, so maintenance postings say so explicitly. Do not
  reconcile them against invoices and conclude the ledger is wrong.
- If costs and distance are in different currencies with no exchange
  rate, the platform **refuses to total them** rather than assuming 1:1.

---

## 7. Command Centre

Answers: *what is happening, what needs attention, what is at risk, where
is money going.*

Every item is derived from real records. Where a figure cannot be
computed you will see **"no data"**, not a zero.

### Attention items

Each carries a severity, a cost estimate where one exists, and — worth
opening — **"Why this was raised"**, listing the actual records behind
it. If an item cannot show you its evidence, treat it with suspicion.

You can:

- **Resolve** it — a dialog, not one click, because resolving posts an
  outcome to the value ledger and the platform will not post its own
  estimate as your confirmed result.
- **Dispatch** it — turn it into a work order or a maintenance task.

---

## 8. Reading the numbers honestly

| You see | It means |
|---|---|
| **"No data"** / "Not measured" | genuinely could not be computed |
| **0** | a real measured zero |
| **"estimated"** | a modelled figure, not an actual |
| **"stale fix"** | position older than expected |
| **"thinned"** on a route | the track was sampled for display |

If you see a **0** on something you know has no inputs, that is a bug
worth reporting.

Fleet Health is a weighted score built from hard-coded benchmarks
(10 km/L, $200 per expense, 100 km per trip). Treat it as a relative
indicator over time, not an absolute grade — and if those benchmarks do
not suit your fleet, say so, because they are a product decision rather
than a measurement.

---

## 9. Common problems

| Symptom | Cause |
|---|---|
| "I saved it and it vanished" | recorded against a vehicle in another branch; it went to that branch |
| "Vehicle not found" on a plate you can see | the vehicle is outside your org unit |
| "More than one active vehicle carries this plate" | two vehicles share a plate; fix it in Vehicles |
| A whole module is empty | no org-unit assignment, or records predate the backfill — ask an administrator |
| Fuel efficiency shows "no data" | no odometer readings, or no trips |
| Trips are empty | no telemetry, or trip generation not running — ask an administrator |
| Cost per km looks too low | costs may not be posting; ask an administrator to check the ledger |

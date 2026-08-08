# FLEET — UNIFIED SPECIFICATION (SYNTHESIS BUILD)

**Status:** decision-ready draft. Sections marked **[YOUR CALL]** are deliberately unresolved.
**Grounding:** this is not greenfield. It assumes the existing Fleet codebase — Next.js 15 App Router, React 19, TypeScript, MongoDB via the raw driver, ~270 API routes, 57 collections, BullMQ workers, CQRS command/query buses, `server/tenancy/tenant-scope.ts`, and `module-scope.registry` as the tenancy source of truth.

---

## 0. READING NOTES — THREE CORRECTIONS BEFORE THE SYNTHESIS

**0.1 You have three proposals, not four.**
Document 2 ("GPT-5.6 LUNA") is not a product proposal. It is a 100-section *requirements prompt* — a challenge brief instructing a model to produce a design. It contains almost no decisions of its own: it specifies section headings, demands ("define formulas, not arbitrary scores"), and an example navigation tree. Treating it as a peer proposal would let a rubric masquerade as a design.

That said, it is the most valuable of the four documents — as an **acceptance checklist**, not a design. Its §49 (multi-tenancy layer list), §91 (never-leak requirement), §67 (data quality), §90 (edge cases), and §13 (no arbitrary scores) are the sharpest requirements in the whole set, and §49/§91 map directly onto work you have already done. I've used it as the test oracle throughout and cite it as `[REQ §n]`.

**0.2 The competitor set in all three proposals is wrong for your actual market.**
Every proposal benchmarks against Samsara, Geotab, Motive, Verizon Connect, Lytx. Your database says something different: five tenants including Willsgrove Farm Enterprises and two distinct Toyota Zimbabwe orgs, with Harare and Bulawayo branch scoping. If your beachhead is Zimbabwe / Southern Africa, the real incumbent set is **Cartrack (Karooooo), Tracker, MiX by Powerfleet, Ctrack, Netstar** — five domestic players holding roughly 70% of installed FM systems in South Africa, with Cartrack alone past 500,000 active units. Samsara and Motive are effectively absent.

This is not a cosmetic correction. It invalidates a large fraction of DeepSeek's spec (IFTA, FMCSA ELD/HOS, ADP/Gusto payroll, Progressive/Liberty Mutual insurance APIs, Verra carbon credits, OCPP depot charging) and it **improves** your strategic position, because the regional incumbents are largely stolen-vehicle-recovery and basic-tracking businesses. A significant share of the installed base is low-end tracking. The financial-intelligence layer above them is genuinely unoccupied.

**→ Confirm or correct the beachhead market before Section 2 is finalised.** If the target is actually US/EU, Section 10 (pricing) and the compliance module change substantially.

**0.3 Nobody proposed multi-currency, and you cannot retrofit it cheaply.**
Three proposals give detailed cost engines. None store a currency, an FX rate, or a rate date. In a USD/ZWG dual-currency environment with material inflation, a cost-per-km number without an explicit FX policy is not just imprecise — it is unauditable, and it destroys the CFO positioning the whole product rests on. This is a schema decision (Section 8.5) that must land before the first expense row is written under the new model.

---

## 1. WHAT SURVIVED, WHAT DIDN'T

| Source | Ideas kept | Ideas rejected |
|---|---|---|
| **Claude / FleetPulse** | Event-based GPS logging; unified urgency score; interpretable GBT + `top_3_contributing_signals`; decaying safety penalties; incremental VRP re-solve; colour semantics discipline; typed confirmation on destructive actions | Insurance-partner underwriting integration as an MVP item (no regional partner exists yet) |
| **Gemini** | Mapbox dark-tile map with right-hand drawer instead of page navigation; fuel-workbook ETL as a first-class ingest surface; mileage-driven PM thresholds; driver PWA for DVIR; S3 defect photos | 5-second fixed-interval GPS + per-ping WebSocket fanout; Python/Colab as the ETL runtime; "MongoDB is mandatory because relational breaks under variance" |
| **DeepSeek / Fleet Vantage** | Evidenced value ledger with confidence tiers; auditor-exportable ROI report; on-device buffering for offline resilience; physics-based energy/consumption modelling; conflict-resolver dispatch panel; anonymised cross-fleet base model | Hyperledger Fabric; carbon-credit monetisation; performance-pay/payroll writes; driver churn prediction; facial recognition; proprietary camera hardware; ±3% range accuracy claim; auto-booking repairs at >85% probability |
| **LUNA (requirements)** | Used as acceptance checklist: §13, §49, §67, §90, §91 | Everything else — it is a prompt, not a design |

---

## 2. PRODUCT VISION AND TARGET CUSTOMER

**What it is.** The system of record for fleet unit economics. Fleet answers one question the incumbents cannot: *what does each vehicle actually cost per kilometre, why did that number move, and what is the single most expensive thing we should fix today?* Everything else in the product exists to make that number trustworthy or to act on it.

**Positioning statement.** Trackers tell you where the vehicle is. Fleet tells you what it costs — and it does so on top of the tracker you already bought.

**Target customer (beachhead).** Mixed fleets of 150–2,000 vehicles that (a) already run one or more telematics providers, (b) have a finance function that reports fleet cost upward, and (c) cannot currently reconcile fuel spend to vehicle utilisation without a spreadsheet. Agriculture, distribution, mining services, construction, and dealer/OEM captive fleets fit. Your existing tenants are exactly this shape.

**Why the wedge works.** The regional incumbents sell hardware subscriptions. Their software is a tracking console with reports bolted on. They have no incentive to become an intelligence layer over *competitors'* hardware — doing so cannibalises their own device attach. That structural conflict is the moat entrance: Fleet is the only party that can read Cartrack, Ctrack and MiX feeds in the same tenant and produce one reconciled cost-per-km. This is also the single most important reason **not** to build hardware (Section 7.5).

**Merged philosophy.** LUNA's `Observe → Understand → Predict → Recommend → Act → Automate → Measure` is the right spine, but only if the last arrow closes. In practice that means one implementation rule, which is the architectural centre of this document:

> Every module emits candidates into one ranked attention queue. Every resolution of an attention item writes an evidenced record into one value ledger. If a feature cannot emit into the queue or write to the ledger, it is not part of the loop and it should be justified separately.

---

## 3. CORE FEATURE SET (VALIDATED TABLE STAKES)

All three proposals independently specified these. Treat as non-negotiable scope.

| Capability | Convergent detail | Note |
|---|---|---|
| Vehicle register + digital twin page | Header identity/status/health/driver; tabbed Overview, Maintenance, Trips, Fuel, Costs, Documents, Timeline | Costs tab is first-class, not a report export (Claude's rationale: it's the number managers report upward) |
| Live map with state-coloured pins, clustering, click-to-drawer | Green on-route, amber idle, red alert, grey offline; cluster smart-expand; right-hand drawer, never page navigation | Gemini + DeepSeek agree on drawer; your `MapsWidget` is still a placeholder |
| DVIR with per-defect photo → auto work order | Large tap targets, photo per defect, "out of service" routes straight to the manager queue | All three. Strongest table stake in the set |
| Fuel transaction ingest + anomaly detection | Multi-sheet vendor workbook upload; card↔vehicle reconciliation; flag purchase-while-parked, duplicate, impossible-volume, geographic mismatch | Gemini + DeepSeek + REQ §27 |
| Mileage/hours-driven preventive maintenance | Threshold crossing → status change → pending work order | Gemini explicit; DeepSeek implicit |
| Work order lifecycle | Issue → diagnosis → estimate → approval → parts → repair → inspection → close → cost | REQ §29; approval gate is where your procurement scoping bug lived |
| Document expiry tracking with escalation | Licence, registration, insurance, permits, certifications; escalation ladder not a single reminder | All three |
| Driver behaviour scoring | Harsh braking, acceleration, cornering, speeding, idling | All three — see 5.4 for the scoring method that survived |
| Role-differentiated surfaces | Executive / Manager / Dispatcher / Technician / Driver | All three; you already have this shell |
| Audit trail: who, what, when, before, after, source, reason | | REQ §66 |

---

## 4. DIFFERENTIATORS — THE FIVE THAT EARN THE PRICE

### 4.1 The unified attention queue with a tunable, back-testable score
**Source:** Claude/FleetPulse §4.3, extended. Demanded by REQ §13 ("do not use arbitrary scores").

Incumbents split alerts by module, so a manager cross-references three panels to answer "what do I deal with first". One ranked queue does the triage instead.

Claude's formula is the right shape but I would not ship it as written:

```
urgency = 0.5·severity + 0.3·time_sensitivity + 0.2·cost_impact
```

Two defects. First, a linear weight on `time_sensitivity` cannot express that a cheap item irreversible in two hours outranks an expensive item due in three weeks — deadline pressure is convex, not linear. Second, `cost_impact` normalisation is where all the arbitrariness hides; a weighted sum of normalised heterogeneous quantities is a heuristic, and calling it a formula does not make it a model.

Ship it honestly instead:

```
time_sensitivity = exp(-hours_to_irreversible / τ)      # τ tenant-configurable, default 48h
cost_impact      = min(1, estimated_cost_delta / tenant_p95_incident_cost)
urgency          = w_s·severity + w_t·time_sensitivity + w_c·cost_impact
                   scaled by confidence ∈ [0,1]
```

- Weights are tenant-configurable with a shipped default profile.
- **Every score's inputs are persisted with the item.** That makes rank quality back-testable against what managers actually clicked and resolved, which is the only way to improve it without guessing.
- Confidence scales the score rather than being displayed beside it, so low-evidence items sink instead of shouting.

**Schema:** one `attention_items` collection. Every module emits `{severity, irreversible_at, estimated_cost_delta, currency, confidence, evidence_refs[], source_module, vehicle_id, org_unit_id}`. Nothing computes its own private priority.

**Beats the market because:** Samsara, Cartrack and Ctrack all present per-module alert lists. None expose a ranking they'll let you tune, and none can rank a maintenance risk against a fuel anomaly against a document expiry on a common cost axis.

### 4.2 The value ledger — evidenced, tiered, and honest about counterfactuals
**Source:** DeepSeek §4.7, with the blockchain removed and the missing half added.

Keep: every avoided cost or recovered amount is an immutable, evidenced, confidence-tiered record; drillable to the underlying invoice or transaction; exportable as a signed auditor-ready report. This is the single best commercial idea in the four documents, because it converts a software subscription into a defensible line item at renewal.

Drop Hyperledger Fabric entirely (Section 7.1).

Add what all three proposals omitted: **counterfactual attribution is the hard part and must be visible.** "We saved $3,400 versus an emergency repair" requires an emergency repair that never happened. So:

- Baseline tiers, recorded on each record: `T1` tenant's own trailing-12-month actuals for that failure mode → `T2` cohort median (min 5 tenants, 20 vehicles) → `T3` vendor-published or operator-declared. Tier is always shown.
- **Realised** (an invoice, credit note, or recovered amount exists) and **modelled** (counterfactual) values are stored and displayed in separate columns. They are never summed into one hero number. A single pulsating "$142,300 saved" ring, as DeepSeek specifies, is the fastest way to lose a CFO permanently — the first time one modelled figure is challenged, the whole ledger is discredited.
- Fuel-anomaly recoveries and warranty recoveries are the two categories that produce genuine `T1`-evidenced realised savings early. Lead with those.

### 4.3 Event-based telemetry capture — resolving the direct conflict
**Source:** Claude §4.1 versus Gemini §3A. This is the clearest disagreement in the set and the merge is better than either.

Gemini specifies a 5-second fixed-interval ping broadcast per-ping over WebSockets. That is wrong twice over. At 10,000 vehicles it is 172.8M points/day (~17GB/day raw before indexes) of mostly redundant straight-line highway positions — and simultaneously **too coarse to reconstruct the events you're selling**, because a hard-braking event completes inside one 5-second window. And a per-ping fanout puts ~100 messages/second on a browser holding 500 vehicles in viewport.

Claude's device-side triggers are correct: log on heading change >8°/s, speed delta >5mph/s, plus a 30s heartbeat so gaps never exceed 30 seconds.

**The synthesis: these are two different problems.**

- **Record of truth** = event-triggered logging. Sharp events captured precisely, straight-line driving compressed. Trip replay becomes genuinely smooth rather than interpolated between sparse fixed points, which is a real UX benefit falling out of the storage decision.
- **Live view** = server-side aggregation into a ~1Hz positions *diff* per subscribed viewport, not a per-ping fanout. The live map does not need 5-second fidelity; it needs to not stutter.

Caveat, stated because it changes the sequencing: **in an integration-first model you do not control the device.** Cartrack, Ctrack and MiX emit on their own cadence. Event-based logging is therefore a *normalisation target* for MVP — you derive events from whatever the provider gives you and record derived events plus retained raw — and only becomes a device-side control if you ever ship hardware. Do not promise event-fidelity replay on a provider feed that ships 60-second fixes.

### 4.4 Mixed-vendor telematics normalisation as the moat, not the AI
**Source:** synthesis of Claude's global-base-model-plus-per-fleet-fine-tune and DeepSeek's transfer-learning-per-customer. Both converged; ranked #1 among moats here.

The defensible asset is not the model. Everyone has model access. The asset is a **normalised, cross-tenant corpus of failure modes and cost outcomes indexed by make/model/duty-cycle/road-condition**, plus the boring adapter layer that makes five incompatible provider feeds comparable. A new tenant benefits from fleet-wide failure patterns on day one instead of waiting months for their own data. A competitor with more engineers cannot buy that corpus.

Ranked moat order — argue with this, but it is my honest ranking:
1. Cross-fleet normalised cost and failure benchmarks (compounds with every tenant; not replicable)
2. Mixed-vendor telematics normalisation layer (boring, unglamorous, extremely high switching cost)
3. The attention→ledger closed loop as workflow lock-in (renewal-proof)
4. Integration breadth (fuel cards, ERP/accounting, provider APIs)
5. AI and UI (necessary, not defensible)

**Legal prerequisite, and this must be in the contract from day one:** cross-tenant training requires explicit rights in the MSA/DPA. Most enterprise agreements as drafted prohibit it, and retrofitting consent across a signed base is close to impossible. Also enforce a k-anonymity floor on every benchmark output (no cohort statistic rendered below ~5 tenants / 20 vehicles), or you are leaking one customer's unit economics to a competitor in the same cohort — which is both a contract breach and, for two same-name Toyota Zimbabwe tenants in your own database, a live risk today.

### 4.5 Fuel as the primary financial surface — regionally correct, and validated
**Source:** Gemini's ETL pipeline + DeepSeek's card reconciliation + REQ §27.

All three proposals treat fuel as one module among twenty. In a market where fuel is the dominant controllable cost and fuel-card fraud is the dominant loss vector, it is the wedge feature and it should be disproportionately good.

- Multi-sheet vendor workbook ingest with column mapping, preview, validation, duplicate detection, per-row error reporting, and **rollback with audit** [REQ §69]. Your existing import surface is the natural home.
- Card↔vehicle↔driver reconciliation as a first-class entity with its own exception queue.
- Anomaly rules that produce evidence, not scores: purchase while vehicle logged stationary; volume exceeding tank capacity; two purchases inside a geographically impossible interval; card used outside assigned vehicle's operating region; consumption deviation versus the vehicle's own trailing baseline normalised for load and route.
- Every anomaly emits an `attention_item` and, when confirmed and recovered, a **realised** `value_ledger` record. This is the fastest path to a `T1`-evidenced ROI number, which is what makes the ledger credible before any prediction has had time to be proven right.

---

## 5. DECISIONS THAT ARE YOURS **[YOUR CALL]**

### 5.1 Telemetry storage: stay all-Mongo, or add a purpose-built store?

Gemini says MongoDB, mandatory. DeepSeek says TimescaleDB + PostGIS + Neo4j + Kafka + Flink on Kubernetes. Gemini's justification is wrong on the merits — "relational databases break under attribute variance" is answered by JSONB, and the real issue is *sparse attributes*, not relational impossibility. DeepSeek's stack is a full rewrite of your 117k-line application.

The framing that dissolves the argument: you have three workloads, not one.

| Workload | Access pattern | Mongo verdict |
|---|---|---|
| Transactional (orgs, vehicles, work orders, expenses, users) | Point reads, moderate joins, needs multi-document transactions | Acceptable. You have it. Keep it. |
| Telemetry (positions, engine samples, events) | Append-heavy, time-ordered, range-scanned, retention-tiered | Poor. Time-series collections help but retention tiering, continuous aggregates and geospatial range scans are not strengths |
| Analytics (cross-fleet aggregation, benchmarks) | Columnar scans over months | Poor at scale; aggregation pipeline hits a wall |

**The decisive fact: you have no telemetry collection today.** So choosing a purpose-built store for telemetry is *additive, not a migration*. Nothing moves. That removes almost all the risk from the only part of DeepSeek's stack that's genuinely justified.

- **Option A — all Mongo (time-series collections).** One datastore, one ops surface, one backup story, zero new skills. Fine to ~1,000 vehicles on a normalised (event-derived) feed. Will hurt at analytics before it hurts at ingest.
- **Option B — Mongo for transactional, TimescaleDB (or ClickHouse) for telemetry and analytics.** Correct at scale; hypertables, retention policies and continuous aggregates are exactly this shape. Costs you a second datastore, a second migration discipline, and cross-store joins in the reporting layer — where you *just* finished fixing a tenancy leak.

**My recommendation:** Option A for MVP, with every telemetry write behind a repository interface so Option B is a swap rather than a refactor. Set the trigger in advance — first of (a) telemetry >50M rows, (b) p95 trip-replay query >1.5s, (c) a benchmark query you cannot express in the aggregation pipeline.

**Reject Neo4j outright** regardless of which option you pick. DeepSeek's "digital twin graph" is a fixed 6-level hierarchy (org→branch→department→fleet→vehicle→driver). You have no variable-depth traversal problem. You already implemented this as `path` arrays with an `accessibleOrgUnitIds` closure, and it works. A fourth datastore for a fixed-depth tree is unjustified operational cost.

### 5.2 Modular monolith or microservices?
Gemini: Next.js API routes. DeepSeek: K8s microservices + Kafka + Flink + GraphQL federation. You have 270 routes in a modular monolith with CQRS buses and BullMQ workers — which is the right shape for your team size, and the CQRS separation already gives you most of the seam value without the distributed-systems tax.
**Recommendation:** keep the monolith. Extract exactly one service when telemetry ingest justifies it, and let Kafka in only when a single-consumer BullMQ queue demonstrably cannot keep up. Every proposal that reached for Flink was designing for a scale you do not have and a team you do not have.

### 5.3 Python service, or Node-only?
Gemini specifies Python "prototyped and tested in Google Colab" as the ETL pipeline. Colab is a notebook, not a runtime — flagged in Section 7. But the underlying claim, "Node isn't ideal for heavy data crunching", deserves a straight answer: for parsing multi-sheet xlsx workbooks it is simply false. SheetJS in a BullMQ worker handles it, and you avoid a second runtime, a second deploy target, and a second dependency-audit surface.
**Recommendation:** Node for ingest and ETL. Introduce Python only when you are training models (gradient-boosted trees, survival analysis), as an isolated inference service behind an HTTP contract — not as a general-purpose "data" tier.

### 5.4 Driver scoring: how hard do you push it?
Claude's method is the one to implement: capped per-category penalties so no single event tanks a score, with penalties **decaying** across a 30-day trailing window rather than dropping off a cliff, so scores move smoothly instead of jumping day to day. That's a real UX complaint about incumbents and it's cheap to fix.
The open question is not the algorithm, it's the **consequence**. DeepSeek attaches pay to it. That's Section 7.4. Options: score visible to manager only; visible to driver as self-coaching; or input to a formal disciplinary process. The third makes you a party to employment decisions and requires an appeal path, evidence retention, and defensible calibration.
**Recommendation:** manager-visible plus driver self-view for MVP. No pay linkage. No automated disciplinary trigger.

### 5.5 Pricing model — three incompatible proposals
See Section 10 for the reconciled plan and the reason the DeepSeek guarantee is dangerous. The genuine tradeoff is transparent list pricing (Claude: trust-first, published) versus enterprise-negotiated opacity, and it is a go-to-market decision more than a product one.

### 5.6 Driver app: PWA or native?
Gemini says PWA. Fortunately the integration-first choice mostly resolves this: if trip tracking comes from vehicle telematics rather than the phone, the driver app only needs foreground DVIR, camera, document viewing, and offline queueing — all of which a PWA does well. If you ever need continuous background location from the handset, iOS PWA limitations make native unavoidable.
**Recommendation:** PWA, and treat "we need background location from the phone" as the explicit trigger to reconsider.

### 5.7 AI: LLM copilot scope
DeepSeek and REQ §42 both want a natural-language assistant. Claude's proposal has no LLM at all and is stronger for it.
**Recommendation:** the LLM is a **query planner over a governed semantic layer, never a calculator.** It translates a question into a parameterised query against the same scoped repositories the UI uses — inheriting tenant scope automatically rather than being separately authorised — then narrates the returned rows. It never computes a figure, never writes, and refuses when the semantic layer has no expression for the question [REQ §94]. Every response carries the query it ran and the row count, so it is auditable. This is far less impressive in a demo and far less likely to state a wrong currency-converted cost number to a CFO.

---

## 6. SYSTEM ARCHITECTURE

```
PROVIDER FEEDS (Cartrack / Ctrack / MiX / Netstar / generic OBD, AIS-140, FMS)
        │  poll + webhook adapters, per-provider
        ▼
NORMALISATION LAYER ──────────► provider-agnostic canonical event schema
        │                       (position, trip, ignition, fault, odometer, fuel-level)
        │  validation & data-quality gates [REQ §67]
        ▼
INGEST WORKERS (BullMQ)  ──► telemetry store (see 5.1)
        │                     raw retained + derived events
        ▼
DOMAIN SERVICES (existing modules/*) ── CQRS command/query buses
        │
        ├─► COST ENGINE  (allocation ledger — Section 8.5)
        ├─► HEALTH ENGINE (interpretable model + rules)
        ├─► ANOMALY ENGINE (fuel, odometer, GPS, duplicate)
        │
        └─► all of the above emit ──► attention_items  (one ranked queue, §4.1)
                                          │
                                    resolution
                                          ▼
                                     value_ledger  (evidenced, tiered, §4.2)
        │
        ▼
SCOPED READ LAYER  ── tenant-scope.ts + module-scope.registry + orgUnitPredicate
        │              (single choke point: UI, API, reports, exports, AI, WS)
        ▼
EXPERIENCE  (Next.js app shell, role-reduced dashboards, Mapbox, PWA, palette)
```

**6.1 Isolation — the part you already know is hard.** [REQ §49, §91]
Two new cross-module aggregate surfaces are being introduced — `attention_items` and `value_ledger` — and cross-module aggregates are precisely the class that leaked twice in this codebase already (the anomaly severity counts, then `ReportQueryEngine.run()` building `$match` without `orgUnitId`). Non-negotiables:

- Both collections registered in `module-scope.registry` as **SCOPED**, with written rationale, before either ships.
- Scope predicate spread **last**, as in the Phase H fix — `orgUnitId` will be an exposed filterable field on the attention feed, so scope must own the key.
- Fail closed on an empty accessible-unit set.
- Out-of-scope single reads return **404, not 403** — 403 confirms existence and is itself a leak.
- Cache keys include the full scope hash. A branch-scoped user must not warm a cache an org-wide user reads.
- WebSocket channels authorised at subscribe **and** re-authorised on permission change; short-lived channel tokens rather than long-lived subscriptions.
- Adversarial CI tests per REQ §91: for every endpoint, authenticate as tenant A, request tenant B's real IDs, assert 404. Your existing pattern of re-injecting each original bug to prove the test catches it is the right discipline — extend it, don't restart it.

**6.2 Prerequisites in the current codebase.** Three things in your outstanding list become load-bearing the moment a financial ledger exists:
- `ignoreBuildErrors: true` with 83 type errors is acceptable for a tracking console and not acceptable under a ledger that a CFO reconciles to their GL. This should gate the cost engine, not follow it.
- The `_id` type lie in `BaseRepository.findMany` (declaring `string`, returning `ObjectId`) is exactly the class of bug that silently no-ops an `updateOne({_id: doc._id})` — and a no-op on a ledger posting is a reconciliation defect you will find months later. The 20 affected call sites must be fixed in the same change as the normalisation, as previously established.
- Sentry is non-functional (`@sentry/nextjs` v6 against Next 15). Shipping predictive and financial features without error telemetry [REQ §85] means you learn about wrong numbers from customers.

---

## 7. FLAGGED — DO NOT BUILD WITHOUT ADDRESSING THESE

### 7.1 ⚠️ Hyperledger Fabric ROI ledger — REJECT
DeepSeek makes the value ledger immutable via a private blockchain. There is no second party validating the chain; you write it, you host it, you could rewrite it. It therefore provides exactly the guarantee of an append-only collection with hash-chained records and signed exports, at the cost of a distributed consensus system to operate. This is resume-driven architecture. **Replacement:** append-only postings, each record hash-chaining the previous, periodic signed anchor, exports signed with a published key. Same auditor value, no new runtime.

### 7.2 ⚠️ Carbon credit monetisation — NO CLEAR REVENUE PATH
DeepSeek proposes pooling EV-mile reductions into verified credits via a registry and auto-selling them. Problems: grid-charged EV miles rarely survive an additionality test; voluntary carbon market prices have been weak since the 2023–24 integrity crisis; and aggregating and selling credits on customers' behalf puts you into a regulated intermediary role you do not want as a seed-stage product. **Keep the reporting, drop the monetisation** — CO₂/km and Scope 1 reporting is a real, paid, dull need with no regulatory downside.

### 7.3 ⚠️ Driver-facing camera + facial recognition — LEGAL RISK, HIGH
DeepSeek's in-cab IR camera with facial recognition for driver identification is the most legally exposed idea in the four documents. Biometric identifiers attract dedicated statutes with private rights of action in several US states and Article 9 special-category treatment under GDPR and comparable regimes; consent from an employee is weak consent because the power asymmetry undermines it. **Replacement:** identify drivers by fob, PIN, or BLE pairing. If you ever ship cameras, road-facing only, event-triggered upload, and a documented retention schedule — and get local counsel on works-council and labour-law exposure before a single unit ships.

### 7.4 ⚠️ Performance-linked pay and payroll writes — LEGAL RISK, HIGH
DeepSeek's "My Wallet" tab computes bonuses from platform metrics and writes earning codes to payroll. If your software determines pay, you are inside the customer's wage-and-hour compliance chain: overtime base-rate calculation, unionised-fleet collective agreements, and the "points redeemable for extra PTO days" idea, which has a vendor granting a statutory/contractual employment entitlement. **Replacement:** compute and export a *recommendation* the customer's payroll owner approves. Never write to payroll. Never denominate rewards in employment entitlements.

### 7.5 ⚠️ Proprietary edge hardware and camera — STRATEGICALLY WRONG FIRST MOVE
DeepSeek's VantageEdge gateway and 3-lens VantageCam is a correct architecture for a company that has raised nine figures. For you it means inventory, working capital, RMA logistics, regulatory certification, firmware OTA, and import duty — and it puts you head-on against incumbents whose entire business is device manufacturing at scale, in a hardware-replacement sale rather than a software-addition sale. It also destroys the wedge in §4.4: the moment you sell devices you lose the credibility to be the neutral layer above everyone's devices. **Own hardware only where the data you need provably does not exist in any incumbent feed.**

### 7.6 ⚠️ Driver churn prediction — ADVERSE-INFERENCE PRODUCT
DeepSeek's XGBoost churn model surfaces a per-driver risk score to managers. This is an employment inference about a named individual, used in employment decisions — high-risk territory under the EU AI Act's employment classification, and disparate-impact exposure elsewhere. It also has no place in an early roadmap. **Cut it.**

### 7.7 ⚠️ Auto-booking repairs above 85% failure probability — NOT FEASIBLE AS SPECIFIED
Two problems. It commits customer money without human approval — REQ §44 says sensitive actions require approval, and this is the canonical example. And the "marketplace of certified workshops via API" it depends on does not exist; independent workshops in most markets have no bookable API, and this is more true in your beachhead, not less. **Replacement:** generate the recommendation with the cost comparison and a one-tap *confirm*, then send a structured request over whatever channel the workshop actually uses.

### 7.8 ⚠️ "EV range prediction within ±3%" — UNSUPPORTABLE CLAIM
Unknown payload, HVAC load, driver behaviour, terrain and battery ageing put real physics-model error in the high single to low double digits. Never publish an accuracy figure you cannot reproduce on a customer's fleet — one falsified claim discredits every other number in the product. Ship a prediction with an honest confidence interval and REQ §16's instruction: never pretend a score is scientifically precise if it isn't.

### 7.9 ⚠️ IFTA / ELD / HOS / insurance-partner APIs — WRONG JURISDICTION
US-specific and inapplicable to a Southern African beachhead. The regional analogues are different modules entirely: SARS travel logbooks, AARTO traffic fines and demerits, RTMS accreditation, e-toll reconciliation, and cross-border permits for regional haulage. **Do not port DeepSeek's compliance module. Rebuild it for the jurisdiction you're selling into.** Also note: "IFTA tax minimisation" advice edges into providing tax advice — the *filing automation* is the sellable part; the optimisation prompt needs disclaimers and a documented methodology.

### 7.10 ⚠️ Python-in-Colab as a production pipeline — NOT PRODUCTION
Colab is a hosted notebook: ephemeral, unversioned, unmonitored, no deploy story, no rollback. The instinct (heavy ETL belongs off the request path) is right; the implementation is not. See 5.3.

### 7.11 ⚠️ "1% raw sample to cloud" — TENSION WORTH NAMING
DeepSeek streams only derived events plus a 1% raw sample. Efficient, but you then cannot retrain on raw signal or defend a disputed event to a driver or an insurer. **Recommendation:** derived events always, plus full raw retained for a short hot window (7–14 days) around any flagged event, then aged out.

---

## 8. UI/UX DESIGN SYSTEM — ONE MERGED LANGUAGE

Gemini and DeepSeek both propose deep navy/obsidian canvases with electric cyan accents. Claude proposes blue primary with dark mode reserved for ops screens. The convergence is real (dark ops canvas, blue-family primary, Inter for UI, monospace for numerics) but on the one point where they conflict, **Claude's reasoning is the only one with a stated rationale and it wins.**

**8.1 The colour decision that governs everything else.** Gemini and DeepSeek both use cyan/green for *both* actions and positive status. That collision means colour alone can no longer signal state. Claude's discipline — blue for action so red/amber/green are reserved exclusively for status, and status is always colour + icon + text label — is the correct call and is also what makes WCAG 2.1 AA achievable rather than aspirational.

Also rejecting `#00E5FF` as primary: at 13px in a dense table on `#0B0F19` it glares over an eight-hour dispatch shift, which is the opposite of Gemini's stated reason for choosing dark mode.

**8.2 Tokens.** Semantic names, mode-dependent values [REQ §5].

| Token | Light | Dark | Note |
|---|---|---|---|
| `background.primary` | `#F3F4F6` | `#0D1117` | |
| `surface.default` | `#FFFFFF` | `#161B22` | |
| `surface.elevated` | `#FFFFFF` | `#1C2333` | |
| `border.default` | `#E5E7EB` | `#30363D` | |
| `text.primary` | `#0D1117` | `#E6EDF3` | |
| `text.secondary` | `#6B7280` | `#8B949E` | |
| `brand.primary` | `#1B4DFF` | `#5B7CFF` | **must differ by mode** — `#1B4DFF` on `#0D1117` is ~2.5:1 and fails AA. One hex cannot serve both modes; this is the most common token-system bug |
| `status.success` | `#16A34A` | `#3FB950` | |
| `status.warning` | `#D97706` | `#D29922` | |
| `status.error` | `#DC2626` | `#F85149` | |
| `status.info` | `#0891B2` | `#39C5CF` | |
| `intelligence.ai` | `#7C3AED` | `#A371F7` | AI-generated content always visually distinct from measured data — a trust requirement, not decoration |

Chart palette (deuteranopia/protanopia-checked): `#1B4DFF · #0891B2 · #D97706 · #7C3AED · #DC2626 · #16A34A`.

**8.3 Typography.** Inter variable for UI (tabular figures matter — odometers, plates, currency). JetBrains Mono for VINs, device IDs, API keys. Headings 28/22/18/16 SemiBold; body 14px/1.5; tables 13px with `tabular-nums` on. **All monetary and metric figures right-aligned with fixed decimal places** — the single highest-leverage typographic decision in a finance-facing product, and none of the three proposals mentioned it.

**8.4 Layout and components.** 8px base grid (8/16/24/32/48/64); 12-column desktop, 1440px max content, 24px gutters; driver PWA single column, 16px margins, critical actions anchored in the bottom 96px thumb zone.
- **Drawer over navigation** (Gemini + DeepSeek, validated): clicking a vehicle anywhere opens a right panel; it never leaves the current context.
- **Status chips** at 12% background opacity with full-opacity text and icon, never solid fill — solid fills turn a dense table into a wall of colour.
- **Flat cards by default,** shadow on hover only. Dashboards are dense; ambient shadow is noise at scale.
- **Typed confirmation** for destructive actions — type the vehicle ID to deactivate. Not "Are you sure?".
- Skeletons over spinners; every screen specifies loading / empty / error / partial-data / permission-denied / offline states [REQ §3].

**8.5 The financial schema nobody proposed — and it belongs in this section because it's a UI contract.**
Three proposals promise cost-per-km, P&L by vehicle/trip/branch, and TCO [REQ §35–36]. If those numbers are computed by summing whatever expense rows happen to exist, they will not reconcile to the customer's general ledger, and the CFO stops trusting the product in month two — which kills the entire positioning.

Minimum viable rigour:
- **Allocation ledger with immutable postings.** Corrections are new reversing postings, never edits.
- **Explicit allocation rules** per cost type: direct, per-km, per-day, per-engine-hour, driver-allocated. The rule applied is stored on the posting, so any figure explains itself on drill-down [REQ §40].
- **Depreciation is tenant policy, not a formula** — straight-line / declining-balance / units-of-production, matching the customer's own books. A hardcoded depreciation curve makes your TCO permanently un-reconcilable.
- **Currency on every posting**: `{amount, currency, fx_rate, fx_rate_date, fx_source, reporting_amount}`. Reporting currency and FX policy (transaction-date rate vs period-average) configured per tenant. Non-negotiable in a dual-currency, high-inflation market — and impossible to add later without reprocessing history.
- **A reconciliation report** that ties platform totals to GL totals with a named variance. This single report is what converts you from "a dashboard finance doesn't trust" to system of record.

---

## 9. INFORMATION ARCHITECTURE

LUNA's §11 tree is 13 top-level groups and roughly 60 leaves. That is a navigation structure for a product with 60 built modules; you have just finished removing eight dead links from a sidebar. Collapse it to seven, role-reduced from one shell — the pattern you already implemented — and let modules earn their place.

```
COMMAND CENTRE          ranked attention queue + fleet status + live map
OPERATIONS              Live Map · Trips · Dispatch*
FLEET                   Vehicles · Vehicle Health · Documents · Lifecycle
PEOPLE                  Drivers · Safety · Assignments
COSTS                   Fuel · Expenses · Cost per km · Budgets · Value Ledger
MAINTENANCE             Work Orders · Schedules · Parts* · Workshop*
INSIGHTS                Reports · Benchmarks · Anomalies · Ask Fleet*
ADMIN                   Organisation · Users · Roles · Integrations · Audit · Billing
```
`*` = roadmap, hidden until built. Never render a nav item that 404s.

**Command Centre is the ranked queue, not a KPI wall** [REQ §12]. Top: six fleet-status counts. Left/centre: the attention queue, one prioritised list. Right: map. Bottom strip: value ledger month-to-date, split realised versus modelled. The queue is the screen; everything else is context for it.

---

## 10. BUSINESS MODEL AND PRICING

**10.1 Reconciling three conflicting models.**
- DeepSeek: full refund if a 50+ vehicle fleet doesn't net $100k in 12 months.
- Claude: transparent published pricing as a trust signal, not gated behind "contact sales".
- Gemini: silent on revenue entirely.

**10.2 Kill the refund guarantee.** ⚠️ It is not merely risky, it is structurally unworkable, and the reason is specific rather than general:
1. **Attribution is unwinnable in arbitration.** You are asserting counterfactual savings. The customer disputes the baseline. You now litigate a modelled number.
2. **Adverse selection.** The fleets most attracted to a guarantee are the ones least likely to act on recommendations — and realising the savings requires *their* operational change, not yours.
3. **Revenue recognition.** A refund contingency makes the fee variable consideration under ASC 606/IFRS 15. You cannot recognise revenue you may have to return, which means your reported ARR understates the business precisely when you're raising against it. This is the reason sophisticated buyers rarely see this structure — not squeamishness about the promise.
4. It is trivially gamed by a customer who simply doesn't act.

**Replacement that keeps the commercial force without the exposure:** a contractual **Value Review at month 9** — you deliver the signed ledger export, and if documented realised value is below an agreed threshold the customer has a defined right to renegotiate scope or exit at renewal without penalty. Optionally, an outcome-linked component capped at a small single-digit percentage of ACV, on *specifically attributable realised* line items only: recovered fuel-fraud losses and recovered warranty claims. Those have invoices. Nothing modelled is ever billable.

**10.3 Pricing structure, anchored to the actual market.** Regional incumbents sit at roughly **R89–R399 per vehicle per month**, hardware-bundled. That anchor matters more than any US benchmark:

- **Core** — register, documents, expenses, fuel ingest, work orders, one provider integration. Priced at the low-to-mid incumbent band. Software only; the customer keeps their existing tracker subscription.
- **Intelligence** — attention queue, cost-per-km engine, anomaly engines, benchmarks, value ledger. Priced *above* the incumbent premium band, because it is not competing with tracking; it is competing with the finance analyst and the spreadsheet.
- **Enterprise** — multi-org, SSO, custom integrations, API access, SLA. Negotiated.

**The ACV arithmetic, stated plainly because it determines who you sell to.** Your stated target is $100k+/year. At incumbent-adjacent ~$15/vehicle/month that is ~550 vehicles. At a defensible intelligence-layer ~$45/vehicle/month it is ~185 vehicles. **The second is only reachable if the product genuinely owns the cost-per-km answer** — which is exactly why Section 8.5 (allocation ledger, FX, GL reconciliation) is not an accounting nicety but the load-bearing wall of the price.

**10.4 Publish list pricing for Core and Intelligence.** Claude's argument holds: in a market where incumbents quote on request, a published price is a differentiator that costs nothing. Gate only Enterprise.

---

## 11. MVP SCOPE — RUTHLESS

The MVP is one coherent thread, not a feature list: **make cost-per-kilometre trustworthy, rank what to fix, prove the saving.** Everything in scope serves that sentence.

### MUST BUILD
1. **Prerequisites first.** Deploy the `authorize()` fix; rotate the archive credentials; fix Sentry; retire `ignoreBuildErrors` on the paths the cost engine touches; fix the `_id` type lie with all 20 `updateOne` call sites in the same change.
2. **One telematics integration** — a single provider (whichever your existing tenants already run), behind the normalisation layer from day one. This single item unlocks positions, trips, and odometer, which unlocks everything financial. It also replaces the `MapsWidget` placeholder with something real.
3. **Cost engine with allocation ledger, multi-currency and FX policy** (8.5). This is the product.
4. **Fuel ingest + reconciliation + four anomaly rules.** Fastest path to an evidenced, realised saving.
5. **`attention_items` — one queue, tunable weights, persisted score inputs, registered SCOPED.**
6. **`value_ledger` — realised versus modelled, separated, drillable, exportable.**
7. **Mapbox live map with drawer**, positions from the provider feed.
8. **Mileage-threshold preventive maintenance → work order.**
9. **Driver PWA: DVIR + defect photo → S3 → manager queue.** Offline queueing.
10. **Twelve fixed reports + CSV export.** Not a report builder.
11. **Adversarial tenancy tests extended to both new collections**, before either ships.
12. **GL reconciliation report.**

### SHOULD BUILD (next)
Second and third provider integrations (this is where the moat starts compounding). Driver behaviour scoring with decaying penalties. Document expiry escalation ladder. Interpretable failure model with `top_3_contributing_signals` once you have ~6 months of normalised history. Command palette extensions.

### LATER
Dispatch and route optimisation (OR-Tools, incremental re-solve — both proposals agree, but it needs jobs and customers modelled first). Workshop bay scheduling. Parts and inventory. Cross-fleet benchmarks (needs tenant count and the k-anonymity floor). Report builder. LLM query planner. EV and energy module.

### DO NOT BUILD
Blockchain anything. Carbon credit monetisation. Driver-facing cameras or biometrics. Performance pay or payroll writes. Churn prediction. Proprietary hardware. Reinforcement-learning dispatch. Auto-booked repairs. US compliance modules. Native mobile before the PWA hits a real wall.

---

## 12. HOW YOU KNOW IT WORKS

| Claim | Evidence required before it ships |
|---|---|
| Tenant isolation holds | Per-endpoint adversarial test: authenticate tenant A, request tenant B's real IDs, assert 404. Each historical bug re-injected to prove the test catches it. Extends your existing 181-test suite |
| `attention_items` doesn't leak | Same, plus an aggregate-count test — the trap that caught the anomaly severity counts |
| `value_ledger` export doesn't leak | Same, plus a `ReportQueryEngine`-class test on the export path specifically. That path has leaked once |
| Cost-per-km is correct | GL reconciliation report on a real tenant with a named, explained variance |
| FX handling is correct | Golden-file test: known transactions across a rate change, asserted reporting-currency totals |
| Anomaly rules are useful | Precision/recall against operator-labelled historical fuel data. Ship none below ~70% precision — a noisy fraud alert trains managers to ignore the queue, which breaks the whole product |
| Urgency ranking is useful | Persisted score inputs back-tested against resolution order over 30 days. If managers systematically skip the top item, the weights are wrong |
| Ledger figures are defensible | Every record carries baseline tier and evidence refs; a sampled audit reproduces each figure from source documents |
| Telemetry scales | Load test at 10× current vehicle count; p95 trip-replay under 1.5s; documented Option-B trigger |

---

## 13. OPEN QUESTIONS FOR YOU

1. **Beachhead market — Zimbabwe/Southern Africa, or wider?** Governs the compliance module, the competitor set, FX handling, and the entire pricing anchor. Highest-leverage answer in this document.
2. **Telemetry store — Option A or B (§5.1)?** Additive either way; a repository seam keeps it reversible.
3. **Which telematics provider is integration #1?** Should be whichever your live tenants already run.
4. **Reporting currency policy** — transaction-date rate or period-average? Per tenant or global?
5. **Driver score consequence (§5.4)** — manager-visible only, or does it feed a formal process?
6. **Published pricing, or quote-on-request?**
7. **Cross-tenant training rights** — is language in the MSA/DPA now, or does the benchmark moat need to wait for a contract cycle?

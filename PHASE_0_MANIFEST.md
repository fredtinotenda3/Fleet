# Phase 0 — changed and new files

Copy these over your working tree, preserving paths. Nothing else in the
repository was modified.

Verified in an isolated copy of the uploaded archive:
`tsc --noEmit` 0 errors · `jest` 864/864 across 55 suites · `npm ci` succeeds.

## New (10)
```
server/middleware/cron-auth.ts                                   F-1 shared fail-closed guard
app/api/workflows/instances/[id]/route.ts                        F-4 restored instance route
app/api/workflows/instances/[id]/steps/[stepId]/approve/route.ts F-4 approve (had NO route)
app/api/workflows/instances/[id]/steps/[stepId]/reject/route.ts  F-4 reject  (had NO route)
tests/security/cron-auth-fail-closed.spec.ts                     F-1  24 tests
tests/security/workflow-authorization.spec.ts                    F-4  34 tests
tests/security/telematics-ingest-authorization.spec.ts           F-5  19 tests
tests/security/websocket-org-unit-isolation.spec.ts              F-7  14 tests
tests/security/no-committed-secrets.spec.ts                      F-6   6 tests
PHASE_0_SECURITY.md                                              operator documentation
PHASE_0_REMAINING_FINDINGS.md                                    out-of-scope findings
```

## Modified (30)
```
server/permissions/roles.ts                          +6 WORKFLOW_*, +TELEMATICS_INGEST, role grants
shared/validations/telematics.schema.ts              strict(), optional measurements, bounded timestamps
modules/workflows/services/workflow-engine.service.ts  fail-closed step authz; reject+cancel gated
modules/workflows/controllers/workflow.controller.ts   threads actor roles from auth context
infrastructure/observability/workflow-observer.ts      carries WorkflowActor through the decorator
modules/telematics/controllers/telematics.controller.ts  4 ingest gates
modules/telematics/services/telematics.service.ts      org-unit scoped emits
infrastructure/websocket/server.ts                     org-unit rooms, allow-listed subscriptions
scripts/count-fuellogs.ts                              hardcoded Atlas credential removed
package-lock.json                                      npm ci now succeeds (+9 transitive pkgs)

app/api/security/expire-grants/route.ts          ┐
app/api/reminders/update-status/route.ts         │ F-1 fail-closed
app/api/reminders/notify-overdue/route.ts        │ + POST alias
app/api/cron/eagletrack-sync/route.ts            │
app/api/workflows/process-timeouts/route.ts      ┘

app/api/workflows/route.ts                       ┐
app/api/workflows/[id]/route.ts                  │
app/api/workflows/instances/route.ts             │ F-4 withSession -> withAuth(permission)
app/api/workflows/instances/my-tasks/route.ts    │
app/api/workflows/metrics/route.ts               │
app/api/workflows/instances/[id]/steps/[stepId]/route.ts  ┘ now 410 Gone
app/api/telematics/ingest/route.ts               F-5 withAuth(TELEMATICS_INGEST)

CHANGELOG-eagletrack-capabilities.md             ┐
CHANGELOG-eagletrack-fuel-report-columnar.md     │ F-6 credential purge
CHANGELOG-eagletrack-production-fixes.md         │
manual-eagletrack-trigger-sync.md                ┘
tests/security/telematics-eagletrack-token-leak.spec.ts       ┐
tests/security/telematics-eagletrack-config-gating.spec.ts    │ F-6 synthetic fixtures
tests/unit/telematics/eagletrack-config-form-schema.spec.ts   ┘
```

## BEFORE YOU DEPLOY

1. **Set `CRON_SECRET`** (`openssl rand -base64 32`). Without it the five
   scheduled endpoints return 500 and do not run — see PHASE_0_SECURITY.md §1.
2. **Rotate three credentials** — Eagle Track token, MongoDB Atlas password,
   second vendor token. Removing them from the tree does not invalidate them.
3. Run `npm ci` to pick up the corrected lockfile.

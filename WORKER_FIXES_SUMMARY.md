# Worker Process Fixes — Summary

Final operational cleanup for the worker process: three issues fixed, verified against
the full test suite and `tsc`.

## Changed files

| File | Why |
|---|---|
| `server/scheduler/cron-engine.service.ts` | Replaced the flawed `CRON_PATTERN` regex with an `isValidCron()` helper backed by the `cron-parser` package. |
| `workers/bootstrap.ts` | Worker process now calls `bootstrapCqrs()` itself, so `BulkUpdateOverdueCommand` (and every other CQRS command/query) has a registered handler when jobs run. |
| `modules/reporting/repositories/report-template.repository.ts` | Replaced the rejected legacy `'system'` tenant sentinel with `PLATFORM_OWNER_TENANT_ID` in `createSystemTemplate()`. |
| `modules/reporting/services/report-template.service.ts` | `seedSystemTemplates()` now queries with `PLATFORM_OWNER_TENANT_ID` instead of `'system'`, matching what it now writes. |
| `package.json` / `package-lock.json` | Added the new `cron-parser` dependency (`^5.10.0`). |

---

## 1. Invalid cron expression errors

**Root cause:** `CRON_PATTERN = /^(\*|[0-9,\-/]+)(\s+(\*|[0-9,\-/]+)){4}$/` only matches a
bare `*` or a run of digits/commas/dashes/slashes per field. It never matches a literal
`*` immediately followed by `/N` (e.g. `*/6`), because the alternation forces each field
to be *either* a lone `*` *or* characters from `[0-9,\-/]` — and `*/6` is neither. Every
standard step-value cron expression was rejected.

**Fix:** Installed `cron-parser` (current major, `^5.10.0` — the package's own
`parseExpression` named export was removed as of v5; the current API is
`CronExpressionParser.parse()`, which is what the new code uses). Added an `isValidCron()`
helper:

```ts
function isValidCron(expression: string): boolean {
  if (typeof expression !== 'string') return false;
  const trimmed = expression.trim();
  if (!trimmed) return false;

  const fieldCount = trimmed.split(/\s+/).length;
  if (fieldCount !== 5 && fieldCount !== 6) return false;

  try {
    CronExpressionParser.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}
```

The explicit field-count check is necessary because `cron-parser` alone is more
permissive than we want — it silently accepts 4-field and even empty-string input.
`create()` and `update()` both now call `isValidCron()` in place of the old regex; no
other logic in the file was touched.

**Verified against exactly the four failing expressions plus edge cases:**

| Expression | Old regex | New `isValidCron` |
|---|---|---|
| `0 */6 * * *` | ❌ rejected | ✅ accepted |
| `*/15 * * * *` | ❌ rejected | ✅ accepted |
| `*/2 * * * *` | ❌ rejected | ✅ accepted |
| `*/5 * * * *` | ❌ rejected | ✅ accepted |
| `0 0 */2 * * *` (6-field) | n/a | ✅ accepted |
| `* * * *` (4-field) | — | ❌ rejected |
| `''` / `'   '` | — | ❌ rejected |
| `not a cron` | — | ❌ rejected |

All the default schedules in `server/scheduler/bootstrap-schedules.ts` (including the
exact strings from the bug report) were checked and now validate correctly.

---

## 2. `[CommandBus] No handler registered for command "BulkUpdateOverdueCommand"`

**Root cause was NOT a missing registration.** `BulkUpdateOverdueCommand` is correctly
wired in `modules/maintenance/cqrs.register.ts`, and `server/cqrs/cqrs.module.ts`'s
`bootstrapCqrs()` correctly calls `registerMaintenanceCqrsHandlers()`.

The actual bug: `bootstrapCqrs()` was only ever invoked from `instrumentation.ts`
(Next.js's `register()` hook), which runs when the **Next.js web process** starts. The
dedicated worker process, however, is started by `scripts/worker.js`:

```js
const { bootstrapWorkers } = await import('../workers/bootstrap.ts')...
await bootstrapWorkers();
```

This is a standalone Node entry point (per `docker-compose.yml`'s `worker` service) that
never loads Next.js's request pipeline or `instrumentation.ts`. So in that process,
`commandBus` (a `globalThis`-cached singleton) never got any handlers registered. When
`MaintenanceWorker`'s `check-overdue` job ran `maintenanceCommandService.bulkUpdateOverdue()`,
which calls `commandBus.execute(new BulkUpdateOverdueCommand(...))`, the bus had no
handler for *any* command — it just happened to surface first for this one because
`check-overdue` is the job that runs it.

**Fix:** `workers/bootstrap.ts` now imports `bootstrapCqrs` from `@/server/cqrs/cqrs.module`
and calls it as the first statement inside `bootstrapWorkers()`, before the `REDIS_URL`
check and before any worker starts processing jobs. `bootstrapCqrs()` is idempotent
(guarded by `global._cqrsBootstrapped`), so this is safe even if the process is later
changed to also load `instrumentation.ts` — it will simply no-op the second time.
Also corrected a stale comment further down in the same file that incorrectly claimed
`bootstrapEvents()` "runs at module load via instrumentation.ts before this function is
reached" — that assumption was the root cause and no longer holds (nor did it ever hold
for the worker process).

No changes were made to `server/cqrs/command-bus.ts`, `modules/maintenance/services/maintenance-command.service.ts`,
or `modules/maintenance/cqrs.register.ts` — all three were already correct.

---

## 3. Legacy sentinel tenant id `"system"` — one remaining instance found

Per your note, this was already fixed in most of the codebase (see
`server/tenancy/tenant-scope.ts`'s `assertUsableAsTenantId()`, which throws
`TenantScopeError` for `'default' | 'system' | 'super_admin'`). One instance was still
present, exactly where you suspected — reporting bootstrap/seed code:

- `modules/reporting/services/report-template.service.ts` → `seedSystemTemplates()`
  called `this.repo.findVisibleTo('system')`.
- `modules/reporting/repositories/report-template.repository.ts` → `createSystemTemplate()`
  called `this.create(data, 'system')`, which goes through `BaseRepository.create()` →
  `assertUsableAsTenantId('system')` → throws.

This fires during `bootstrapReporting()` at worker boot (`bootstrapWorkers()` →
`bootstrapReporting()` → `seedSystemTemplates()`), so system report templates were
failing to seed with exactly the "Rejected legacy sentinel tenant id \"system\"" error.

**Fix:** Both call sites now use `PLATFORM_OWNER_TENANT_ID` (`'__system_owned__'`) from
`server/tenancy/tenant-scope.ts` — the real, persistable "owned by the platform, not a
customer" value that replaced the old `'system'` sentinel elsewhere in the codebase (see
`cron-engine.service.ts`, which already used it correctly). The seed-detection query and
the seed-write now agree on the same tenant id, so re-running `bootstrapReporting()` on
every deploy correctly finds already-seeded templates instead of erroring.

**Other `'system'` occurrences checked and left alone** (not tenantId writes, or
explicitly documented as safe):
- Every other `tenantId: X, ... , 'system'` hit found by `grep` was `'system'` in the
  **userId** argument position (e.g. `auditLog`/service calls like
  `.update(id, data, tenantId, 'system')`), which is just a label, not a persisted
  tenant scope.
- `infrastructure/queue/queue.service.ts`'s `scheduleOverdueCheck()` sets
  `tenantId: 'system'` on a BullMQ job payload only — it's explicitly documented in an
  existing comment as a placeholder that `MaintenanceWorker` ignores in favor of
  `BackgroundJobScopeService`'s per-organization iteration, and it never touches
  persistence, so it was left untouched.
- `server/scheduler/background-job-scope.service.ts` and
  `server/events/handlers/observability/AlertNotificationHandler.ts` write
  `tenantId: 'system'` only into `auditLog.log()` calls, which persist through
  `AuditChainService.append()` — a separate write path that does not call
  `assertUsableAsTenantId()` and whose failures are already swallowed/logged, not thrown.
  Since the task scoped this fix to "reporting bootstrap or related seed code," these were
  left as-is to avoid unrelated behavior changes.

Redis connection errors at startup that then recover were left untouched, per your note.

---

## Verification results

```
$ npm run type-check
> tsc --noEmit
(no output — clean)

$ npm test
Test Suites: 78 passed, 78 total
Tests:       1325 passed, 1325 total
Snapshots:   0 total
Time:        24.045 s
```

`npm install` was run after adding `cron-parser`; `package-lock.json` is included with
the update.

## Manual steps needed

1. **Deploy both the web process and the worker process together** — the worker-process
   fix (`workers/bootstrap.ts`) only takes effect once the new worker image/process is
   deployed. No environment variables, migrations, or scripts need to be run.
2. If a database from a previous, broken deploy already has report templates half-seeded
   under the old `'system'` sentinel — unlikely, since `createSystemTemplate()` always
   threw before persisting anything — no cleanup is needed. If any stray
   `tblreporttemplates` rows exist with `tenantId: 'system'` from an even older version of
   this code, they will simply become invisible to `findVisibleTo()`'s new
   `PLATFORM_OWNER_TENANT_ID` query; they can be re-pointed with a one-off update if
   desired, but `seedSystemTemplates()` will not recreate duplicates regardless since it
   matches on template `name`.
3. No other manual steps. `npm install` / `package-lock.json` already reflects the new
   `cron-parser` dependency, so a normal `npm ci` picks it up.

## Excluded from the package

`.env`, `node_modules`, `.next`, and any real secrets are not included, per instructions.

# Command Centre "needs-attention" feed fix

## Files changed
- `modules/ai/controllers/ai.controller.ts` — added `bootstrapCqrs()` at module scope.
- `modules/intelligence/services/predictive-maintenance.service.ts` — **deleted**.
  This was already documented as dead/duplicate code in the repo's own
  `DELETED_FILES.txt` (a leftover the zip export couldn't represent as a
  deletion). Removing it is what makes
  `tests/security/predictive-maintenance-consolidation.spec.ts` pass;
  it is unrelated to the Command Centre bug itself and touches no
  chart/telematics/billing code.

## What I verified, concretely (not just by reading)
I extracted and ran the real project (`npm install`, `tsc --noEmit`,
the Jest security suite), and then wrote a throwaway integration
harness that invoked the *actual* `aiController.getNeedsAttention()`
handler — the real code, not a mock of it — with a signed JWT and
mocked-just-enough-to-get-past-auth repositories, for both a full-
visibility role and a scope-restricted `BRANCH_MANAGER`. In every run,
one thing showed up consistently in the logs:

    [QueryBus] No handler registered for query "GetOverdueRemindersQuery".
    Did you forget to call the module's register*CqrsHandlers() function?

`needsAttentionService.readMaintenance()` pulls overdue/upcoming
reminders through `maintenanceQueryService`, which routes through the
CQRS `QueryBus`. Every other controller in this codebase
(`vehicle.controller.ts`, `fuel.controller.ts`, `expense.controller.ts`,
`maintenance.controller.ts`, `trip.controller.ts`) calls
`bootstrapCqrs()` at module scope specifically so its handlers are
registered the instant that controller is first loaded, independent of
`instrumentation.ts`'s server-start hook. `ai.controller.ts` — the
controller backing `/api/ai/needs-attention` — never did this. It's the
one AI-controller endpoint that touches the query bus at all, and it
was the one controller missing the call.

Because `needsAttentionService` isolates each of its seven sources
(`safeSource()` wraps every source read individually), this failure
doesn't 500 the whole endpoint by itself in every environment — it
silently drops the `maintenance` source and marks it unavailable. But
it is a real, reproducible gap in the exact code path behind the
Command Centre feed, it matches an established fix pattern already
present five times elsewhere in this codebase, and it's a zero-risk,
one-line, idempotent addition (`bootstrapCqrs()` is guarded by
`global._cqrsBootstrapped`).

## Honesty about what I could not fully confirm
I do not have access to the live demo's actual database or its exact
error response body, and I was not able to get a full `next build` to
completion in this sandbox (Google Fonts fetch is blocked by network
policy here — unrelated to your bug). So while I'm confident this is a
real defect I found by executing the real code, I can't personally
guarantee it is the *only* contributor to the exact "Couldn't load the
needs-attention feed right now" text you're seeing live — every other
part of `needsAttentionService`/`ai.controller.ts` that I could
exercise (auth resolution, tenant/org-unit scoping, item construction,
JSON serialization, persistence) held up under direct testing,
including with the database entirely unavailable.

If this doesn't fully resolve it on your live environment, the single
most useful next thing you can give me is the actual HTTP status code
and JSON body the browser's Network tab shows for the failing
`GET /api/ai/needs-attention` request — that would let me pinpoint any
remaining cause immediately instead of guessing further.

## Verification run in this environment
```
npx tsc --noEmit         → 0 errors
npm run test:security    → 36 suites, 452 tests, all passing
```

## Scope discipline
No chart, telematics, or billing files were touched. Multi-tenant
scoping code (`tenant-context.service.ts`, `tenant-scope.ts`,
`attention-ownership.resolver.ts`, etc.) was read and verified but not
modified — it was already correct in every path I exercised.

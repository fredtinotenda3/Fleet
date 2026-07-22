// shared/export/export.constants.ts

/**
 * Hard ceiling on the number of rows a single synchronous export
 * request will return.
 *
 * Every module's list controller already has a precedent for this: the
 * "no page param" legacy dashboard path on TripController.getTrips /
 * FuelController.getFuelLogs / ExpenseController.getExpenses /
 * MaintenanceController.getReminders fetches up to 10,000 unpaginated
 * rows for chart/dashboard consumers. Exports are an explicit,
 * infrequent user action (not a page-load-time dashboard query) so
 * they get a higher ceiling, but the principle is the same: never run
 * an unbounded query against Mongo from a synchronous HTTP request.
 *
 * When the actual match count exceeds this cap, the export response
 * is still returned (with the first EXPORT_ROW_CAP rows, sorted newest
 * first) but flagged via the `truncated` field / `X-Export-Truncated`
 * header so the caller can warn the user to narrow their filters.
 *
 * FUTURE READINESS: this is the exact extension point Phase 3+
 * background export jobs are meant to remove -- a queued job can
 * stream/page through the full result set server-side with no
 * request-lifetime constraint, instead of capping. Nothing in this
 * file assumes the cap is permanent.
 */
export const EXPORT_ROW_CAP = 50_000;

/** Formats accepted by `format=` on every export endpoint. */
export const SUPPORTED_EXPORT_FORMATS = ['csv', 'xlsx'] as const;
// shared/validations/eagletrack.schema.ts
//
// Backend validation for PUT /api/telematics/eagletrack/config.
//
// DIFFERENCE FROM cartrack.schema.ts: `domain` has NO default. Cartrack
// defaults baseUrl to https://fleetapi.cartrack.com because Cartrack is
// one platform at one address. Eagle Track is white-labelled and
// deployed per customer/reseller -- the vendor's own documentation uses
// a placeholder `http://[domain]/api2/...` and its examples point at a
// per-deployment host. There is no correct fallback, so the field is
// required and a missing domain is a validation error rather than a
// silent guess.
//
// http:// is ACCEPTED rather than rejected. The vendor's documentation
// and sample endpoints are plain http, and a number of these
// deployments genuinely run without TLS; refusing http here would make
// the integration unusable for those tenants while doing nothing to
// secure them. The risk is real, and larger than this comment used to
// claim: the platform authenticates the token ONLY as a URL query
// parameter (the documented `token` header is treated as anonymous --
// see eagletrack-api.client.ts), so the credential is part of the
// request line. On http that is readable by anyone on the path; on
// either scheme it is written to the vendor's own access log. So it is
// surfaced instead of rejected: the settings card warns inline on a
// non-https domain. See the changelog's "known limitations".
//
// NOT CHANGED HERE ON PURPOSE: tightening this to https-only is a
// defensible next step, but it would break any tenant already running a
// working http deployment at the moment it deploys, which is not a
// change to make silently inside a bug fix. Flagged for a decision
// rather than taken unilaterally.

import { z } from 'zod';

export const eagletrackConfigSchema = z.object({
  enabled: z.boolean(),
  domain: z
    .string()
    .min(1, 'Domain is required')
    .url('Must be a valid URL, e.g. https://gps.example.com')
    .refine(
      (value) => {
        try {
          const protocol = new URL(value).protocol;
          return protocol === 'http:' || protocol === 'https:';
        } catch {
          return false;
        }
      },
      { message: 'Domain must use http:// or https://' }
    ),
  token: z.string().min(1, 'API token is required'),
});

export type EagleTrackConfigInputSchema = z.infer<typeof eagletrackConfigSchema>;

/**
 * The `from`/`to` window every ranged Eagle Track endpoint takes.
 *
 * Both REQUIRED, deliberately. Defaulting a missing `to` to "now" and a
 * missing `from` to "some sensible lookback" reads as convenience, but
 * it means a caller that forgot a parameter silently gets a different
 * window than they meant -- and for a paged vendor pull, a wrong window
 * is billed in API requests. An explicit window is one line for the
 * caller and removes the class entirely.
 *
 * Ordering and span are NOT validated here. clampRange owns both, so
 * there is one definition of "too wide" rather than one per endpoint
 * schema that then drifts from the service's own cap.
 */
export const eagletrackRangeQuerySchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  /**
   * Whether to import the provider's alert feed for the same window.
   * Defaults to true: an operator asking what happened to a vehicle
   * between two times wants the alerts as well as the positions.
   */
  includeAlerts: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .optional()
    .transform((value) => (typeof value === 'string' ? value === 'true' : value)),
});

/**
 * POST body for creating a uin -> vehicle link.
 *
 * NOTE WHAT IS ABSENT: the org-unit field. It is derived server-side
 * from a scope-checked vehicle lookup and must never be accepted from a
 * caller -- see eagletrack-tracker-link.service.ts's header for the
 * write-side escalation that would otherwise be possible.
 *
 * A test asserts that field name does not appear ANYWHERE in this file,
 * comments included, mirroring the finance schema's guard. That is why
 * this paragraph spells it out in prose: a grep-based guard cannot tell
 * a schema field from a comment about one, and weakening the guard to
 * make room for a comment would defeat it.
 */
export const eagletrackTrackerLinkSchema = z.object({
  uin: z.string().min(1, 'A tracker uin is required').max(64),
  vehicleId: z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/, 'vehicleId must be the vehicle _id, not a license plate'),
  note: z.string().max(280).optional(),
});

export type EagleTrackRangeQuery = z.infer<typeof eagletrackRangeQuerySchema>;
export type EagleTrackTrackerLinkInput = z.infer<typeof eagletrackTrackerLinkSchema>;

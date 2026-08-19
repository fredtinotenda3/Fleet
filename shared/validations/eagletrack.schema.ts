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

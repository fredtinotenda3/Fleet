// frontend/modules/telematics/schemas/eagletrack.schema.ts
//
// Mirrors shared/validations/eagletrack.schema.ts field-for-field
// (enabled/domain/token) so a payload that passes here also passes the
// server's re-validation, and vice versa. Not imported from
// shared/validations for the same reason the Cartrack form schema isn't:
// that schema's `token` is unconditionally required, which is correct
// for the backend (every PUT upserts a full document) but means an
// already-configured tenant loads this form with the token field blank
// -- GET /config never returns it -- and must re-enter it to save any
// change, including just flipping Enabled. Keeping the rule identical on
// both sides is the point; the duplication is in shape only.
//
// `domain` has no default here either, matching the backend. Eagle Track
// is deployed per customer, so there is no vendor URL to pre-fill.

import { z } from 'zod';

export const eagletrackConfigFormSchema = z.object({
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

export type EagleTrackConfigFormValues = z.infer<typeof eagletrackConfigFormSchema>;

/**
 * True when the domain is a syntactically valid URL that is NOT https.
 *
 * The backend deliberately accepts http (many Eagle Track deployments
 * genuinely run without TLS and refusing it would make the integration
 * unusable for them), so the risk is surfaced in the UI instead: the API
 * token travels in a request header, and on http it is readable by
 * anyone on the network path.
 */
export function isInsecureDomain(value: string | undefined): boolean {
  if (!value) return false;
  try {
    return new URL(value).protocol === 'http:';
  } catch {
    return false;
  }
}

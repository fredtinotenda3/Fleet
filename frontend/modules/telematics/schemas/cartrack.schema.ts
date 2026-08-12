// frontend/modules/telematics/schemas/cartrack.schema.ts
//
// Mirrors shared/validations/cartrack.schema.ts (the backend's
// cartrackConfigSchema) field-for-field -- accountId/apiKey/apiSecret/
// baseUrl/enabled -- so a payload that passes here will also pass the
// server's re-validation, and vice versa. Not imported directly from
// shared/validations because that schema's `apiSecret` is unconditionally
// required, which is correct for the backend (every PUT upserts a full
// document) but wrong for a form default: an already-configured tenant
// loads with the secret field blank (GET never returns it, see
// CartrackConfigStatus), and submitting the form unchanged must still
// re-validate as "secret required" rather than accepting an empty string.
// That behavior is identical either way here, so the duplication is only
// in shape, not in rule -- see CartrackConfigCard's doc comment for how
// the blank-secret-on-load state is surfaced to the user.

import { z } from 'zod';

export const cartrackConfigFormSchema = z.object({
  enabled: z.boolean(),
  accountId: z.string().min(1, 'Account ID is required'),
  apiKey: z.string().min(1, 'API key is required'),
  apiSecret: z.string().min(1, 'API secret is required'),
  baseUrl: z.string().min(1, 'API base URL is required').url('Must be a valid URL'),
});

export type CartrackConfigFormValues = z.infer<typeof cartrackConfigFormSchema>;

// shared/validations/telematics-demo.schema.ts

import { z } from 'zod';

export const demoModeToggleSchema = z.object({
  enabled: z.boolean(),
});

export type DemoModeToggleInput = z.infer<typeof demoModeToggleSchema>;
// frontend/modules/maintenance/schemas/index.ts

import type { z } from 'zod';
import { reminderSchema, reminderUpdateSchema, maintenanceFiltersSchema } from '@/shared/validations/maintenance.schema';

export const maintenanceFormSchema = reminderSchema;
export const maintenanceUpdateFormSchema = reminderUpdateSchema;
export const maintenanceFiltersFormSchema = maintenanceFiltersSchema;

export type MaintenanceFormValues = z.input<typeof maintenanceFormSchema>;
export type MaintenanceFormOutput = z.output<typeof maintenanceFormSchema>;
export type MaintenanceUpdateFormValues = z.input<typeof maintenanceUpdateFormSchema>;
export type MaintenanceUpdateFormOutput = z.output<typeof maintenanceUpdateFormSchema>;
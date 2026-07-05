
// modules/reporting/registry/bootstrap-reporting.ts

import { bootstrapDataSources } from './bootstrap-data-sources';
import { reportTemplateService } from '../services/report-template.service';
import { monitoring } from '@/infrastructure/monitoring/logger';

let bootstrapped = false;

/** Call once at process boot (both the Next.js server and the worker process). */
export async function bootstrapReporting(): Promise<void> {
  if (bootstrapped) return;
  bootstrapped = true;

  bootstrapDataSources();

  try {
    await reportTemplateService.seedSystemTemplates();
  } catch (error) {
    monitoring.logError('[bootstrap-reporting] Failed to seed system report templates', error as Error);
  }
}
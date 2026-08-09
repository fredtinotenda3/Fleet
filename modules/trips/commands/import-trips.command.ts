// modules/trips/commands/import-trips.command.ts
//
// Bulk trip import command. Mirrors
// modules/expenses/commands/import-expenses.command.ts's shape, with
// the addition of an optional TenantContext -- ImportTripsHandler uses
// it to reject rows whose vehicle resolves outside a scoped caller's
// accessible org units (see the handler's file header for the
// fail-closed rationale).

import { BaseCommand } from '@/server/cqrs/command';
import type { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import type { Mode } from '@/shared/types/common.types';

export interface ImportTripRow {
  rowNumber: number;
  date: string;
  license_plate: string;
  mode?: Mode | string;
  trip_distance?: string | number;
  start_odometer?: string | number;
  end_odometer?: string | number;
  unit_id?: string;
  driver?: string;
  start_location?: string;
  end_location?: string;
  notes?: string;
}

export class ImportTripsCommand extends BaseCommand {
  static readonly commandName = 'ImportTripsCommand';

  constructor(
    public readonly rows: ImportTripRow[],
    public readonly tenantId: string,
    public readonly userId?: string,
    public readonly context?: TenantContext
  ) {
    super(ImportTripsCommand.commandName);
  }
}

// modules/transport-cost/commands/import-transport-cost.command.ts
//
// Bulk import command for Olivine transport-cost source records. Two
// row shapes (one per sheet family -- see the audit's Section B for why
// they can't share a shape: 3rd Party bills per consignment, Vansales
// bills a fixed weekly retainer), a single command class distinguished
// by `sheetFamily`, mirroring ImportExpensesCommand/ImportTripsCommand's
// shape (rows + tenantId + WriteScope + userId).

import { BaseCommand } from '@/server/cqrs/command';
import { WriteScope } from '@/server/tenancy/write-scope';
import { TransportCostSheetFamily } from '@/shared/types/transport-cost.types';

/** Raw row shape for the "3rd Party" and "Depot STO (March/April)"
 *  sheets -- see audit Section B, Family 2 and Family 5's first
 *  sub-family, which share this exact column set. */
export interface ThirdPartyImportRow {
  rowNumber: number;
  date?: string;
  customerName?: string;
  transporter?: string;
  salesInvoiceNo?: string | number;
  tonnage?: string | number;
  registration?: string;
  destinationTown?: string;
  amount?: string | number;
}

/** Raw row shape for the "Vansales" sheets (audit Section B, Family 4).
 *  `truck` deliberately holds the transporter name, not a vehicle
 *  identifier -- see the audit's terminology-trap note; `registration`
 *  is the real vehicle identifier. */
export interface VansalesImportRow {
  rowNumber: number;
  payerName?: string;
  registration?: string;
  tonnage?: string | number;
  product?: string;
  truck?: string;
  monthlyCostBeforeVat?: string | number;
  week1?: string | number;
  week2?: string | number;
  week3?: string | number;
  week4?: string | number;
  total?: string | number;
}

export type TransportCostImportRow = ThirdPartyImportRow | VansalesImportRow;

export class ImportTransportCostCommand extends BaseCommand {
  static readonly commandName = 'ImportTransportCostCommand';

  constructor(
    public readonly sheetFamily: TransportCostSheetFamily,
    public readonly rows: TransportCostImportRow[],
    public readonly tenantId: string,
    /** Authority this write runs under. See server/tenancy/write-scope.ts. */
    public readonly scope: WriteScope,
    public readonly sourceFileName: string,
    public readonly userId?: string
  ) {
    super(ImportTransportCostCommand.commandName);
  }
}

// modules/transport-cost/services/transport-cost-report.service.ts
//
// Phase O4 (minimal slice, per the client's explicit instruction: "one
// working report/drill-down screen -- Business Stream -> Vehicle/
// Transporter -> time range -- sourced from the Allocation Ledger
// postings O3 creates, not from raw source records").
//
// ---------------------------------------------------------------------
// SOURCED FROM POSTINGS ONLY -- read this before adding a call site
// ---------------------------------------------------------------------
// Every total here comes from tblallocationledger (via
// allocationLedgerRepository), never from tbltransportcostsourcerecords
// directly. TransportPartner/ContractedVehicle are read ONLY to resolve
// DISPLAY names (registration, transporter, business stream) for a
// vehicleId already present on a posting -- never to compute a total.
// This is what makes the pending-rows banner honest rather than
// decorative: the NUMBER on screen is exactly what O3 actually posted
// (append-only, reversal-aware), and the banner is a separate,
// explicitly-labelled fact about UNPOSTED evidence for the same period,
// never blended into the total itself.
//
// ---------------------------------------------------------------------
// BUSINESS STREAM: MOSTLY "UNATTRIBUTED" FOR JANUARY 2026, ON PURPOSE
// ---------------------------------------------------------------------
// ContractedVehicle.businessStream is optional and is only ever set when
// a human confirming an O2 review item supplies one (see
// confirm-review-new.handler.ts) -- it is never inferred by code. The
// real January 2026 "3rd Party" sheet carries NO business-stream
// indicator anywhere (no per-stream tab split, no explicit column --
// verified against the source workbook; later months' 3rd Party tabs
// ARE sometimes split into per-stream sub-tabs, e.g. "MAY -26 3rd Party
// Olivine" / "...Hypery", but Jan's is not, and that tab-name signal is
// not yet wired into the import command in this slice -- see the
// delivery README's open items). So every vehicle first confirmed from
// January data will show under the 'unattributed' bucket below unless a
// reviewer supplied a stream by hand. This is the honest state of
// today's real data, not a bug -- the Stream -> Vehicle hierarchy is
// fully built and will populate correctly the moment a source or a
// reviewer actually reveals the stream for a row.

import {
  allocationLedgerRepository,
  AllocationLedgerRepository,
} from '@/modules/finance/repositories/allocation-ledger.repository';
import {
  transportCostSourceRecordRepository,
  TransportCostSourceRecordRepository,
} from '../repositories/transport-cost-source-record.repository';
import { contractedVehicleRepository, ContractedVehicleRepository } from '../repositories/contracted-vehicle.repository';
import { transportPartnerRepository, TransportPartnerRepository } from '../repositories/transport-partner.repository';
import { financeSettingsService, FinanceSettingsService } from '@/modules/finance/services/finance-settings.service';
import type { AllocationPosting } from '@/modules/finance/types/allocation.types';
import type { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import { NotFoundError, ValidationError } from '@/server/errors/app.errors';
import { roundCurrency } from '@/modules/finance/utils/fx-conversion.utils';

const COST_CATEGORY = 'transport-cost' as const;
const UNATTRIBUTED = 'unattributed' as const;

export interface VehicleGroupTotal {
  contractedVehicleId: string;
  registration: string;
  transporterName: string;
  businessStream: string;
  reportingCurrency: string;
  netReportingAmount: number;
  postingCount: number;
}

export interface StreamGroupTotal {
  businessStream: string;
  reportingCurrency: string;
  netReportingAmount: number;
  postingCount: number;
  vehicleCount: number;
}

export interface TransportCostAllocationReport {
  periodStart: Date;
  periodEnd: Date;
  reportingCurrency: string;
  byBusinessStream: StreamGroupTotal[];
  byVehicle: VehicleGroupTotal[];
  /** More than one reportingCurrency appeared in this period's postings
   *  -- see AllocationService.getCostPerKm's identical handling. When
   *  true, netReportingAmount figures above are per-currency subtotals,
   *  never summed across currencies. */
  mixedReportingCurrencies?: string[];
  pending: {
    pendingSourceRecordCount: number;
    /** Never presented as final when true -- the screen's own banner flag. */
    hasPendingAmounts: boolean;
  };
}

export interface PostingDrillDown {
  contractedVehicleId: string;
  registration: string;
  transporterName: string;
  businessStream: string;
  postings: AllocationPosting[];
}

export class TransportCostReportService {
  constructor(
    private readonly vehicleRepo: ContractedVehicleRepository = contractedVehicleRepository,
    private readonly partnerRepo: TransportPartnerRepository = transportPartnerRepository,
    private readonly settingsService: FinanceSettingsService = financeSettingsService,
    private readonly ledgerRepo: AllocationLedgerRepository = allocationLedgerRepository,
    private readonly sourceRepo: TransportCostSourceRecordRepository = transportCostSourceRecordRepository
  ) {}

  /**
   * The full Stream -> Vehicle report for one period. periodStart/
   * periodEnd use the ledger's own FULLY-CONTAINED semantics (see
   * AllocationLedgerRepository's header) -- consistent with every other
   * total this platform reports, including the one a customer may
   * already be reconciling against their own GL.
   */
  async getAllocationReport(
    context: TenantContext,
    periodStart: Date,
    periodEnd: Date
  ): Promise<TransportCostAllocationReport> {
    if (periodEnd < periodStart) {
      throw new ValidationError('periodEnd cannot be earlier than periodStart.');
    }

    const [totals, vehicles, settings, pendingCount] = await Promise.all([
      this.ledgerRepo.getNetTotalsByVehicleForCategory(COST_CATEGORY, periodStart, periodEnd, context),
      this.vehicleRepo.findAllConfirmed(context.organizationId),
      this.settingsService.resolve(context.organizationId),
      this.sourceRepo.countPendingAmount(periodStart, periodEnd, context),
    ]);

    const vehicleById = new Map(vehicles.map((v) => [v._id!, v]));
    const partnerIds = Array.from(new Set(vehicles.map((v) => v.transporterPartnerId)));
    const partners = await Promise.all(partnerIds.map((id) => this.partnerRepo.findById(id, context.organizationId)));
    const partnerById = new Map(partners.filter((p): p is NonNullable<typeof p> => Boolean(p)).map((p) => [p._id!, p]));

    const currencies = Array.from(new Set(totals.map((t) => t.reportingCurrency)));
    const mixed = currencies.length > 1;

    const byVehicle: VehicleGroupTotal[] = totals.map((t) => {
      const vehicle = vehicleById.get(t.vehicleId);
      const partner = vehicle ? partnerById.get(vehicle.transporterPartnerId) : undefined;
      return {
        contractedVehicleId: t.vehicleId,
        registration: vehicle?.registration ?? '(unresolved vehicle)',
        transporterName: partner?.canonicalName ?? '(unresolved transporter)',
        businessStream: vehicle?.businessStream ?? UNATTRIBUTED,
        reportingCurrency: t.reportingCurrency,
        netReportingAmount: roundCurrency(t.netReportingAmount),
        postingCount: t.postingCount,
      };
    });

    const streamMap = new Map<string, StreamGroupTotal>();
    for (const row of byVehicle) {
      const key = `${row.businessStream}\u0000${row.reportingCurrency}`;
      const existing = streamMap.get(key);
      if (existing) {
        existing.netReportingAmount = roundCurrency(existing.netReportingAmount + row.netReportingAmount);
        existing.postingCount += row.postingCount;
        existing.vehicleCount += 1;
      } else {
        streamMap.set(key, {
          businessStream: row.businessStream,
          reportingCurrency: row.reportingCurrency,
          netReportingAmount: row.netReportingAmount,
          postingCount: row.postingCount,
          vehicleCount: 1,
        });
      }
    }

    return {
      periodStart,
      periodEnd,
      reportingCurrency: currencies[0] ?? settings.reportingCurrency,
      byBusinessStream: Array.from(streamMap.values()),
      byVehicle,
      ...(mixed ? { mixedReportingCurrencies: currencies } : {}),
      pending: {
        pendingSourceRecordCount: pendingCount,
        hasPendingAmounts: pendingCount > 0,
      },
    };
  }

  /**
   * Stream/Vehicle -> individual postings, the report's bottom drill-
   * down level. ContractedVehicle is organization-level (no orgUnitId --
   * see its type's header), so the existence check below is tenant-only,
   * unlike AllocationService.resolveVehicleInScope's additional org-unit
   * membership check; the POSTINGS themselves are still org-unit scoped
   * via findByVehicleInScope's TenantContext parameter, so a caller
   * cannot see postings for a vehicle outside their own visible org
   * units even though the vehicle record itself is org-wide.
   */
  async getPostingsForVehicle(
    context: TenantContext,
    contractedVehicleId: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<PostingDrillDown> {
    const vehicle = await this.vehicleRepo.findById(contractedVehicleId, context.organizationId);
    if (!vehicle) {
      throw new NotFoundError(`Contracted vehicle "${contractedVehicleId}" not found.`);
    }
    const partner = await this.partnerRepo.findById(vehicle.transporterPartnerId, context.organizationId);

    const postings = await this.ledgerRepo.findByVehicleInScope(contractedVehicleId, context, {
      costCategory: COST_CATEGORY,
      periodStart,
      periodEnd,
    });

    return {
      contractedVehicleId,
      registration: vehicle.registration,
      transporterName: partner?.canonicalName ?? '(unresolved transporter)',
      businessStream: vehicle.businessStream ?? UNATTRIBUTED,
      postings,
    };
  }

  /** The month picker's own data source -- see AllocationLedgerRepository.getDistinctPostedMonths. */
  async getAvailableMonths(context: TenantContext): Promise<Date[]> {
    return this.ledgerRepo.getDistinctPostedMonths(COST_CATEGORY, context);
  }
}

export const transportCostReportService = new TransportCostReportService();

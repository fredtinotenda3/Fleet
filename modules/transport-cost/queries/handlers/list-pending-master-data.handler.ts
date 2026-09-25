// modules/transport-cost/queries/handlers/list-pending-master-data.handler.ts
//
// GAP-CLOSURE PASS, Objectives 1/3/5.

import { IQueryHandler } from '@/server/cqrs/query';
import { ListPendingMasterDataQuery } from '../list-pending-master-data.query';
import { TransportPartnerRepository } from '@/modules/transport-cost/repositories/transport-partner.repository';
import { ContractedVehicleRepository } from '@/modules/transport-cost/repositories/contracted-vehicle.repository';
import { TransportPartner } from '@/shared/types/transport-partner.types';
import { ContractedVehicle } from '@/shared/types/contracted-vehicle.types';

export interface PendingMasterDataResult {
  transporters: TransportPartner[];
  vehicles: ContractedVehicle[];
}

export class ListPendingMasterDataHandler
  implements IQueryHandler<ListPendingMasterDataQuery, PendingMasterDataResult>
{
  constructor(
    private readonly partnerRepo: TransportPartnerRepository,
    private readonly vehicleRepo: ContractedVehicleRepository
  ) {}

  async execute(query: ListPendingMasterDataQuery): Promise<PendingMasterDataResult> {
    const [transporters, vehicles] = await Promise.all([
      this.partnerRepo.findNeedingReview(query.tenantId),
      this.vehicleRepo.findNeedingReview(query.tenantId),
    ]);
    return { transporters, vehicles };
  }
}

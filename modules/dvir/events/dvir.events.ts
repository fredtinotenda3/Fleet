// modules/dvir/events/dvir.events.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';
import { DVIR_SUBMITTED, DVIR_OUT_OF_SERVICE } from '@/server/events/event-names';
import { DVIRInspection } from '../types/dvir.types';

export class DVIRSubmittedEvent extends DomainEvent {
  constructor(inspection: DVIRInspection, metadata?: Record<string, unknown>) {
    super(
      DVIR_SUBMITTED,
      {
        entityId: inspection._id,
        entityType: 'dvir_inspection',
        license_plate: inspection.license_plate,
        driverId: inspection.driverId,
        overallStatus: inspection.overallStatus,
        tenantId: inspection.tenantId,
      },
      metadata
    );
  }
}

/** Published in addition to DVIRSubmittedEvent when outOfService is true, so notification/alerting subscribers don't have to inspect payload fields to decide whether to fire. */
export class DVIROutOfServiceEvent extends DomainEvent {
  constructor(inspection: DVIRInspection, metadata?: Record<string, unknown>) {
    super(
      DVIR_OUT_OF_SERVICE,
      {
        entityId: inspection._id,
        entityType: 'dvir_inspection',
        license_plate: inspection.license_plate,
        driverId: inspection.driverId,
        orgUnitId: inspection.orgUnitId,
        tenantId: inspection.tenantId,
      },
      metadata
    );
  }
}

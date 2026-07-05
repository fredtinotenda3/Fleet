// modules/procurement/types/procurement.types.ts
import { BaseEntity } from '@/shared/types/common.types';

export type PurchaseRequestStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'converted' | 'cancelled';
export type PurchaseOrderStatus = 'draft' | 'sent' | 'partially_received' | 'received' | 'cancelled';

export interface LineItem {
  sparePartId?: string;
  description: string;
  quantity: number;
  unitCost: number;
  receivedQuantity?: number;
}

export interface PurchaseRequest extends BaseEntity {
  requestedBy: string;
  status: PurchaseRequestStatus;
  reason: string;
  items: LineItem[];
  estimatedTotal: number;
  approvedBy?: string;
  approvedAt?: Date;
  rejectionReason?: string;
  linkedWorkOrderId?: string;
}

export interface PurchaseRequestCreateDTO {
  reason: string;
  items: LineItem[];
  linkedWorkOrderId?: string;
}

export interface PurchaseOrder extends BaseEntity {
  purchaseRequestId?: string;
  vendorId: string;
  status: PurchaseOrderStatus;
  items: LineItem[];
  totalAmount: number;
  expectedDeliveryDate?: Date;
  sentAt?: Date;
  receivedAt?: Date;
  notes?: string;
}

export interface PurchaseOrderCreateDTO {
  purchaseRequestId?: string;
  vendorId: string;
  items: LineItem[];
  expectedDeliveryDate?: Date | string;
  notes?: string;
}

export interface PurchaseOrderReceiveDTO {
  receivedItems: Array<{ sparePartId?: string; description: string; quantityReceived: number }>;
}
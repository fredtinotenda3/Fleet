// modules/inventory/types/inventory.types.ts
import { BaseEntity } from '@/shared/types/common.types';

export interface SparePart extends BaseEntity {
  sku: string;
  name: string;
  category: string;
  unitCost: number;
  quantityOnHand: number;
  reorderThreshold: number;
  reorderQuantity: number;
  warehouseLocation?: string;
  preferredVendorId?: string;
}

export interface SparePartCreateDTO {
  sku: string;
  name: string;
  category: string;
  unitCost: number;
  quantityOnHand?: number;
  reorderThreshold: number;
  reorderQuantity: number;
  warehouseLocation?: string;
  preferredVendorId?: string;
}

export type SparePartUpdateDTO = Partial<SparePartCreateDTO>;

export type StockMovementType = 'receipt' | 'consumption' | 'adjustment';

export interface StockMovement extends BaseEntity {
  sparePartId: string;
  type: StockMovementType;
  quantity: number; // positive for receipt, negative for consumption
  balanceAfter: number;
  workOrderId?: string;
  purchaseOrderId?: string;
  reason?: string;
}

export interface SparePartFilters {
  category?: string;
  belowReorderThreshold?: boolean;
  search?: string;
}
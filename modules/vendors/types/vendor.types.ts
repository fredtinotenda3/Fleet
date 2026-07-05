// modules/vendors/types/vendor.types.ts ===

import { BaseEntity } from '@/shared/types/common.types';

export type VendorCategory = 'parts_supplier' | 'service_provider' | 'insurance' | 'fuel_supplier' | 'logistics' | 'other';
export type VendorStatus = 'active' | 'inactive' | 'blacklisted' | 'pending_review';

export interface VendorContact {
  name: string;
  email?: string;
  phone?: string;
  role?: string;
}

export interface Vendor extends BaseEntity {
  name: string;
  category: VendorCategory;
  status: VendorStatus;
  taxId?: string;
  address?: string;
  contacts: VendorContact[];
  paymentTerms?: string;
  rating?: number; // 0-5, rolling average
  ratingCount: number;
  notes?: string;
  tags?: string[];
}

export interface VendorCreateDTO {
  name: string;
  category: VendorCategory;
  taxId?: string;
  address?: string;
  contacts?: VendorContact[];
  paymentTerms?: string;
  notes?: string;
  tags?: string[];
}

export interface VendorUpdateDTO extends Partial<VendorCreateDTO> {
  status?: VendorStatus;
}

export interface VendorFilters {
  category?: VendorCategory;
  status?: VendorStatus;
  search?: string;
}
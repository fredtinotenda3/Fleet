// frontend/modules/inventory/types/index.ts
//
// The frontend inventory module was an empty scaffold (nine index.ts
// files re-exporting nothing, beside nine .gitkeeps) while ten
// `/api/inventory/*` routes ran live on the server. This is the first
// real content in it, added for the narrowest reason: a work order
// could never have parts recorded against it, and the parts it did
// carry rendered as raw ObjectIds because nothing could resolve a part
// id to a part name.
//
// Deliberately NOT a full inventory module. Stock receipt, adjustment,
// movement history and reorder management all have routes and no UI,
// and building those is a feature, not a fix. What is here is what the
// workshop path needs and nothing else.

/** Mirrors modules/inventory/types/inventory.types.ts SparePart. */
export interface SparePart {
  _id: string;
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

export interface SparePartListParams {
  search?: string;
  category?: string;
  belowReorderThreshold?: boolean;
  page?: number;
  limit?: number;
}

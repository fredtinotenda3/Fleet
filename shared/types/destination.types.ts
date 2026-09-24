// shared/types/destination.types.ts
//
// OLIVINE LIVE OPERATING MODEL, SLICE 3 (master data: Destination).
// Structurally identical to Customer (shared/types/customer.types.ts) --
// see that file's header for the full DECISION/REASONING record, which
// applies here unchanged: a lightweight, organization-level,
// human-creatable reference collection sitting in front of the existing
// `destinationTown` text field, never replacing it, never gating any
// financial computation.

import { BaseEntity } from './common.types';

export interface Destination extends BaseEntity {
  /** Display name, exactly as confirmed at creation. */
  name: string;

  /** Uppercase, whitespace-collapsed de-duplication/search key -- see Customer.normalizedName's own doc comment. */
  normalizedName: string;

  /** Default true. See Customer.active's own doc comment -- identical semantics. */
  active: boolean;
}

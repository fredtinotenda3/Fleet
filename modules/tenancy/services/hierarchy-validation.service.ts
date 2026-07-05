// modules/tenancy/services/hierarchy-validation.service.ts

import { OrgUnitType } from '@/modules/security/types/org-unit.types';
import { ALLOWED_PARENT_TYPES, TENANT_LEVEL_ORDER } from '../constants/hierarchy.constants';
import { ValidationError } from '@/server/errors/app.errors';

export class HierarchyValidationService {
  /**
   * Validates that `childType` is allowed to nest under a parent of
   * `parentType` (or under the organization root directly, when
   * parentType is null). Throws ValidationError on violation rather than
   * returning a boolean, so callers get a descriptive message for free.
   */
  validateParentChild(childType: OrgUnitType, parentType: OrgUnitType | null): void {
    const allowed = ALLOWED_PARENT_TYPES[childType];

    if (allowed === null) {
      if (parentType !== null) {
        throw new ValidationError(
          `"${childType}" units must be top-level (no parent). Received parent type "${parentType}".`
        );
      }
      return;
    }

    if (parentType === null || !allowed.includes(parentType)) {
      throw new ValidationError(
        `"${childType}" units must be nested under one of: ${allowed.join(', ')}. Received parent type "${
          parentType ?? 'none'
        }".`
      );
    }
  }

  levelOf(type: OrgUnitType): number {
    return TENANT_LEVEL_ORDER[type];
  }

  /** True if `ancestorType` is strictly above `descendantType` in the hierarchy. */
  isAncestorLevel(ancestorType: OrgUnitType, descendantType: OrgUnitType): boolean {
    return this.levelOf(ancestorType) < this.levelOf(descendantType);
  }
}

export const hierarchyValidationService = new HierarchyValidationService();
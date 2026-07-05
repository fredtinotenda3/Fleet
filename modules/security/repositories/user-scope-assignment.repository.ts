// modules/security/repositories/user-scope-assignment.repository.ts

import { Filter } from 'mongodb';
import { BaseRepository } from '@/server/repositories/base.repository';
import { UserScopeAssignment } from '../types/user-scope-assignment.types';

export class UserScopeAssignmentRepository extends BaseRepository<UserScopeAssignment> {
  protected collectionName = 'tbluser_scope_assignments';

  async findByUser(userId: string, organizationId: string): Promise<UserScopeAssignment[]> {
    return this.findMany({ userId } as Filter<UserScopeAssignment>, organizationId);
  }

  async findByUserAndOrgUnit(
    userId: string,
    orgUnitId: string,
    organizationId: string
  ): Promise<UserScopeAssignment | null> {
    return this.findOne({ userId, orgUnitId } as Filter<UserScopeAssignment>, organizationId);
  }

  async findByOrgUnit(orgUnitId: string, organizationId: string): Promise<UserScopeAssignment[]> {
    return this.findMany({ orgUnitId } as Filter<UserScopeAssignment>, organizationId);
  }

  async revokeAssignment(id: string, organizationId: string, userId?: string): Promise<boolean> {
    return this.softDelete(id, organizationId, userId);
  }
}

export const userScopeAssignmentRepository = new UserScopeAssignmentRepository();
// modules/organizations/repositories/organization.repository.ts

import { Filter, ObjectId, ModifyResult } from 'mongodb';
import { BaseRepository } from '@/server/repositories/base.repository';
import {
  Organization,
  OrganizationMember,
  OrganizationInvite,
} from '@/shared/types/organization.types';

export class OrganizationRepository extends BaseRepository<Organization> {
  protected collectionName = 'tblorganizations';

  /**
   * Organizations are root-tenant documents — they are looked up by slug
   * or owner directly, not filtered by an existing tenantId. We pass
   * `isSuperAdmin = true` to the base methods purely to bypass the
   * tenant filter (NOT to imply elevated privilege), since at this level
   * there is no parent tenant context yet.
   */

  async findBySlug(slug: string): Promise<Organization | null> {
    const collection = await this.getCollection();
    return collection.findOne({
      slug,
      isDeleted: { $ne: true },
    } as Filter<Organization>);
  }

  async findByOwnerId(ownerId: string): Promise<Organization[]> {
    const collection = await this.getCollection();
    return collection
      .find({
        ownerId,
        isDeleted: { $ne: true },
      } as Filter<Organization>)
      .toArray();
  }

  async findByMemberId(userId: string): Promise<Organization[]> {
    const collection = await this.getCollection();
    return collection
      .find({
        'members.userId': userId,
        isDeleted: { $ne: true },
      } as Filter<Organization>)
      .toArray();
  }

  async updateMemberStatus(
    organizationId: string,
    userId: string,
    status: 'active' | 'suspended'
  ): Promise<boolean> {
    if (!ObjectId.isValid(organizationId)) return false;
    const collection = await this.getCollection();
    const result = await collection.updateOne(
      {
        _id: new ObjectId(organizationId),
        isDeleted: { $ne: true },
        'members.userId': userId,
      } as unknown as Filter<Organization>,
      {
        $set: {
          'members.$.status': status,
          updatedAt: new Date(),
        },
      }
    );
    return result.modifiedCount > 0;
  }

  async addMember(
    organizationId: string,
    member: OrganizationMember
  ): Promise<boolean> {
    if (!ObjectId.isValid(organizationId)) return false;
    const collection = await this.getCollection();
    const result = await collection.updateOne(
      {
        _id: new ObjectId(organizationId),
        isDeleted: { $ne: true },
      } as unknown as Filter<Organization>,
      {
        $push: { members: member } as any,
        $set: { updatedAt: new Date() },
      }
    );
    return result.modifiedCount > 0;
  }

  async removeMember(
    organizationId: string,
    userId: string
  ): Promise<boolean> {
    if (!ObjectId.isValid(organizationId)) return false;
    const collection = await this.getCollection();
    const result = await collection.updateOne(
      {
        _id: new ObjectId(organizationId),
        isDeleted: { $ne: true },
      } as unknown as Filter<Organization>,
      {
        $pull: { members: { userId } } as any,
        $set: { updatedAt: new Date() },
      }
    );
    return result.modifiedCount > 0;
  }

  async updateMemberRole(
    organizationId: string,
    userId: string,
    role: string
  ): Promise<boolean> {
    if (!ObjectId.isValid(organizationId)) return false;
    const collection = await this.getCollection();
    const result = await collection.updateOne(
      {
        _id: new ObjectId(organizationId),
        isDeleted: { $ne: true },
        'members.userId': userId,
      } as unknown as Filter<Organization>,
      {
        $set: {
          'members.$.role': role,
          updatedAt: new Date(),
        },
      }
    );
    return result.modifiedCount > 0;
  }

  async incrementUsedSeats(
    organizationId: string,
    delta: number
  ): Promise<boolean> {
    if (!ObjectId.isValid(organizationId)) return false;
    const collection = await this.getCollection();
    const result = await collection.updateOne(
      {
        _id: new ObjectId(organizationId),
        isDeleted: { $ne: true },
      } as unknown as Filter<Organization>,
      {
        $inc: { 'subscription.usedSeats': delta } as any,
        $set: { updatedAt: new Date() },
      }
    );
    return result.modifiedCount > 0;
  }

  async getInvite(token: string): Promise<OrganizationInvite | null> {
    const collection = await this.getCollection();
    const result = await collection
      .aggregate([
        { $match: { isDeleted: { $ne: true } } },
        { $unwind: '$invites' },
        {
          $match: {
            'invites.token': token,
            'invites.expiresAt': { $gt: new Date() },
            'invites.status': 'pending',
          },
        },
        { $project: { invite: '$invites', _id: 0 } },
      ])
      .toArray();

    return (result[0]?.invite as OrganizationInvite) || null;
  }

  async createInvite(
    organizationId: string,
    invite: OrganizationInvite
  ): Promise<boolean> {
    if (!ObjectId.isValid(organizationId)) return false;
    const collection = await this.getCollection();
    const result = await collection.updateOne(
      {
        _id: new ObjectId(organizationId),
        isDeleted: { $ne: true },
      } as unknown as Filter<Organization>,
      {
        $push: { invites: invite } as any,
        $set: { updatedAt: new Date() },
      }
    );
    return result.modifiedCount > 0;
  }

  async revokeInvite(
    organizationId: string,
    token: string
  ): Promise<boolean> {
    if (!ObjectId.isValid(organizationId)) return false;
    const collection = await this.getCollection();
    const result = await collection.updateOne(
      { _id: new ObjectId(organizationId) } as unknown as Filter<Organization>,
      {
        $set: {
          'invites.$[elem].status': 'cancelled',
          updatedAt: new Date(),
        },
      } as any,
      { arrayFilters: [{ 'elem.token': token }] }
    );
    return result.modifiedCount > 0;
  }

  /**
   * Extends a pending invite's expiry and returns the (still pending)
   * invite for the caller to re-queue the notification email with.
   * Does not rotate the token — the original invite link keeps working,
   * which is what "resend" should mean (not "invalidate and reissue").
   */
  async touchInviteExpiry(
    organizationId: string,
    token: string,
    newExpiresAt: Date
  ): Promise<boolean> {
    if (!ObjectId.isValid(organizationId)) return false;
    const collection = await this.getCollection();
    const result = await collection.updateOne(
      {
        _id: new ObjectId(organizationId),
        isDeleted: { $ne: true },
      } as unknown as Filter<Organization>,
      {
        $set: {
          'invites.$[elem].expiresAt': newExpiresAt,
          updatedAt: new Date(),
        },
      } as any,
      { arrayFilters: [{ 'elem.token': token, 'elem.status': 'pending' }] }
    );
    return result.modifiedCount > 0;
  }

  async declineInviteByToken(token: string): Promise<boolean> {
    const collection = await this.getCollection();
    const result = await collection.updateOne(
      {
        isDeleted: { $ne: true },
        invites: { $elemMatch: { token, status: 'pending' } },
      } as unknown as Filter<Organization>,
      {
        $set: { 'invites.$[elem].status': 'cancelled', updatedAt: new Date() },
      } as any,
      { arrayFilters: [{ 'elem.token': token }] }
    );
    return result.modifiedCount > 0;
  }

  /**
   * Atomically accepts an invite: validates it is still pending and
   * unexpired, adds the member, and marks the invite accepted —
   * all in a single updateOne to avoid race conditions between
   * concurrent accept attempts.
   */
  async acceptInvite(
    token: string,
    userId: string,
    userName: string
  ): Promise<Organization | null> {
    const invite = await this.getInvite(token);
    if (!invite) return null;

    if (!ObjectId.isValid(invite.organizationId)) return null;
    const collection = await this.getCollection();

    const member: OrganizationMember = {
      userId,
      email: invite.email,
      name: userName,
      role: invite.role,
      permissions: [],
      status: 'active',
      joinedAt: new Date(),
      invitedBy: invite.invitedBy,
    };

    const result: ModifyResult<Organization> = await collection.findOneAndUpdate(
      {
        _id: new ObjectId(invite.organizationId),
        isDeleted: { $ne: true },
        invites: {
          $elemMatch: { token, status: 'pending', expiresAt: { $gt: new Date() } },
        },
      } as unknown as Filter<Organization>,
      {
        $push: { members: member } as any,
        $set: {
          'invites.$[elem].status': 'accepted',
          updatedAt: new Date(),
        },
        $inc: { 'subscription.usedSeats': 1 } as any,
      },
      {
        arrayFilters: [{ 'elem.token': token }],
        returnDocument: 'after',
      } as any
    );

    // Return the actual document from the ModifyResult
    return result.value ?? null;
  }

  async expireOldInvites(): Promise<number> {
    const collection = await this.getCollection();
    const result = await collection.updateMany(
      {
        invites: {
          $elemMatch: { status: 'pending', expiresAt: { $lt: new Date() } },
        },
      } as Filter<Organization>,
      {
        $set: { 'invites.$[elem].status': 'expired' },
      } as any,
      {
        arrayFilters: [{ 'elem.status': 'pending', 'elem.expiresAt': { $lt: new Date() } }],
      } as any
    );
    return result.modifiedCount;
  }

  async countActiveOrganizations(): Promise<number> {
    const collection = await this.getCollection();
    return collection.countDocuments({
      isDeleted: { $ne: true },
      status: 'active',
    } as Filter<Organization>);
  }
}

export const organizationRepository = new OrganizationRepository();
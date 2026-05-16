// modules/organizations/repositories/organization.repository.ts

import { BaseRepository } from '@/server/repositories/base.repository';
import { Organization, OrganizationMember, OrganizationInvite } from '@/shared/types/organization.types';
import { Filter, ObjectId } from 'mongodb';

export class OrganizationRepository extends BaseRepository<Organization> {
  protected collectionName = 'tblorganizations';

  async findBySlug(slug: string): Promise<Organization | null> {
    return this.findOne({ slug }, 'system', true);
  }

  async findByOwnerId(ownerId: string): Promise<Organization[]> {
    return this.findMany({ ownerId }, 'system', {}, true);
  }

  async findByMemberId(userId: string): Promise<Organization[]> {
    const collection = await this.getCollection();
    return collection.find({ 'members.userId': userId, isDeleted: { $ne: true } }).toArray();
  }

  async addMember(organizationId: string, member: OrganizationMember, tenantId: string): Promise<void> {
    const collection = await this.getCollection();
    await collection.updateOne(
      { _id: new ObjectId(organizationId), tenantId },
      { $push: { members: member } }
    );
  }

  async removeMember(organizationId: string, userId: string, tenantId: string): Promise<void> {
    const collection = await this.getCollection();
    await collection.updateOne(
      { _id: new ObjectId(organizationId), tenantId },
      { $pull: { members: { userId } } }
    );
  }

  async updateMemberRole(organizationId: string, userId: string, role: string, tenantId: string): Promise<void> {
    const collection = await this.getCollection();
    await collection.updateOne(
      { _id: new ObjectId(organizationId), tenantId, 'members.userId': userId },
      { $set: { 'members.$.role': role, 'members.$.permissions': [] } }
    );
  }

  async getInvite(token: string): Promise<OrganizationInvite | null> {
    const collection = await this.getCollection();
    const result = await collection.aggregate([
      { $unwind: '$invites' },
      { $match: { 'invites.token': token, 'invites.expiresAt': { $gt: new Date() }, 'invites.status': 'pending' } },
      { $project: { invites: 1 } },
    ]).toArray();
    
    return result[0]?.invites || null;
  }

  async createInvite(organizationId: string, invite: OrganizationInvite, tenantId: string): Promise<void> {
    const collection = await this.getCollection();
    await collection.updateOne(
      { _id: new ObjectId(organizationId), tenantId },
      { $push: { invites: invite } }
    );
  }

  async acceptInvite(token: string, userId: string, userName: string): Promise<Organization | null> {
    const collection = await this.getCollection();
    const invite = await this.getInvite(token);
    
    if (!invite) return null;
    
    const organization = await this.findOne({ _id: new ObjectId(invite.organizationId) }, 'system', true);
    if (!organization) return null;
    
    await collection.updateOne(
      { _id: new ObjectId(invite.organizationId) },
      {
        $push: {
          members: {
            userId,
            email: invite.email,
            name: userName,
            role: invite.role,
            permissions: [],
            status: 'active',
            joinedAt: new Date(),
            invitedBy: invite.invitedBy,
          },
        },
        $pull: { invites: { token } },
        $set: { 'invites.$.status': 'accepted' },
      }
    );
    
    return organization;
  }
}

export const organizationRepository = new OrganizationRepository();
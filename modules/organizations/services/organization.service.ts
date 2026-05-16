// modules/organizations/services/organization.service.ts

import { BaseService } from '@/server/services/base.service';
import { organizationRepository } from '../repositories/organization.repository';
import { Organization, OrganizationMember, OrganizationInvite } from '@/shared/types/organization.types';
import { AppError, ConflictError, NotFoundError } from '@/server/errors/app.errors';
import { randomUUID } from 'crypto';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';
import { webSocketManager } from '@/infrastructure/websocket/server';
import { queueService, JobType } from '@/infrastructure/queue/queue.service';

export class OrganizationService {
  async createOrganization(data: {
    name: string;
    ownerId: string;
    ownerEmail: string;
    ownerName: string;
    settings?: Partial<Organization['settings']>;
  }): Promise<Organization> {
    const slug = this.generateSlug(data.name);
    
    const existing = await organizationRepository.findBySlug(slug);
    if (existing) {
      throw new ConflictError('Organization with this name already exists');
    }
    
    const organization: Omit<Organization, '_id' | 'createdAt' | 'updatedAt'> = {
      name: data.name,
      slug,
      tenantId: slug,
      branding: {
        primaryColor: '#3b82f6',
        companyName: data.name,
        theme: 'system',
      },
      settings: {
        timezone: 'UTC',
        dateFormat: 'MM/DD/YYYY',
        currency: 'USD',
        distanceUnit: 'km',
        volumeUnit: 'L',
        language: 'en',
        notificationsEnabled: true,
        emailReports: true,
        ...data.settings,
      },
      subscription: {
        tier: 'free',
        planId: 'free',
        status: 'active',
        seats: 5,
        usedSeats: 1,
        startDate: new Date(),
        features: ['basic_analytics', 'basic_reports', 'email_notifications'],
      },
      features: {
        maxVehicles: 10,
        maxUsers: 5,
        maxStorage: 5,
        customBranding: false,
        advancedAnalytics: false,
        telematics: false,
        apiAccess: false,
        auditLogs: false,
        prioritySupport: false,
      },
      status: 'active',
      ownerId: data.ownerId,
      members: [{
        userId: data.ownerId,
        email: data.ownerEmail,
        name: data.ownerName,
        role: 'owner',
        permissions: [],
        status: 'active',
        joinedAt: new Date(),
      }],
      isDeleted: false,
    };
    
    const result = await organizationRepository.create(organization, slug, data.ownerId);
    
    await auditLog.logAction('ORGANIZATION_CREATED', data.ownerId, slug, { name: data.name });
    
    return result;
  }
  
  async getOrganization(organizationId: string, tenantId: string): Promise<Organization> {
    const organization = await organizationRepository.findById(organizationId, tenantId);
    if (!organization) {
      throw new NotFoundError('Organization not found');
    }
    return organization;
  }
  
  async updateOrganization(organizationId: string, data: Partial<Organization>, tenantId: string, userId: string): Promise<Organization> {
    const organization = await organizationRepository.update(organizationId, data, tenantId, userId);
    if (!organization) {
      throw new NotFoundError('Organization not found');
    }
    
    await auditLog.logAction('ORGANIZATION_UPDATED', userId, tenantId, { organizationId, updates: Object.keys(data) });
    
    return organization;
  }
  
  async addMember(organizationId: string, email: string, role: string, invitedBy: string, tenantId: string): Promise<OrganizationInvite> {
    const organization = await this.getOrganization(organizationId, tenantId);
    
    // Check seat limits
    if (organization.members.length >= organization.subscription.seats) {
      throw new AppError('Organization has reached its seat limit', 'SEAT_LIMIT_REACHED', 400);
    }
    
    const existingMember = organization.members.find(m => m.email === email);
    if (existingMember) {
      throw new ConflictError('User is already a member of this organization');
    }
    
    const token = randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry
    
    const invite: OrganizationInvite = {
      organizationId,
      email,
      role,
      invitedBy,
      token,
      expiresAt,
      status: 'pending',
    };
    
    await organizationRepository.createInvite(organizationId, invite, tenantId);
    
    // Send invitation email via queue
    await queueService.addJob(JobType.SEND_NOTIFICATION, {
      type: JobType.SEND_NOTIFICATION,
      payload: {
        type: 'organization_invite',
        email,
        data: { organizationName: organization.name, role, token, invitedBy },
      },
      tenantId,
      userId: invitedBy,
    });
    
    await auditLog.logAction('MEMBER_INVITED', invitedBy, tenantId, { email, role });
    
    return invite;
  }
  
  async acceptInvite(token: string, userId: string, userName: string): Promise<Organization> {
    const organization = await organizationRepository.acceptInvite(token, userId, userName);
    if (!organization) {
      throw new NotFoundError('Invalid or expired invitation');
    }
    
    await auditLog.logAction('MEMBER_JOINED', userId, organization.tenantId, { organizationId: organization._id });
    
    webSocketManager.emitToTenant(organization.tenantId, 'organization:member_joined', {
      userId,
      name: userName,
      organizationId: organization._id,
    });
    
    return organization;
  }
  
  async removeMember(organizationId: string, memberId: string, userId: string, tenantId: string): Promise<void> {
    const organization = await this.getOrganization(organizationId, tenantId);
    
    const member = organization.members.find(m => m.userId === memberId);
    if (!member) {
      throw new NotFoundError('Member not found');
    }
    
    if (member.role === 'owner') {
      throw new AppError('Cannot remove organization owner', 'CANNOT_REMOVE_OWNER', 400);
    }
    
    await organizationRepository.removeMember(organizationId, memberId, tenantId);
    
    await auditLog.logAction('MEMBER_REMOVED', userId, tenantId, { memberId, email: member.email });
    
    webSocketManager.emitToUser(memberId, 'organization:member_removed', {
      organizationId,
      organizationName: organization.name,
    });
  }
  
  async switchOrganization(userId: string, organizationId: string): Promise<{ token: string }> {
    // This would generate a new JWT with the new organization context
    // Implementation would be in the auth service
    return { token: 'new-jwt-token' };
  }
  
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
}

export const organizationService = new OrganizationService();
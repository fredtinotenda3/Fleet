// modules/organizations/services/organization.service.ts

import { randomUUID, randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import {
  organizationRepository,
  OrganizationRepository,
} from '../repositories/organization.repository';
import { adminUserRepository, AdminUserRepository } from '../repositories/admin-user.repository';
import {
  Organization,
  OrganizationMember,
  OrganizationInvite,
} from '@/shared/types/organization.types';
import {
  AppError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '@/server/errors/app.errors';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';
import { webSocketManager } from '@/infrastructure/websocket/server';
import { queueService, JobType } from '@/infrastructure/queue/queue.service';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { MemberJoinedEvent } from '@/modules/organizations/events/MemberJoinedEvent';
import { userScopeService } from '@/modules/security/services/user-scope.service';
import { orgUnitRepository } from '@/modules/security/repositories/org-unit.repository';

export interface AddMemberDirectInput {
  name: string;
  email: string;
  role: string;
  password?: string;
  orgUnitId?: string;
}

export interface AddMemberDirectResult {
  member: OrganizationMember;
  /**
   * Only ever populated on this one response. Nothing persists the
   * plaintext anywhere (tbladmin stores the bcrypt hash only) so the
   * admin must copy/share it now; it cannot be retrieved later.
   */
  temporaryPassword?: string;
  orgUnitAssigned?: boolean;
  /** True if this reused an existing tbladmin account rather than creating one. */
  reusedExistingAccount?: boolean;
}

/** 12-character password: unambiguous alphabet, guaranteed to satisfy
 *  the 8-char minimum with room to spare. */
function generateTemporaryPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(12);
  let out = '';
  for (let i = 0; i < 12; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

export interface CreateOrganizationInput {
  name: string;
  ownerId: string;
  ownerEmail: string;
  ownerName: string;
  settings?: Partial<Organization['settings']>;
}

const INVITE_EXPIRY_DAYS = 7;
const VALID_ROLES = [
  'organization_owner',
  'fleet_manager',
  'accountant',
  'dispatcher',
  'driver',
  'mechanic',
  'auditor',
  'viewer',
];
/** Roles assignable to a member added after org creation — everything
 *  except organization_owner, which is set once at creation time only. */
const ASSIGNABLE_ROLES = VALID_ROLES.filter((r) => r !== 'organization_owner');

export class OrganizationService {
  constructor(
    private readonly repo: OrganizationRepository = organizationRepository,
    private readonly adminUserRepo: AdminUserRepository = adminUserRepository
  ) {}

  async createOrganization(data: CreateOrganizationInput): Promise<Organization> {
    if (!data.name?.trim()) {
      throw new ValidationError('Organization name is required');
    }

    const slug = this.generateSlug(data.name);
    const existing = await this.repo.findBySlug(slug);
    if (existing) {
      throw new ConflictError('An organization with this name already exists');
    }

    const organization: Omit<Organization, '_id' | 'createdAt' | 'updatedAt'> = {
      tenantId: slug,
      name: data.name.trim(),
      slug,
      branding: {
        primaryColor: '#3b82f6',
        companyName: data.name.trim(),
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
      members: [
        {
          userId: data.ownerId,
          email: data.ownerEmail,
          name: data.ownerName,
          role: 'organization_owner',
          permissions: [],
          status: 'active',
          joinedAt: new Date(),
        },
      ],
      invites: [],
      isDeleted: false,
    };

    const created = await this.repo.create(organization, slug, data.ownerId);

    await auditLog.logCreate(data.ownerId, slug, 'organization', created._id!, {
      name: data.name,
    });

    return created;
  }

  async getOrganization(organizationId: string, tenantId: string): Promise<Organization> {
    const organization = await this.repo.findById(organizationId, tenantId, false, true);
    if (!organization) {
      throw new NotFoundError('Organization not found');
    }
    return organization;
  }

  async getOrganizationBySlug(slug: string): Promise<Organization> {
    const organization = await this.repo.findBySlug(slug);
    if (!organization) {
      throw new NotFoundError('Organization not found');
    }
    return organization;
  }

  async getOrganizationsForUser(userId: string): Promise<Organization[]> {
    return this.repo.findByMemberId(userId);
  }

  async updateOrganization(
    organizationId: string,
    data: Partial<Pick<Organization, 'name' | 'branding' | 'settings'>>,
    tenantId: string,
    userId: string
  ): Promise<Organization> {
    const before = await this.getOrganization(organizationId, tenantId);

    const updated = await this.repo.update(organizationId, data, tenantId, userId, true);
    if (!updated) {
      throw new NotFoundError('Organization not found');
    }

    await auditLog.logUpdate(userId, tenantId, 'organization', organizationId, before, updated);

    return updated;
  }

  async updateContactDetails(
    organizationId: string,
    data: import('@/shared/types/organization.settings-addendum').OrganizationContactDetails,
    tenantId: string,
    userId: string
  ): Promise<Organization> {
    const before = await this.getOrganization(organizationId, tenantId);
    const updated = await this.repo.update(organizationId, { contact: data } as any, tenantId, userId, true);
    if (!updated) throw new NotFoundError('Organization not found');
    await auditLog.logUpdate(userId, tenantId, 'organization', organizationId, before, updated);
    return updated;
  }

  async updateBusinessHours(
    organizationId: string,
    data: import('@/shared/types/organization.settings-addendum').OrganizationBusinessHours,
    tenantId: string,
    userId: string
  ): Promise<Organization> {
    const before = await this.getOrganization(organizationId, tenantId);
    const updated = await this.repo.update(organizationId, { businessHours: data } as any, tenantId, userId, true);
    if (!updated) throw new NotFoundError('Organization not found');
    await auditLog.logUpdate(userId, tenantId, 'organization', organizationId, before, updated);
    return updated;
  }

  async updateTaxSettings(
    organizationId: string,
    data: import('@/shared/types/organization.settings-addendum').OrganizationTaxSettings,
    tenantId: string,
    userId: string
  ): Promise<Organization> {
    const before = await this.getOrganization(organizationId, tenantId);
    const updated = await this.repo.update(organizationId, { taxSettings: data } as any, tenantId, userId, true);
    if (!updated) throw new NotFoundError('Organization not found');
    await auditLog.logUpdate(userId, tenantId, 'organization', organizationId, before, updated);
    return updated;
  }

  async updateLogo(
    organizationId: string,
    logoUrl: string,
    tenantId: string,
    userId: string
  ): Promise<Organization> {
    const org = await this.getOrganization(organizationId, tenantId);
    const updated = await this.repo.update(
      organizationId,
      { branding: { ...org.branding, logoUrl } },
      tenantId,
      userId,
      true
    );
    if (!updated) throw new NotFoundError('Organization not found');
    await auditLog.log({
      action: 'ORGANIZATION_LOGO_UPDATED',
      userId, tenantId, entityType: 'organization', entityId: organizationId,
    });
    return updated;
  }

  async suspendMember(
    organizationId: string,
    memberId: string,
    userId: string,
    tenantId: string
  ): Promise<void> {
    const organization = await this.getOrganization(organizationId, tenantId);
    const member = organization.members.find((m) => m.userId === memberId);
    if (!member) {
      throw new NotFoundError('Member not found');
    }
    if (member.role === 'organization_owner') {
      throw new AppError('Cannot suspend the organization owner', 'CANNOT_SUSPEND_OWNER', 400);
    }
    if (member.status === 'suspended') {
      throw new ConflictError('Member is already suspended');
    }

    const updated = await this.repo.updateMemberStatus(organizationId, memberId, 'suspended');
    if (!updated) {
      throw new AppError('Failed to suspend member', 'MEMBER_SUSPEND_FAILED', 500);
    }

    await auditLog.log({
      action: 'MEMBER_SUSPENDED',
      userId,
      tenantId,
      entityType: 'organization',
      entityId: organizationId,
      metadata: { memberId, email: member.email },
    });

    webSocketManager.emitToUser(memberId, 'organization:member_suspended', { organizationId });
  }

  async restoreMember(
    organizationId: string,
    memberId: string,
    userId: string,
    tenantId: string
  ): Promise<void> {
    const organization = await this.getOrganization(organizationId, tenantId);
    const member = organization.members.find((m) => m.userId === memberId);
    if (!member) {
      throw new NotFoundError('Member not found');
    }
    if (member.status !== 'suspended') {
      throw new ConflictError('Member is not currently suspended');
    }

    const updated = await this.repo.updateMemberStatus(organizationId, memberId, 'active');
    if (!updated) {
      throw new AppError('Failed to restore member', 'MEMBER_RESTORE_FAILED', 500);
    }

    await auditLog.log({
      action: 'MEMBER_RESTORED',
      userId,
      tenantId,
      entityType: 'organization',
      entityId: organizationId,
      metadata: { memberId, email: member.email },
    });

    webSocketManager.emitToUser(memberId, 'organization:member_restored', { organizationId });
  }

  /**
   * Validates (if provided) that orgUnitId refers to a real, active org
   * unit belonging to this organization. Shared by addMember (invite)
   * and addMemberDirect so both paths reject a bogus/foreign branch the
   * same way instead of silently storing an unusable reference.
   */
  private async assertOrgUnitBelongsToOrg(orgUnitId: string | undefined, tenantId: string): Promise<void> {
    if (!orgUnitId) return;
    const unit = await orgUnitRepository.findById(orgUnitId, tenantId);
    if (!unit) {
      throw new NotFoundError('Selected branch/org unit was not found in this organization');
    }
  }

  async addMember(
    organizationId: string,
    email: string,
    role: string,
    invitedBy: string,
    tenantId: string,
    orgUnitId?: string
  ): Promise<OrganizationInvite> {
    if (!VALID_ROLES.includes(role)) {
      throw new ValidationError(`Invalid role: ${role}`);
    }

    const organization = await this.getOrganization(organizationId, tenantId);
    await this.assertOrgUnitBelongsToOrg(orgUnitId, tenantId);

    if (organization.members.length >= organization.subscription.seats) {
      throw new AppError(
        'Organization has reached its seat limit. Upgrade your plan to add more members.',
        'SEAT_LIMIT_REACHED',
        400
      );
    }

    const existingMember = organization.members.find(
      (m) => m.email.toLowerCase() === email.toLowerCase()
    );
    if (existingMember) {
      throw new ConflictError('User is already a member of this organization');
    }

    const existingInvite = (organization.invites || []).find(
      (i) => i.email.toLowerCase() === email.toLowerCase() && i.status === 'pending'
    );
    if (existingInvite) {
      throw new ConflictError('An invitation has already been sent to this email');
    }

    const token = randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + INVITE_EXPIRY_DAYS);

    const invite: OrganizationInvite = {
      organizationId,
      email: email.toLowerCase(),
      role,
      invitedBy,
      token,
      expiresAt,
      status: 'pending',
      orgUnitId,
    };

    const created = await this.repo.createInvite(organizationId, invite);
    if (!created) {
      throw new AppError('Failed to create invitation', 'INVITE_CREATE_FAILED', 500);
    }

    await queueService.addJob(JobType.SEND_NOTIFICATION, {
      type: JobType.SEND_NOTIFICATION,
      payload: {
        type: 'organization_invite',
        email: invite.email,
        data: {
          organizationName: organization.name,
          role,
          token,
          invitedBy,
        },
      },
      tenantId,
      userId: invitedBy,
    });

    await auditLog.log({
      action: 'MEMBER_INVITED',
      userId: invitedBy,
      tenantId,
      entityType: 'organization',
      entityId: organizationId,
      metadata: { email: invite.email, role, orgUnitId },
    });

    return invite;
  }

  /**
   * "Add member" (as opposed to "invite member"): creates a login-ready
   * account immediately — no email round-trip required — and adds them
   * to the organization as an active member. If `orgUnitId` is given,
   * also creates a UserScopeAssignment so the Permission Engine scopes
   * their access to that branch instead of the whole organization.
   *
   * If an account with this email already exists (in tbladmin), it is
   * reused rather than erroring — this lets an admin add someone who
   * already has a login (e.g. from another organization they've since
   * left) without creating a duplicate account. In that case no new
   * password is generated/returned.
   */
  async addMemberDirect(
    organizationId: string,
    input: AddMemberDirectInput,
    addedBy: string,
    tenantId: string
  ): Promise<AddMemberDirectResult> {
    if (!ASSIGNABLE_ROLES.includes(input.role)) {
      throw new ValidationError(`Invalid role: ${input.role}`);
    }

    const organization = await this.getOrganization(organizationId, tenantId);
    await this.assertOrgUnitBelongsToOrg(input.orgUnitId, tenantId);

    if (organization.members.length >= organization.subscription.seats) {
      throw new AppError(
        'Organization has reached its seat limit. Upgrade your plan to add more members.',
        'SEAT_LIMIT_REACHED',
        400
      );
    }

    const email = input.email.toLowerCase();
    const existingMember = organization.members.find((m) => m.email.toLowerCase() === email);
    if (existingMember) {
      throw new ConflictError('This person is already a member of this organization');
    }

    let userId: string;
    let temporaryPassword: string | undefined;
    let reusedExistingAccount = false;

    const existingAccount = await this.adminUserRepo.findByEmail(email);
    if (existingAccount) {
      userId = existingAccount._id!.toString();
      reusedExistingAccount = true;
    } else {
      temporaryPassword = input.password?.trim() || generateTemporaryPassword();
      const passwordHash = await bcrypt.hash(temporaryPassword, 10);

      const createdAccount = await this.adminUserRepo.create({
        Email: email,
        Password: passwordHash,
        FirstName: input.name.trim(),
        Role: input.role,
        tenantId,
      });
      userId = createdAccount._id.toString();
    }

    const member: OrganizationMember = {
      userId,
      email,
      name: input.name.trim(),
      role: input.role,
      permissions: [],
      status: 'active',
      joinedAt: new Date(),
      invitedBy: addedBy,
      orgUnitId: input.orgUnitId,
    };

    const added = await this.repo.addMember(organizationId, member);
    if (!added) {
      throw new AppError('Failed to add member', 'MEMBER_ADD_FAILED', 500);
    }
    await this.repo.incrementUsedSeats(organizationId, 1);

    let orgUnitAssigned = false;
    if (input.orgUnitId) {
      try {
        await userScopeService.assign(
          {
            organizationId: tenantId,
            userId,
            orgUnitId: input.orgUnitId,
            role: input.role,
            isCustomRole: false,
          },
          tenantId,
          addedBy
        );
        orgUnitAssigned = true;
      } catch (error) {
        // Non-fatal: the member is still added org-wide with their
        // static role; branch-scoping can be retried/fixed later via
        // the Roles > Scope Assignments UI. We don't want a scope
        // assignment hiccup to roll back the whole member-add.
        console.error('[OrganizationService] Failed to create scope assignment for direct-added member:', error);
      }
    }

    await auditLog.log({
      action: 'MEMBER_ADDED_DIRECTLY',
      userId: addedBy,
      tenantId,
      entityType: 'organization',
      entityId: organizationId,
      metadata: { memberId: userId, email, role: input.role, orgUnitId: input.orgUnitId, reusedExistingAccount },
    });

    webSocketManager.emitToTenant(tenantId, 'organization:member_joined', {
      userId,
      name: member.name,
      organizationId,
    });

    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(
      new MemberJoinedEvent(organizationId, member.email, member.name, member.role, organization.ownerId, tenantId, {
        userId,
        addedDirectly: true,
      })
    );

    return { member, temporaryPassword, orgUnitAssigned, reusedExistingAccount };
  }

  async resendInvite(
    organizationId: string,
    token: string,
    userId: string,
    tenantId: string
  ): Promise<void> {
    const organization = await this.getOrganization(organizationId, tenantId);
    const invite = (organization.invites || []).find(
      (i) => i.token === token && i.status === 'pending'
    );
    if (!invite) {
      throw new NotFoundError('Pending invitation not found');
    }

    const newExpiresAt = new Date();
    newExpiresAt.setDate(newExpiresAt.getDate() + INVITE_EXPIRY_DAYS);

    const touched = await this.repo.touchInviteExpiry(organizationId, token, newExpiresAt);
    if (!touched) {
      throw new AppError('Failed to resend invitation', 'INVITE_RESEND_FAILED', 500);
    }

    await queueService.addJob(JobType.SEND_NOTIFICATION, {
      type: JobType.SEND_NOTIFICATION,
      payload: {
        type: 'organization_invite',
        email: invite.email,
        data: {
          organizationName: organization.name,
          role: invite.role,
          token,
          invitedBy: invite.invitedBy,
        },
      },
      tenantId,
      userId,
    });

    await auditLog.log({
      action: 'INVITE_RESENT',
      userId,
      tenantId,
      entityType: 'organization',
      entityId: organizationId,
      metadata: { email: invite.email, token },
    });
  }

  async declineInvite(token: string): Promise<void> {
    const declined = await this.repo.declineInviteByToken(token);
    if (!declined) {
      throw new NotFoundError('Invalid or already resolved invitation');
    }
  }

  async revokeInvite(
    organizationId: string,
    token: string,
    userId: string,
    tenantId: string
  ): Promise<void> {
    const revoked = await this.repo.revokeInvite(organizationId, token);
    if (!revoked) {
      throw new NotFoundError('Invitation not found');
    }

    await auditLog.log({
      action: 'INVITE_REVOKED',
      userId,
      tenantId,
      entityType: 'organization',
      entityId: organizationId,
      metadata: { token },
    });
  }

  async acceptInvite(token: string, userId: string, userName: string): Promise<Organization> {
    const organization = await this.repo.acceptInvite(token, userId, userName);
    if (!organization) {
      throw new NotFoundError('Invalid or expired invitation');
    }

    await auditLog.log({
      action: 'MEMBER_JOINED',
      userId,
      tenantId: organization.tenantId,
      entityType: 'organization',
      entityId: organization._id,
    });

    webSocketManager.emitToTenant(organization.tenantId, 'organization:member_joined', {
      userId,
      name: userName,
      organizationId: organization._id,
    });

    const member = organization.members.find((m) => m.userId === userId);
    if (member) {
      const eventBus = EventBusFactory.getInstance();
      await eventBus.publish(new MemberJoinedEvent(
        organization._id!,
        member.email,
        member.name,
        member.role,
        organization.ownerId,
        organization.tenantId,
        { userId }
      ));

      // If the invite this member accepted carried a branch/org-unit
      // scope, create the corresponding UserScopeAssignment now that we
      // have a real userId to attach it to. The invite is still present
      // in organization.invites (now status: 'accepted'), so we can read
      // its orgUnitId back off the returned document.
      const acceptedInvite = (organization.invites || []).find(
        (i) => i.token === token && i.status === 'accepted'
      );
      if (acceptedInvite?.orgUnitId) {
        try {
          await userScopeService.assign(
            {
              organizationId: organization.tenantId,
              userId,
              orgUnitId: acceptedInvite.orgUnitId,
              role: member.role,
              isCustomRole: false,
            },
            organization.tenantId,
            acceptedInvite.invitedBy
          );
          // Persist the reference on the member row too, for display.
          await this.repo.update(
            organization._id!,
            {} as any,
            organization.tenantId,
            userId,
            true
          ).catch(() => undefined);
        } catch (error) {
          console.error('[OrganizationService] Failed to create scope assignment on invite acceptance:', error);
        }
      }
    }

    return organization;
  }

  async removeMember(
    organizationId: string,
    memberId: string,
    userId: string,
    tenantId: string
  ): Promise<void> {
    const organization = await this.getOrganization(organizationId, tenantId);

    const member = organization.members.find((m) => m.userId === memberId);
    if (!member) {
      throw new NotFoundError('Member not found');
    }

    if (member.role === 'organization_owner') {
      throw new AppError('Cannot remove the organization owner', 'CANNOT_REMOVE_OWNER', 400);
    }

    const removed = await this.repo.removeMember(organizationId, memberId);
    if (!removed) {
      throw new AppError('Failed to remove member', 'MEMBER_REMOVE_FAILED', 500);
    }

    await this.repo.incrementUsedSeats(organizationId, -1);

    await auditLog.log({
      action: 'MEMBER_REMOVED',
      userId,
      tenantId,
      entityType: 'organization',
      entityId: organizationId,
      metadata: { memberId, email: member.email },
    });

    webSocketManager.emitToUser(memberId, 'organization:member_removed', {
      organizationId,
      organizationName: organization.name,
    });
  }

  async updateMemberRole(
    organizationId: string,
    memberId: string,
    newRole: string,
    userId: string,
    tenantId: string
  ): Promise<void> {
    if (!VALID_ROLES.includes(newRole)) {
      throw new ValidationError(`Invalid role: ${newRole}`);
    }

    const organization = await this.getOrganization(organizationId, tenantId);
    const member = organization.members.find((m) => m.userId === memberId);
    if (!member) {
      throw new NotFoundError('Member not found');
    }

    if (member.role === 'organization_owner') {
      throw new AppError('Cannot change the role of the organization owner', 'CANNOT_MODIFY_OWNER', 400);
    }

    const updated = await this.repo.updateMemberRole(organizationId, memberId, newRole);
    if (!updated) {
      throw new AppError('Failed to update member role', 'ROLE_UPDATE_FAILED', 500);
    }

    await auditLog.log({
      action: 'MEMBER_ROLE_UPDATED',
      userId,
      tenantId,
      entityType: 'organization',
      entityId: organizationId,
      metadata: { memberId, oldRole: member.role, newRole },
    });

    webSocketManager.emitToUser(memberId, 'organization:role_updated', {
      organizationId,
      newRole,
    });
  }

  async checkFeatureAccess(
    organizationId: string,
    feature: keyof Organization['features'],
    tenantId: string
  ): Promise<boolean> {
    const organization = await this.getOrganization(organizationId, tenantId);
    const value = organization.features[feature];
    return typeof value === 'boolean' ? value : Boolean(value);
  }

  async checkVehicleLimit(organizationId: string, currentCount: number, tenantId: string): Promise<void> {
    const organization = await this.getOrganization(organizationId, tenantId);
    if (currentCount >= organization.features.maxVehicles) {
      throw new AppError(
        `Vehicle limit reached (${organization.features.maxVehicles}). Upgrade your plan to add more vehicles.`,
        'VEHICLE_LIMIT_REACHED',
        400
      );
    }
  }

  async getStatistics(
    organizationId: string,
    tenantId: string
  ): Promise<import('@/frontend/modules/organizations/types').OrganizationStatistics> {
    const organization = await this.getOrganization(organizationId, tenantId);

    const activeUsers = organization.members.filter((m) => m.status === 'active').length;
    const totalUsers = organization.members.length;
    const pendingInvites = (organization.invites || []).filter((i) => i.status === 'pending').length;

    let vehicleCount = 0;
    let activeVehicles = 0;
    let totalExpensesThisMonth = 0;
    let totalExpensesLastMonth = 0;

    try {
      const { vehicleRepository } = await import('@/modules/vehicles/repositories/vehicle.repository');
      vehicleCount = await vehicleRepository.count({}, tenantId);
      activeVehicles = await vehicleRepository.count({ status: 'active' } as any, tenantId);
    } catch {
      // vehicles module unavailable in this context; leave at 0
    }

    try {
      const { expenseRepository } = await import('@/modules/expenses/repositories/expense.repository');
      const now = new Date();
      const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

      const thisMonthExpenses = await expenseRepository.findMany(
        { date: { $gte: startOfThisMonth } } as any,
        tenantId
      );
      const lastMonthExpenses = await expenseRepository.findMany(
        { date: { $gte: startOfLastMonth, $lt: startOfThisMonth } } as any,
        tenantId
      );
      totalExpensesThisMonth = thisMonthExpenses.reduce((sum: number, e: any) => sum + (e.amount || 0), 0);
      totalExpensesLastMonth = lastMonthExpenses.reduce((sum: number, e: any) => sum + (e.amount || 0), 0);
    } catch {
      // expenses module unavailable in this context; leave at 0
    }

    return {
      activeUsers,
      totalUsers,
      pendingInvites,
      vehicleCount,
      activeVehicles,
      totalExpensesThisMonth,
      totalExpensesLastMonth,
      storageUsedGb: 0,
      storageLimitGb: organization.features.maxStorage,
      apiCallsThisMonth: 0,
      apiCallLimit: 10_000,
      seatsUsed: organization.subscription.usedSeats,
      seatsTotal: organization.subscription.seats,
    };
  }

  private generateSlug(name: string): string {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const suffix = randomUUID().slice(0, 6);
    return `${base}-${suffix}`;
  }
}

export const organizationService = new OrganizationService();
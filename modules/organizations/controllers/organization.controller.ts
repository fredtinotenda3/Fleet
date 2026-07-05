// modules/organizations/controllers/organization.controller.ts

import { NextRequest } from 'next/server';
import { organizationService } from '../services/organization.service';
import {
  successResponse,
  createdResponse,
  errorResponse,
} from '@/server/utils/response.utils';
import { AppError } from '@/server/errors/app.errors';
import {
  getTenantFromRequest,
  getUserIdFromRequest,
} from '@/server/utils/context.utils';

export class OrganizationController {
  async createOrganization(req: NextRequest) {
    try {
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();

      const organization = await organizationService.createOrganization({
        name: body.name,
        ownerId: userId,
        ownerEmail: body.ownerEmail,
        ownerName: body.ownerName,
        settings: body.settings,
      });

      return createdResponse(organization);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getOrganization(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const organization = await organizationService.getOrganization(id, tenantId);
      return successResponse(organization);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getMyOrganizations(req: NextRequest) {
    try {
      const userId = await getUserIdFromRequest(req);
      const organizations = await organizationService.getOrganizationsForUser(userId);
      return successResponse(organizations);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async updateOrganization(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();

      const organization = await organizationService.updateOrganization(
        id,
        body,
        tenantId,
        userId
      );
      return successResponse(organization);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async inviteMember(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const { email, role } = await req.json();

      const invite = await organizationService.addMember(id, email, role, userId, tenantId);
      return createdResponse(invite);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async revokeInvite(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const token = req.nextUrl.searchParams.get('token');

      if (!token) {
        return errorResponse('Invite token is required', 'VALIDATION_ERROR', 400);
      }

      await organizationService.revokeInvite(id, token, userId, tenantId);
      return successResponse({ message: 'Invitation revoked' });
    } catch (error) {
      return this.handleError(error);
    }
  }

  async acceptInvite(req: NextRequest) {
    try {
      const userId = await getUserIdFromRequest(req);
      const { token, name } = await req.json();

      const organization = await organizationService.acceptInvite(token, userId, name);
      return successResponse(organization);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async removeMember(req: NextRequest, id: string, memberId: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);

      await organizationService.removeMember(id, memberId, userId, tenantId);
      return successResponse({ message: 'Member removed successfully' });
    } catch (error) {
      return this.handleError(error);
    }
  }

  async updateMemberRole(req: NextRequest, id: string, memberId: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const { role } = await req.json();

      await organizationService.updateMemberRole(id, memberId, role, userId, tenantId);
      return successResponse({ message: 'Member role updated successfully' });
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (error instanceof AppError) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }
    console.error('[OrganizationController] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const organizationController = new OrganizationController();
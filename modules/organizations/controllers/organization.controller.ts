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

  async suspendMember(req: NextRequest, id: string, memberId: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      await organizationService.suspendMember(id, memberId, userId, tenantId);
      return successResponse({ message: 'Member suspended successfully' });
    } catch (error) {
      return this.handleError(error);
    }
  }

  async restoreMember(req: NextRequest, id: string, memberId: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      await organizationService.restoreMember(id, memberId, userId, tenantId);
      return successResponse({ message: 'Member restored successfully' });
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

  async resendInvite(req: NextRequest, id: string, token: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      await organizationService.resendInvite(id, token, userId, tenantId);
      return successResponse({ message: 'Invitation resent' });
    } catch (error) {
      return this.handleError(error);
    }
  }

  async declineInvite(req: NextRequest) {
    try {
      const { token } = await req.json();
      await organizationService.declineInvite(token);
      return successResponse({ message: 'Invitation declined' });
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

  async getStatistics(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const stats = await organizationService.getStatistics(id, tenantId);
      return successResponse(stats);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async updateContactDetails(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();
      const { contactDetailsUpdateSchema } = await import('@/shared/validations/organization.settings-addendum.schema');
      const parsed = contactDetailsUpdateSchema.safeParse(body);
      if (!parsed.success) return errorResponse('Invalid contact details', 'VALIDATION_ERROR', 400, parsed.error.flatten());

      const org = await organizationService.updateContactDetails(id, parsed.data, tenantId, userId);
      return successResponse(org);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async updateBusinessHours(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();
      const { businessHoursUpdateSchema } = await import('@/shared/validations/organization.settings-addendum.schema');
      const parsed = businessHoursUpdateSchema.safeParse(body);
      if (!parsed.success) return errorResponse('Invalid business hours', 'VALIDATION_ERROR', 400, parsed.error.flatten());

      const org = await organizationService.updateBusinessHours(id, parsed.data, tenantId, userId);
      return successResponse(org);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async updateTaxSettings(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();
      const { taxSettingsUpdateSchema } = await import('@/shared/validations/organization.settings-addendum.schema');
      const parsed = taxSettingsUpdateSchema.safeParse(body);
      if (!parsed.success) return errorResponse('Invalid tax settings', 'VALIDATION_ERROR', 400, parsed.error.flatten());

      const org = await organizationService.updateTaxSettings(id, parsed.data, tenantId, userId);
      return successResponse(org);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async updateLogo(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const formData = await req.formData();
      const file = formData.get('logo') as File | null;
      if (!file) return errorResponse('No logo file provided', 'VALIDATION_ERROR', 400);

      const { storageService } = await import('@/infrastructure/storage/storage.service');
      const buffer = Buffer.from(await file.arrayBuffer());
      const { url } = await storageService.upload({
        buffer,
        contentType: file.type,
        key: `organizations/${tenantId}/logo-${Date.now()}`,
      });

      const org = await organizationService.updateLogo(id, url, tenantId, userId);
      return successResponse(org);
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
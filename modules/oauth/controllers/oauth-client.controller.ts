// modules/oauth/controllers/oauth-client.controller.ts

import { NextRequest } from 'next/server';
import { oauthClientService, OAuthClientService } from '../services/oauth-client.service';
import {
  oauthClientCreateSchema,
  oauthClientUpdateSchema,
  oauthTokenRequestSchema,
} from '@/shared/validations/oauth.schema';
import { successResponse, createdResponse, errorResponse } from '@/server/utils/response.utils';
import { AppError, ValidationError, UnauthorizedError } from '@/server/errors/app.errors';
import { getTenantFromRequest, getUserIdFromRequest } from '@/server/utils/context.utils';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { oauthTokenService, OAuthTokenService } from '../services/oauth-token.service';

export class OAuthClientController {
  constructor(
    private readonly clientService: OAuthClientService = oauthClientService,
    private readonly tokenService: OAuthTokenService = oauthTokenService
  ) {}

  // ─── Client Management ──────────────────────────────────────────────────────

  async listClients(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const includeRevoked = req.nextUrl.searchParams.get('includeRevoked') === 'true';
      const clients = await this.clientService.listClients(tenantId, includeRevoked);
      return successResponse(clients);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getClient(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const client = await this.clientService.getClient(id, tenantId);
      return successResponse(client);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async createClient(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();

      const parsed = oauthClientCreateSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError('Invalid OAuth client request', parsed.error.flatten());
      }

      const result = await this.clientService.createClient(parsed.data, tenantId, userId);
      return createdResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async updateClient(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();

      const parsed = oauthClientUpdateSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError('Invalid OAuth client update', parsed.error.flatten());
      }

      const client = await this.clientService.updateClient(id, parsed.data, tenantId, userId);
      return successResponse(client);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async revokeClient(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json().catch(() => ({}));

      await this.clientService.revokeClient(id, tenantId, userId, body?.reason);
      return successResponse({ message: 'OAuth client revoked successfully' });
    } catch (error) {
      return this.handleError(error);
    }
  }

  async rotateSecret(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);

      const result = await this.clientService.rotateSecret(id, tenantId, userId);
      return successResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async deleteClient(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);

      await this.clientService.deleteClient(id, tenantId, userId);
      return successResponse({ message: 'OAuth client deleted successfully' });
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ─── Token Endpoints ────────────────────────────────────────────────────────

  /**
   * OAuth 2.0 Token endpoint.
   * This is public (no auth) - clients authenticate via client_id + client_secret.
   */
  async token(req: NextRequest) {
    try {
      const body = await req.json();
      const parsed = oauthTokenRequestSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError('Invalid token request', parsed.error.flatten());
      }

      const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
      const userAgent = req.headers.get('user-agent') || undefined;

      const response = await this.tokenService.issueToken(parsed.data, ipAddress, userAgent);
      return successResponse(response);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return errorResponse(error.message, error.code, error.statusCode);
      }
      return this.handleError(error);
    }
  }

  /**
   * OAuth 2.0 Introspection endpoint.
   * Requires client credentials via Basic Auth.
   */
  async introspect(req: NextRequest) {
    try {
      const auth = req.headers.get('authorization');
      if (!auth || !auth.startsWith('Basic ')) {
        return errorResponse('Basic authentication required', 'UNAUTHORIZED', 401);
      }

      const credentials = Buffer.from(auth.slice(6), 'base64').toString();
      const [clientId, clientSecret] = credentials.split(':');

      // Validate client
      const client = await this.clientService.getClientByClientId(clientId);
      if (!client) {
        return errorResponse('Invalid client credentials', 'UNAUTHORIZED', 401);
      }

      const body = await req.json();
      if (!body.token) {
        throw new ValidationError('token is required');
      }

      const result = await this.tokenService.introspectToken({ token: body.token });
      return successResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (error instanceof AppError) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }
    console.error('[OAuthClientController] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const oauthClientController = new OAuthClientController();
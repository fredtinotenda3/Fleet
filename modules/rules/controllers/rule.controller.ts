// modules/rules/controllers/rule.controller.ts

import { NextRequest } from 'next/server';
import { ruleRepository } from '../repositories/rule.repository';
import { ruleEngineService } from '../services/rule-engine.service';
import {
  ruleCreateSchema,
  ruleUpdateSchema,
  ruleTestSchema,
  ruleEvaluateTriggerSchema,
} from '@/shared/validations/rule.schema';
import { RuleConditionGroup, RuleStatus } from '../types/rule.types';
import { successResponse, createdResponse, errorResponse } from '@/server/utils/response.utils';
import { AppError, NotFoundError, ValidationError } from '@/server/errors/app.errors';
import { getTenantFromRequest, getUserIdFromRequest } from '@/server/utils/context.utils';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { RuleCreatedEvent } from '../events/RuleCreatedEvent';
import { RuleUpdatedEvent } from '../events/RuleUpdatedEvent';
import { RuleDeletedEvent } from '../events/RuleDeletedEvent';

export class RuleController {
  async listRules(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const searchParams = req.nextUrl.searchParams;

      const rules = await ruleRepository.getRules(tenantId, {
        category: searchParams.get('category') || undefined,
        trigger: searchParams.get('trigger') || undefined,
        status: (searchParams.get('status') as RuleStatus) || undefined,
        tag: searchParams.get('tag') || undefined,
      });

      return successResponse(rules);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getRule(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const rule = await ruleRepository.getRule(id, tenantId);
      if (!rule) throw new NotFoundError('Rule not found');
      return successResponse(rule);
    } catch (error) {
      return this.handleError(error);
    }
  }

 async createRule(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();

      const parsed = ruleCreateSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError('Invalid rule definition', parsed.error.flatten());
      }

      ruleEngineService.validateConditionGroup(parsed.data.conditions as RuleConditionGroup);

      // FIX: Construct a correctly typed payload for the repository
      const rulePayload = {
        ...parsed.data,
        conditions: parsed.data.conditions as RuleConditionGroup,
      };

      const rule = await ruleRepository.createRule(rulePayload, tenantId, userId);

      const eventBus = EventBusFactory.getInstance();
      await eventBus.publish(new RuleCreatedEvent(rule, { tenantId, userId }));

      return createdResponse(rule);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async updateRule(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();

      const parsed = ruleUpdateSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError('Invalid rule update', parsed.error.flatten());
      }

      if (parsed.data.conditions) {
        ruleEngineService.validateConditionGroup(parsed.data.conditions as RuleConditionGroup);
      }

      // FIX: Construct a correctly typed payload for the repository
      const rulePayload = {
        ...parsed.data,
        conditions: parsed.data.conditions as RuleConditionGroup,
      };

      const rule = await ruleRepository.updateRule(id, rulePayload, tenantId, userId);
      if (!rule) throw new NotFoundError('Rule not found');

      const eventBus = EventBusFactory.getInstance();
      await eventBus.publish(new RuleUpdatedEvent(rule, rulePayload, { tenantId, userId }));

      return successResponse(rule);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async deleteRule(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);

      const existing = await ruleRepository.getRule(id, tenantId);
      if (!existing) throw new NotFoundError('Rule not found');

      const deleted = await ruleRepository.deleteRule(id, tenantId, userId);
      if (!deleted) throw new NotFoundError('Rule not found');

      const eventBus = EventBusFactory.getInstance();
      await eventBus.publish(new RuleDeletedEvent(id, existing.name, tenantId, { userId }));

      return successResponse({ message: 'Rule deleted successfully' });
    } catch (error) {
      return this.handleError(error);
    }
  }

  async duplicateRule(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);

      const duplicate = await ruleRepository.duplicateRule(id, tenantId, userId);
      if (!duplicate) throw new NotFoundError('Rule not found');

      return createdResponse(duplicate);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async testRule(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const body = await req.json();

      const parsed = ruleTestSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError('Invalid test payload', parsed.error.flatten());
      }

      const result = await ruleEngineService.testRule(id, parsed.data.context, tenantId);
      return successResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Manually fires a trigger (e.g. from an admin "run now" button, or from
   * an external integration that doesn't yet go through the internal
   * domain event bus). Evaluates and executes every active rule for that
   * trigger, in priority order, exactly as if a real domain event of that
   * name had fired.
   */
  async evaluateTrigger(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();

      const parsed = ruleEvaluateTriggerSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError('Invalid trigger payload', parsed.error.flatten());
      }

      const results = await ruleEngineService.fireTrigger(
        parsed.data.trigger,
        parsed.data.context,
        tenantId,
        userId
      );

      return successResponse(results);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (error instanceof AppError) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }
    console.error('[RuleController] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const ruleController = new RuleController();
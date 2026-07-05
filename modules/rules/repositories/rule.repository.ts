/* eslint-disable @typescript-eslint/no-unused-vars */
// modules/rules/repositories/rule.repository.ts

import { Filter } from 'mongodb';
import { BaseRepository } from '@/server/repositories/base.repository';
import { Rule, RuleFilters, RuleStatus } from '../types/rule.types';

export class RuleRepository extends BaseRepository<Rule> {
  protected collectionName = 'tblrules';

  async getRules(tenantId: string, filters: RuleFilters = {}): Promise<Rule[]> {
    const filter: Record<string, unknown> = {};
    if (filters.category) filter.category = filters.category;
    if (filters.trigger) filter.trigger = filters.trigger;
    if (filters.status) filter.status = filters.status;
    if (filters.tag) filter.tags = filters.tag;

    return this.findMany(filter as Filter<Rule>, tenantId, {
      sortBy: 'priority',
      sortOrder: 'asc',
    });
  }

  /**
   * The only read path the engine itself uses at evaluation time. Kept
   * separate from `getRules` (which serves the admin list UI) so this
   * hot path always applies the `status: 'active'` + priority-sort
   * filter, no matter what the admin UI's filters look like.
   */
  async getActiveRulesForTrigger(trigger: string, tenantId: string): Promise<Rule[]> {
    return this.findMany({ trigger, status: 'active' } as Filter<Rule>, tenantId, {
      sortBy: 'priority',
      sortOrder: 'asc',
    });
  }

  async getRule(ruleId: string, tenantId: string): Promise<Rule | null> {
    return this.findById(ruleId, tenantId);
  }

  /**
   * Creates a rule. The DTO comes from the validated request body which
   * does not include tenantId (it's derived from the auth context), so
   * we add it here before passing to the base repository.
   */
  async createRule(
    rule: Omit<Rule, '_id' | 'tenantId' | 'createdAt' | 'updatedAt' | 'isDeleted' | 'deletedAt'>,
    tenantId: string,
    userId: string
  ): Promise<Rule> {
    return this.create({ ...rule, tenantId }, tenantId, userId);
  }

  /**
   * Updates a rule and bumps its version number. Versioning exists so
   * execution/audit logs can record which definition of a rule produced
   * a given outcome, even after the rule's conditions or actions change
   * later — without this, "why did this rule fire yesterday but not
   * today" would be unanswerable from history alone.
   */
  async updateRule(
    ruleId: string,
    updates: Partial<Rule>,
    tenantId: string,
    userId: string
  ): Promise<Rule | null> {
    const existing = await this.findById(ruleId, tenantId);
    if (!existing) return null;

    const nextVersion = (existing.version || 1) + 1;
    return this.update(ruleId, { ...updates, version: nextVersion }, tenantId, userId);
  }

  async deleteRule(ruleId: string, tenantId: string, userId: string): Promise<boolean> {
    return this.softDelete(ruleId, tenantId, userId);
  }

  /**
   * Clones an existing rule as a new draft. Useful for "start from a
   * similar rule" authoring flows and for safely testing a variant of a
   * live rule without touching production behavior (the clone starts in
   * `draft` status and version 1).
   */
  async duplicateRule(ruleId: string, tenantId: string, userId: string): Promise<Rule | null> {
    const existing = await this.findById(ruleId, tenantId);
    if (!existing) return null;

    const {
      _id,
      tenantId: _tenantId,
      createdAt,
      updatedAt,
      createdBy,
      updatedBy,
      isDeleted,
      deletedAt,
      ...rest
    } = existing;

    // Use createRule which accepts DTO without tenantId and adds it internally
    return this.createRule(
      {
        ...rest,
        name: `${existing.name} (Copy)`,
        status: 'draft' as RuleStatus,
        version: 1,
      },
      tenantId,
      userId
    );
  }
}

export const ruleRepository = new RuleRepository();
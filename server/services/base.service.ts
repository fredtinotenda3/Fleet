// server/services/base.service.ts

import { ZodSchema } from 'zod';
import { BaseRepository } from '@/server/repositories/base.repository';
import {
  BaseEntity,
  PaginationParams,
  PaginatedResponse,
} from '@/shared/types/common.types';
import { validateWithZod } from '@/shared/utils/validation.utils';
import {
  AppError,
  ValidationError,
  NotFoundError,
} from '@/server/errors/app.errors';

export abstract class BaseService<
  T extends BaseEntity,
  CreateDTO,
  UpdateDTO
> {
  constructor(protected repository: BaseRepository<T>) {}

  protected abstract getCreateSchema(): ZodSchema<CreateDTO>;
  protected abstract getUpdateSchema(): ZodSchema<UpdateDTO>;
  protected abstract getEntityName(): string;

  protected async validateCreate(data: unknown): Promise<CreateDTO> {
    const result = await validateWithZod(this.getCreateSchema(), data);
    if (!result.success) {
      const fieldErrors = result.errors || {};
      const messages = Object.entries(fieldErrors)
        .map(([field, errs]) => `${field}: ${errs.join(', ')}`)
        .join('; ');
      throw new ValidationError(messages || 'Validation failed', fieldErrors);
    }
    return result.data!;
  }

  protected async validateUpdate(data: unknown): Promise<UpdateDTO> {
    const result = await validateWithZod(this.getUpdateSchema(), data);
    if (!result.success) {
      const fieldErrors = result.errors || {};
      const messages = Object.entries(fieldErrors)
        .map(([field, errs]) => `${field}: ${errs.join(', ')}`)
        .join('; ');
      throw new ValidationError(messages || 'Validation failed', fieldErrors);
    }
    return result.data!;
  }

  async findById(id: string, tenantId: string): Promise<T | null> {
    const entity = await this.repository.findById(id, tenantId);
    if (!entity) {
      throw new NotFoundError(`${this.getEntityName()} not found`);
    }
    return entity;
  }

  async findOne(
    filter: Record<string, unknown>,
    tenantId: string
  ): Promise<T | null> {
    return this.repository.findOne(filter as any, tenantId);
  }

  async findMany(
    filter: Record<string, unknown>,
    tenantId: string
  ): Promise<T[]> {
    return this.repository.findMany(filter as any, tenantId);
  }

  async findWithPagination(
    filter: Record<string, unknown>,
    pagination: PaginationParams,
    tenantId: string
  ): Promise<PaginatedResponse<T>> {
    return this.repository.findWithPagination(
      filter as any,
      pagination,
      tenantId
    );
  }

  async create(
    data: unknown,
    tenantId: string,
    userId?: string
  ): Promise<T> {
    const validatedData = await this.validateCreate(data);
    return this.repository.create(validatedData as any, tenantId, userId);
  }

  async update(
    id: string,
    data: unknown,
    tenantId: string,
    userId?: string
  ): Promise<T | null> {
    const validatedData = await this.validateUpdate(data);
    const entity = await this.repository.update(
      id,
      validatedData as any,
      tenantId,
      userId
    );
    if (!entity) {
      throw new NotFoundError(`${this.getEntityName()} not found`);
    }
    return entity;
  }

  async delete(
    id: string,
    tenantId: string,
    userId?: string,
    soft: boolean = true
  ): Promise<boolean> {
    const entity = await this.repository.findById(id, tenantId);
    if (!entity) {
      throw new NotFoundError(`${this.getEntityName()} not found`);
    }
    if (soft) {
      return this.repository.softDelete(id, tenantId, userId);
    }
    return this.repository.hardDelete(id, tenantId);
  }

  async count(
    filter: Record<string, unknown>,
    tenantId: string
  ): Promise<number> {
    return this.repository.count(filter as any, tenantId);
  }

  async exists(
    filter: Record<string, unknown>,
    tenantId: string
  ): Promise<boolean> {
    return this.repository.exists(filter as any, tenantId);
  }
}
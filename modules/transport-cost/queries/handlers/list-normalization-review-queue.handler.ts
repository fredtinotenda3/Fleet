// modules/transport-cost/queries/handlers/list-normalization-review-queue.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { ListNormalizationReviewQueueQuery } from '../list-normalization-review-queue.query';
import { NormalizationReviewRepository } from '@/modules/transport-cost/repositories/normalization-review.repository';
import { NormalizationReviewItem } from '@/shared/types/normalization-review.types';
import { PaginatedResponse } from '@/shared/types/common.types';

export class ListNormalizationReviewQueueHandler
  implements IQueryHandler<ListNormalizationReviewQueueQuery, PaginatedResponse<NormalizationReviewItem>>
{
  constructor(private readonly repo: NormalizationReviewRepository) {}

  async execute(query: ListNormalizationReviewQueueQuery): Promise<PaginatedResponse<NormalizationReviewItem>> {
    return this.repo.findPending(query.kind, query.tenantId, query.pagination);
  }
}

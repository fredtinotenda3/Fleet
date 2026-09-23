// modules/transport-cost/commands/handlers/reject-review-item.handler.ts

import { ICommandHandler } from '@/server/cqrs/command';
import { RejectReviewItemCommand } from '../reject-review-item.command';
import { NormalizationReviewRepository } from '@/modules/transport-cost/repositories/normalization-review.repository';
import { NotFoundError, ConflictError, ValidationError } from '@/server/errors/app.errors';
import { NormalizationReviewItem } from '@/shared/types/normalization-review.types';

export class RejectReviewItemHandler
  implements ICommandHandler<RejectReviewItemCommand, NormalizationReviewItem>
{
  constructor(private readonly reviewRepo: NormalizationReviewRepository) {}

  async execute(command: RejectReviewItemCommand): Promise<NormalizationReviewItem> {
    if (!command.reason.trim()) {
      throw new ValidationError('A reason is required to reject a review item');
    }

    const item = await this.reviewRepo.findById(command.reviewItemId, command.tenantId);
    if (!item) {
      throw new NotFoundError('Review item not found');
    }
    if (item.status !== 'pending') {
      throw new ConflictError(`Review item is already ${item.status}, not pending`);
    }

    const updated = await this.reviewRepo.update(
      command.reviewItemId,
      {
        status: 'rejected',
        rejectedReason: command.reason.trim(),
        resolvedBy: command.userId,
        resolvedAt: new Date(),
      },
      command.tenantId,
      command.userId
    );

    return updated!;
  }
}

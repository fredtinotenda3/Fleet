// modules/ai/types/ai-result.types.ts

export interface AIResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  predictionId?: string;
  confidence?: number;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface AIBatchResult<T = unknown> {
  success: boolean;
  results: Array<{
    entityId: string;
    success: boolean;
    data?: T;
    error?: string;
  }>;
  total: number;
  succeeded: number;
  failed: number;
  timestamp: Date;
}
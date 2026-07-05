import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';

export interface ObservabilityContext {
  correlationId: string;
  traceId?: string;
  spanId?: string;
  tenantId?: string;
  userId?: string;
  route?: string;
  method?: string;
  startTime: number;
}

const storage = new AsyncLocalStorage<ObservabilityContext>();

export function generateCorrelationId(): string {
  return randomUUID();
}

export function runWithContext<T>(context: ObservabilityContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function getContext(): ObservabilityContext | undefined {
  return storage.getStore();
}

export function getCorrelationId(): string | undefined {
  return storage.getStore()?.correlationId;
}

export function setContextField<K extends keyof ObservabilityContext>(
  key: K,
  value: ObservabilityContext[K]
): void {
  const ctx = storage.getStore();
  if (ctx) ctx[key] = value;
}
import { getCorrelationId } from './context';

interface SpanHandle {
  setAttribute: (key: string, value: unknown) => void;
  recordException: (error: Error) => void;
}

/**
 * Wraps a unit of work in an OTEL span, degrading silently to a plain
 * function call when the SDK isn't installed/initialized (e.g. tests,
 * environments without OTEL_EXPORTER_OTLP_ENDPOINT configured).
 */
export async function withSpan<T>(
  name: string,
  fn: (span: SpanHandle) => Promise<T>,
  attributes: Record<string, string | number | boolean> = {}
): Promise<T> {
  try {
    const otelApi = await import('@opentelemetry/api');
    const tracer = otelApi.trace.getTracer('fleet-platform');

    return await tracer.startActiveSpan(name, async (span) => {
      const correlationId = getCorrelationId();
      if (correlationId) span.setAttribute('correlation.id', correlationId);
      for (const [key, value] of Object.entries(attributes)) {
        span.setAttribute(key, value as never);
      }
      try {
        const result = await fn({
          setAttribute: (k, v) => span.setAttribute(k, v as never),
          recordException: (e) => span.recordException(e),
        });
        span.setStatus({ code: otelApi.SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({ code: otelApi.SpanStatusCode.ERROR, message: (error as Error).message });
        throw error;
      } finally {
        span.end();
      }
    });
  } catch {
    return fn({ setAttribute: () => undefined, recordException: () => undefined });
  }
}
/**
 * Lazily-loaded OpenTelemetry NodeSDK bootstrap. Exporting is only active
 * when OTEL_EXPORTER_OTLP_ENDPOINT is set; without it, spans are still
 * created in-process (so withSpan() never throws) but nothing leaves the
 * process. Must only ever be called from a Node.js runtime context (see
 * instrumentation.ts) — never from the Edge middleware runtime.
 */
let started = false;
let sdk: any = null;

export async function initObservability(): Promise<void> {
  if (started) return;
  started = true;

  try {
    const { NodeSDK } = await import('@opentelemetry/sdk-node');
    const { getNodeAutoInstrumentations } = await import('@opentelemetry/auto-instrumentations-node');
    const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http');
    const { Resource } = await import('@opentelemetry/resources');
    const { SemanticResourceAttributes } = await import('@opentelemetry/semantic-conventions');

    const serviceName = process.env.OTEL_SERVICE_NAME || 'fleet-platform';

    sdk = new NodeSDK({
      resource: new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
        [SemanticResourceAttributes.SERVICE_VERSION]: process.env.npm_package_version || '0.0.1',
        [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'development',
      }),
      traceExporter: process.env.OTEL_EXPORTER_OTLP_ENDPOINT
        ? new OTLPTraceExporter({ url: `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces` })
        : undefined,
      instrumentations: [
        getNodeAutoInstrumentations({
          '@opentelemetry/instrumentation-fs': { enabled: false },
        }),
      ],
    });

    sdk.start();
    console.log(`[Observability] OpenTelemetry SDK started (service=${serviceName})`);

    process.on('SIGTERM', () => {
      sdk?.shutdown().catch(() => undefined);
    });
  } catch (error) {
    console.warn('[Observability] OpenTelemetry SDK unavailable — tracing disabled.', error);
  }
}
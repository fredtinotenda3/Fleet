/**
 * Lazily-loaded OpenTelemetry NodeSDK bootstrap. Exporting is only active
 * when OTEL_EXPORTER_OTLP_ENDPOINT is set; without it, spans are still
 * created in-process (so withSpan() never throws) but nothing leaves the
 * process. Must only ever be called from a Node.js runtime context (see
 * instrumentation.ts) — never from the Edge middleware runtime.
 *
 * FIX: getNodeAutoInstrumentations() patches every mongodb/http/https/dns/
 * net/fs call process-wide to emit spans. In dev, with no
 * OTEL_EXPORTER_OTLP_ENDPOINT configured, those spans go nowhere — you pay
 * the wrapping/instrumentation overhead on every single DB call and HTTP
 * request for zero observability benefit. This is a real contributor to
 * the 20-60s response times on routes like /api/security/mfa/status and
 * /api/security/sessions, on top of the missing indexes. Skip the SDK
 * entirely in dev unless an exporter endpoint is actually configured, or
 * OTEL_FORCE_DEV=true is explicitly set.
 */
let started = false;
let sdk: any = null;

export async function initObservability(): Promise<void> {
  if (started) return;
  started = true;

  const isDev = process.env.NODE_ENV !== 'production';
  const hasExporter = !!process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

  if (isDev && !hasExporter && process.env.OTEL_FORCE_DEV !== 'true') {
    console.log(
      '[Observability] Skipping OpenTelemetry auto-instrumentation in development ' +
        '(no OTEL_EXPORTER_OTLP_ENDPOINT set). Set OTEL_FORCE_DEV=true to force-enable it locally.'
    );
    return;
  }

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
      traceExporter: hasExporter
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
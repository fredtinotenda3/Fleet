export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // 👇 Add this line
    const { bootstrapCqrs } = await import('@/server/cqrs/cqrs.module');
    bootstrapCqrs();

    const { initObservability } = await import('@/infrastructure/observability/otel');
    await initObservability();
  }
}
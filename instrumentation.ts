export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initObservability } = await import('@/infrastructure/observability/otel');
    await initObservability();
  }
}
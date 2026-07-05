import { MongoClient } from 'mongodb';
import { metricsRegistry } from './metrics.registry';
import { structuredLogger } from './structured-logger';
import { triggerAlert } from './alert-rules';

const SLOW_QUERY_MS = Number(process.env.DB_SLOW_QUERY_MS || 100);
const CRITICAL_QUERY_MS = Number(process.env.DB_CRITICAL_QUERY_MS || 1000);

const inFlightCommands = new Map<number, { start: number; commandName: string; collection: string }>();

function extractCollection(command: Record<string, unknown>, commandName: string): string {
  const value = command[commandName];
  return typeof value === 'string' ? value : 'unknown';
}

let attached = false;

/**
 * Attaches MongoDB command-monitoring listeners (requires `monitorCommands:
 * true` on the client) to record per-command latency and flag slow queries.
 * Queries at or above DB_SLOW_QUERY_MS increment a counter and log a
 * warning; queries at or above DB_CRITICAL_QUERY_MS also fire an alert.
 */
export function attachDbMonitoring(client: MongoClient): void {
  if (attached) return;
  attached = true;

  client.on('commandStarted', (event) => {
    inFlightCommands.set(event.requestId, {
      start: Date.now(),
      commandName: event.commandName,
      collection: extractCollection(event.command as Record<string, unknown>, event.commandName),
    });
  });

  client.on('commandSucceeded', (event) => {
    const started = inFlightCommands.get(event.requestId);
    inFlightCommands.delete(event.requestId);
    if (!started) return;

    const durationMs = Date.now() - started.start;
    metricsRegistry.dbQueryDuration.observe(
      { collection: started.collection, operation: started.commandName },
      durationMs / 1000
    );

    if (durationMs >= SLOW_QUERY_MS) {
      metricsRegistry.dbSlowQueriesTotal.inc({ collection: started.collection, operation: started.commandName });
      structuredLogger.warn('Slow MongoDB query detected', {
        collection: started.collection,
        operation: started.commandName,
        durationMs,
      });

      if (durationMs >= CRITICAL_QUERY_MS) {
        void triggerAlert({
          metric: 'db_slow_query',
          value: durationMs,
          threshold: CRITICAL_QUERY_MS,
          severity: 'critical',
          message: `Critical slow query: ${started.commandName} on ${started.collection} took ${durationMs}ms`,
          labels: { collection: started.collection, operation: started.commandName },
        });
      }
    }
  });

  client.on('commandFailed', (event) => {
    const started = inFlightCommands.get(event.requestId);
    inFlightCommands.delete(event.requestId);
    const collection = started?.collection || 'unknown';
    metricsRegistry.dbErrorsTotal.inc({ collection, operation: event.commandName });
    structuredLogger.error('MongoDB command failed', event.failure as Error, {
      collection,
      operation: event.commandName,
    });
  });

  structuredLogger.info('[Observability] MongoDB command monitoring attached');
}
// server/middleware/with-auth.ts
// Updated to include version resolution and headers

import { NextRequest, NextResponse } from 'next/server';
import { Permission } from '@/server/permissions/roles';
import {
  AuthContext,
  getAuthContext,
  hasPermission,
  hasAnyPermission,
  hasRole,
  canPerform,
} from '@/server/auth/auth-context';
import { rateLimiter, RateLimitConfig } from '@/infrastructure/security/rate-limit';
import { errorResponse } from '@/server/utils/response.utils';
import { ResourceContext } from '@/modules/security/types/resource-permission.types';
import { threatDetectionService } from '@/modules/security/services/threat-detection.service';
import { generateCorrelationId, runWithContext, setContextField } from '@/infrastructure/observability/context';
import { withSpan } from '@/infrastructure/observability/tracer';
import { metricsRegistry } from '@/infrastructure/observability/metrics.registry';
import { monitoring } from '@/infrastructure/monitoring/logger';
import { triggerAlert, ALERT_THRESHOLDS } from '@/infrastructure/observability/alert-rules';

// Import versioning utilities
import { resolveVersion, VersionResolutionError } from '@/server/api-versioning/version-resolver';
import { buildVersionHeaders } from '@/server/api-versioning/version-headers';

type Handler<P = unknown> = (
  req: NextRequest,
  context: AuthContext,
  routeParams: P
) => Promise<NextResponse>;

type ResourceResolver<P> = (
  req: NextRequest,
  routeParams: P
) => Promise<ResourceContext> | ResourceContext;

type AttributesResolver<P> = (
  req: NextRequest,
  routeParams: P
) => Promise<Record<string, unknown>> | Record<string, unknown>;

interface WithAuthOptions<P = unknown> {
  permission?: Permission;
  anyPermission?: Permission[];
  roles?: string[];
  rateLimit?: boolean | Partial<RateLimitConfig>;
  resource?: ResourceResolver<P>;
  attributes?: AttributesResolver<P>;
}

function getIpAddress(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

/** Collapses ObjectId-shaped path segments so route labels stay low-cardinality in Prometheus. */
function routeLabel(req: NextRequest): string {
  return req.nextUrl.pathname.replace(/\/[0-9a-fA-F]{20,}(?=\/|$)/g, '/:id');
}

/**
 * Single consolidated route-protection entry point. As of Phase 9, also
 * the single choke point for request-level observability: every route
 * wrapped in withAuth gets a correlation ID, root tracing span, and
 * HTTP latency/count metrics.
 *
 * As of Slice 10c, also resolves and validates the API version, stamps
 * version headers on every response, and rejects retired versions.
 */
export function withAuth<P = unknown>(handler: Handler<P>, options: WithAuthOptions<P> = {}) {
  return async (req: NextRequest, routeParams: P): Promise<NextResponse> => {
    const correlationId = req.headers.get('x-correlation-id') || generateCorrelationId();
    const route = routeLabel(req);
    const method = req.method;
    const startedAt = Date.now();

    async function handleRequest(): Promise<NextResponse> {
      // ─── Rate Limiting ──────────────────────────────────────────────────────
      if (options.rateLimit !== false) {
        const rateLimitConfig = typeof options.rateLimit === 'object' ? options.rateLimit : undefined;
        const { allowed, reset } = rateLimiter.checkLimit(req, rateLimitConfig);

        if (!allowed) {
          threatDetectionService
            .recordRateLimitBlock(getIpAddress(req), req.nextUrl.pathname, 'system')
            .catch(() => undefined);
          return errorResponse('Too many requests', 'RATE_LIMITED', 429, { reset });
        }
      }

      // ─── API Version Resolution ────────────────────────────────────────────
      let versionResult;
      try {
        versionResult = resolveVersion(req);
      } catch (error) {
        if (error instanceof VersionResolutionError) {
          return errorResponse(error.message, error.code, error.statusCode);
        }
        return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
      }

      // ─── Authentication ─────────────────────────────────────────────────────
      const context = await getAuthContext(req);
      if (!context) {
        return errorResponse('Authentication required', 'UNAUTHORIZED', 401);
      }

      setContextField('tenantId', context.tenantId);
      setContextField('userId', context.userId);

      // ─── Permission Checks ──────────────────────────────────────────────────
      if (options.permission && !hasPermission(context, options.permission)) {
        return errorResponse('Insufficient permissions', 'FORBIDDEN', 403);
      }

      if (options.anyPermission && !hasAnyPermission(context, options.anyPermission)) {
        return errorResponse('Insufficient permissions', 'FORBIDDEN', 403);
      }

      if (options.roles && !hasRole(context, options.roles)) {
        return errorResponse('Insufficient role', 'FORBIDDEN', 403);
      }

      // ─── Resource-level Permission Checks ──────────────────────────────────
      if (options.resource) {
        const permissionKey = options.permission || options.anyPermission?.[0];
        if (!permissionKey) {
          console.error(
            '[withAuth] options.resource was provided without options.permission or options.anyPermission; skipping resource-scoped check.'
          );
        } else {
          const resource = await options.resource(req, routeParams);
          const userAttributes = options.attributes ? await options.attributes(req, routeParams) : undefined;

          const decision = await canPerform(context, permissionKey, resource, userAttributes);
          if (!decision.allowed) {
            return errorResponse(`Access denied: ${decision.reason}`, 'FORBIDDEN', 403, {
              source: decision.source,
            });
          }
        }
      }

      // ─── Execute Handler ────────────────────────────────────────────────────
      const response = await handler(req, context, routeParams);

      // ─── Stamp Version Headers ─────────────────────────────────────────────
      const versionHeaders = buildVersionHeaders(versionResult.versionString);
      for (const [key, value] of Object.entries(versionHeaders)) {
        response.headers.set(key, value);
      }

      // Add sunset/deprecation warnings
      if (versionResult.isSunset && versionResult.sunsetDate) {
        response.headers.set(
          'Warning',
          `299 - "This API version will be sunset on ${versionResult.sunsetDate.toISOString()}"`
        );
      }
      if (versionResult.isDeprecated) {
        response.headers.set('Warning', '299 - "This API version is deprecated"');
      }

      return response;
    }

    return runWithContext({ correlationId, route, method, startTime: startedAt }, () =>
      withSpan(
        `${method} ${route}`,
        async (span) => {
          span.setAttribute('http.method', method);
          span.setAttribute('http.route', route);

          const response = await handleRequest();

          span.setAttribute('http.status_code', response.status);
          response.headers.set('X-Correlation-Id', correlationId);

          const durationMs = Date.now() - startedAt;
          metricsRegistry.httpRequestDuration.observe(
            { method, route, status: String(response.status) },
            durationMs / 1000
          );
          metricsRegistry.httpRequestsTotal.inc({
            method,
            route,
            status: String(response.status),
          });
          await monitoring.trackApiLatency(route, durationMs, response.status);

          if (response.status >= 500) {
            void triggerAlert({
              metric: 'http_5xx',
              value: 1,
              threshold: 1,
              severity: 'warning',
              message: `5xx response from ${method} ${route}`,
              labels: { route, method, status: String(response.status) },
            });
          }
          if (durationMs >= ALERT_THRESHOLDS.p95LatencyMs) {
            void triggerAlert({
              metric: 'http_latency',
              value: durationMs,
              threshold: ALERT_THRESHOLDS.p95LatencyMs,
              severity: 'warning',
              message: `Slow request: ${method} ${route} took ${durationMs}ms`,
              labels: { route, method },
            });
          }

          return response;
        },
        { 'correlation.id': correlationId }
      )
    );
  };
}

/** Convenience wrapper for routes that need auth but no specific permission/role check. */
export function withSession<P = unknown>(handler: Handler<P>) {
  return withAuth(handler);
}
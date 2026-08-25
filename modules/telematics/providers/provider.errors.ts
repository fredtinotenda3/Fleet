// modules/telematics/providers/provider.errors.ts
//
// PHASE 2 -- one error vocabulary for every provider.
//
// ---------------------------------------------------------------------
// WHY
// ---------------------------------------------------------------------
// The two existing adapters classify failure very differently. Eagle
// Track has a genuinely careful taxonomy built from a real incident --
// its client reads the body as text because the vendor labels successful
// JSON as `text/html`, and it carries a `nonJsonBody` flag plus 3xx
// classification because an invalid token arrives as an HTTP 200 login
// page and would otherwise surface as a platform OUTAGE rather than bad
// credentials. Cartrack has `catch (e) { result.errors.push(message) }`.
//
// So the same underlying condition -- "these credentials are wrong" --
// reached the fleet layer as a structured vendor rejection from one
// provider and as an untyped string from the other. No caller could act
// on either without knowing which provider it was talking to, which is
// the coupling Phase 2 exists to remove.
//
// ---------------------------------------------------------------------
// THE CONTRACT
// ---------------------------------------------------------------------
// Adapters translate at their own boundary and throw ProviderError.
// Fleet-domain callers switch on `category`, never on provider identity
// and never on a vendor status code.
//
// RAW VENDOR DETAIL DOES NOT CROSS THE BOUNDARY. `providerDetail` is
// for logs and admin surfaces only; it is deliberately a plain string
// rather than the vendor's response object, so a caller cannot start
// depending on a vendor's JSON shape by reaching through the error --
// which is how provider coupling grows back after it has been removed.
//
// Nothing here carries a token, a header, or a URL query string. The
// Eagle Track client's redactToken()/endpoint-only-logging discipline
// (Phase 0) is preserved: adapters must redact BEFORE constructing a
// ProviderError.

import { AppError } from '@/server/errors/app.errors';

/**
 * Provider-neutral failure categories.
 *
 * Chosen so that each one implies a DIFFERENT action by the caller.
 * Categories that would be handled identically are not split -- a
 * taxonomy nobody branches on is documentation pretending to be code.
 */
export type ProviderErrorCategory =
  /** Credentials rejected. Admin must re-enter them. Do not retry. */
  | 'authentication_failed'
  /** Authenticated, but not permitted this resource. Do not retry. */
  | 'authorization_failed'
  /** Provider unreachable or returning 5xx. Retry later. */
  | 'provider_unavailable'
  /** Provider asked us to slow down. Back off, then retry. */
  | 'rate_limited'
  /** Reached the provider; could not understand the reply. Do not retry blindly. */
  | 'malformed_response'
  /** The provider does not offer this capability at all. Never retry. */
  | 'unsupported_capability'
  /** The provider has no such device. Mapping is stale. */
  | 'device_not_found'
  /** A provider device that maps to no vehicle in this tenant. */
  | 'vehicle_not_mapped'
  /** Timeout, DNS, socket reset. Retry. */
  | 'transient_error';

/** Categories where an immediate retry is pointless or harmful. */
const NON_RETRYABLE: readonly ProviderErrorCategory[] = [
  'authentication_failed',
  'authorization_failed',
  'unsupported_capability',
  'device_not_found',
  'vehicle_not_mapped',
  'malformed_response',
];

export interface ProviderErrorContext {
  providerId: string;
  /** The provider's own device identifier, never our storage key. */
  externalDeviceId?: string;
  vehicleId?: string;
  /** e.g. 'getLivePositions'. Names the contract method, not the vendor endpoint. */
  operation?: string;
  /**
   * Short, ALREADY-REDACTED vendor detail for logs and admin surfaces.
   * Must never contain a token, an Authorization header, or a full URL.
   */
  providerDetail?: string;
}

/**
 * A failure from a telematics provider, expressed in platform terms.
 *
 * Extends AppError so it flows through the existing error handling
 * (handleTelematicsError, the controllers' isAppError checks) unchanged.
 * `statusCode` maps the category onto something an HTTP caller can act
 * on -- notably 502 for provider_unavailable rather than 500, so an
 * operator reading logs can tell "the vendor is down" from "we have a
 * bug", which the previous string-based handling could not express.
 */
export class ProviderError extends AppError {
  readonly category: ProviderErrorCategory;
  readonly providerId: string;
  readonly externalDeviceId?: string;
  readonly vehicleId?: string;
  readonly operation?: string;
  readonly providerDetail?: string;

  constructor(
    category: ProviderErrorCategory,
    message: string,
    context: ProviderErrorContext
  ) {
    super(message, `PROVIDER_${category.toUpperCase()}`, statusForCategory(category));
    this.category = category;
    this.providerId = context.providerId;
    this.externalDeviceId = context.externalDeviceId;
    this.vehicleId = context.vehicleId;
    this.operation = context.operation;
    this.providerDetail = context.providerDetail;
  }

  /** Whether a caller may reasonably retry this operation. */
  get retryable(): boolean {
    return !NON_RETRYABLE.includes(this.category);
  }

  /**
   * Log-safe structured fields.
   *
   * Explicitly enumerated rather than spreading `this`, so a field added
   * to the class later cannot silently start appearing in logs.
   */
  toLogContext(): Record<string, unknown> {
    return {
      providerId: this.providerId,
      category: this.category,
      operation: this.operation,
      externalDeviceId: this.externalDeviceId,
      vehicleId: this.vehicleId,
      providerDetail: this.providerDetail,
      retryable: this.retryable,
    };
  }
}

function statusForCategory(category: ProviderErrorCategory): number {
  switch (category) {
    case 'authentication_failed':
      return 401;
    case 'authorization_failed':
      return 403;
    case 'device_not_found':
    case 'vehicle_not_mapped':
      return 404;
    case 'unsupported_capability':
      // 501 Not Implemented: the request is well-formed, this provider
      // simply cannot serve it. Distinct from 400 (caller's fault) and
      // from 404 (exists but not found here).
      return 501;
    case 'rate_limited':
      return 429;
    case 'provider_unavailable':
    case 'transient_error':
      return 502;
    case 'malformed_response':
      // 502 as well: the failure is upstream, not in the caller's
      // request. A 500 would read as our own bug.
      return 502;
  }
}

/** Convenience constructor for the most common adapter-boundary case. */
export function unsupportedCapability(
  providerId: string,
  capability: string
): ProviderError {
  return new ProviderError(
    'unsupported_capability',
    `Provider '${providerId}' does not support '${capability}'.`,
    { providerId, operation: capability }
  );
}

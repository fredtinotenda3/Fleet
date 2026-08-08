// server/errors/app.errors.ts

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    details?: unknown
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 'VALIDATION_ERROR', 400, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 'NOT_FOUND', 404);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 'UNAUTHORIZED', 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 'FORBIDDEN', 403);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 'CONFLICT', 409, details);
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 'DATABASE_ERROR', 500, details);
  }
}

/**
 * Structural type guard for AppError and its subclasses.
 *
 * ---------------------------------------------------------------------
 * Why `instanceof` is not enough (the vehicle-create 500)
 * ---------------------------------------------------------------------
 * 51 controllers classify errors with `error instanceof AppError`. A
 * match returns the real status and message; a miss falls through to
 * `console.error('... Unexpected error:', error)` and a bare
 * `500 INTERNAL_ERROR`.
 *
 * `instanceof` compares against the AppError constructor reachable from
 * the FILE DOING THE CHECK. Under Next's bundler a module can be
 * instantiated more than once -- once in the main server bundle, again
 * in a separately-bundled route or through a dynamic `await import()`
 * (NotificationHandler and several tenancy paths use dynamic imports).
 * Each instantiation creates its own AppError class object. An error
 * thrown from copy A then fails `instanceof` against copy B, even
 * though it is the same class by name and shape.
 *
 * The observable symptom is exactly what POST /api/vehicles produced: a
 * legitimate domain error -- almost certainly a NotFoundError whose
 * message begins "Organization ..." -- reported as
 *
 *     [VehicleController] Unexpected error: i: Organiza…
 *
 * `i:` is the MINIFIED CONSTRUCTOR NAME. A plain object or a string
 * would not print a constructor name at all; that prefix is proof the
 * thrown value was a real Error subclass that the `instanceof` check
 * simply failed to recognise. So the client saw an opaque 500 (and the
 * timeout that followed) instead of the 404 with a message naming the
 * actual problem.
 *
 * This is why the previous fix "didn't cover it": that fix corrected the
 * organization LOOKUP. This is a separate defect in error CLASSIFICATION
 * that was masking whatever the lookup still reports -- and masking it
 * identically for every one of the 51 controllers.
 *
 * The guard is structural, so it holds across duplicate module
 * instances, and it is deliberately narrow: `code` and `statusCode` must
 * both be present and of the right primitive type, so an arbitrary
 * object with a `message` cannot impersonate a domain error and choose
 * its own HTTP status.
 */
export function isAppError(error: unknown): error is AppError {
  if (error instanceof AppError) return true;
  if (!error || typeof error !== 'object') return false;
  const e = error as Partial<AppError> & { message?: unknown };
  return (
    typeof e.message === 'string' &&
    typeof e.code === 'string' &&
    typeof e.statusCode === 'number'
  );
}

/**
 * Full, untruncated detail for a server log line.
 *
 * `console.error('...', error)` on a serverless platform frequently
 * renders as `ClassName: first-few-chars…`, which is how three rounds of
 * debugging went on a message nobody could read. This returns a flat
 * object every log pipeline prints in full.
 */
export function describeError(error: unknown): Record<string, unknown> {
  if (!error || typeof error !== 'object') {
    return { value: String(error) };
  }
  const e = error as Record<string, unknown>;
  return {
    name: typeof e.name === 'string' ? e.name : e.constructor?.name,
    message: typeof e.message === 'string' ? e.message : String(e.message),
    code: e.code,
    statusCode: e.statusCode,
    details: e.details,
    stack: typeof e.stack === 'string' ? e.stack.split('\n').slice(0, 8).join(' | ') : undefined,
  };
}

// tests/security/error-classification.spec.ts
//
// Guards the error-classification path that turned a legible 404 into an
// opaque 500 on POST /api/vehicles.
//
// 51 controllers branched on `error instanceof AppError`. `instanceof`
// resolves the constructor reachable from the checking file, and Next's
// bundler can instantiate a module more than once (separate route
// bundles, dynamic `await import()`), so the same class by name is a
// different class object. A domain error thrown on one side then fails
// the check on the other and is reported as an unexpected 500.

import {
  AppError,
  NotFoundError,
  ValidationError,
  isAppError,
  describeError,
} from '../../server/errors/app.errors';

/**
 * A second, independent AppError class — stands in for the duplicate
 * module instance the bundler creates. Structurally identical, different
 * identity.
 */
class DuplicateBundleAppError extends Error {
  code: string;
  statusCode: number;
  details?: unknown;
  constructor(message: string, code: string, statusCode: number) {
    super(message);
    this.name = 'NotFoundError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

describe('isAppError', () => {
  it('accepts real AppError subclasses', () => {
    expect(isAppError(new NotFoundError('Organization not found'))).toBe(true);
    expect(isAppError(new ValidationError('bad'))).toBe(true);
    expect(isAppError(new AppError('x', 'CODE', 400))).toBe(true);
  });

  it('accepts an error from a DUPLICATE module instance — the actual bug', () => {
    const fromOtherBundle = new DuplicateBundleAppError(
      'Organization not found: "willsgrove-farm-enterprises-9e80ed"',
      'NOT_FOUND',
      404
    );
    // This is what produced the 500: instanceof says no...
    expect(fromOtherBundle instanceof AppError).toBe(false);
    // ...while the structural guard correctly recognises it.
    expect(isAppError(fromOtherBundle)).toBe(true);
  });

  it('rejects a plain Error, so genuine bugs still surface as 500', () => {
    expect(isAppError(new Error('boom'))).toBe(false);
    expect(isAppError(new TypeError('undefined is not a function'))).toBe(false);
  });

  it('rejects arbitrary objects that would otherwise choose their own status', () => {
    // Narrow on purpose: a payload-shaped object must not be able to
    // impersonate a domain error and pick its own HTTP status.
    expect(isAppError({ message: 'hi' })).toBe(false);
    expect(isAppError({ message: 'hi', code: 'X' })).toBe(false);
    expect(isAppError({ message: 'hi', statusCode: 404 })).toBe(false);
    expect(isAppError({ code: 'X', statusCode: 404 })).toBe(false);
    expect(isAppError(null)).toBe(false);
    expect(isAppError('Organization not found')).toBe(false);
  });
});

describe('describeError', () => {
  it('exposes the full message, code and status rather than a truncated cast', () => {
    const d = describeError(new NotFoundError('Organization not found for tenant "x"'));
    expect(d.message).toBe('Organization not found for tenant "x"');
    expect(d.code).toBe('NOT_FOUND');
    expect(d.statusCode).toBe(404);
    expect(typeof d.stack).toBe('string');
  });

  it('handles non-objects without throwing', () => {
    expect(describeError('boom')).toEqual({ value: 'boom' });
    expect(describeError(undefined)).toEqual({ value: 'undefined' });
  });
});

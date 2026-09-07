// frontend/shared/ui/patterns/DataState.tsx

'use client';

import * as React from 'react';
import { LoadingState } from '@/shared/ui/feedback/LoadingState';
import { ErrorState } from './ErrorState';

interface DataStateProps {
  isLoading: boolean;
  /**
   * REQUIRED, not optional. This is the whole point of the component: every
   * page that renders remote data must answer "what does a failure look
   * like". Making this optional would let a call site omit it and silently
   * reproduce the exact defect this component exists to remove — a failed
   * fetch falling through to an empty state that says the fleet has no
   * vehicles.
   */
  isError: boolean;
  /**
   * True when the request succeeded and returned nothing. Evaluated ONLY
   * after loading and error, so a null response during a failure can never
   * be mistaken for "no records".
   */
  isEmpty?: boolean;
  /** Rendered when isEmpty. Use an EmptyState — see shared/ui/feedback/EmptyState. */
  empty?: React.ReactNode;
  /** Overrides the default skeleton. */
  loading?: React.ReactNode;
  loadingType?: 'table' | 'card' | 'stats' | 'full';
  loadingCount?: number;
  /** Overrides the default ErrorState. */
  error?: React.ReactNode;
  errorTitle?: string;
  errorDescription?: string;
  errorDetail?: string;
  onRetry?: () => void;
  /**
   * When true, an error is rendered above the children instead of replacing
   * them. For a page that has partial data worth keeping on screen — a
   * dashboard where one widget's source failed but the rest loaded.
   */
  keepChildrenOnError?: boolean;
  children: React.ReactNode;
}

/**
 * The state machine every remote-data surface goes through, in one place.
 *
 * Order is load → error → empty → content, and it is not configurable,
 * because the ordering IS the correctness property: an error checked after
 * empty produces the "your fleet is empty" lie described in ErrorState.
 *
 * Usage:
 *
 *   <DataState
 *     isLoading={q.isLoading}
 *     isError={q.isError}
 *     isEmpty={!q.data?.length}
 *     onRetry={q.refetch}
 *     empty={<EmptyState … />}
 *   >
 *     <VehiclesTable rows={q.data!} />
 *   </DataState>
 */
export function DataState({
  isLoading,
  isError,
  isEmpty = false,
  empty,
  loading,
  loadingType = 'table',
  loadingCount = 5,
  error,
  errorTitle,
  errorDescription,
  errorDetail,
  onRetry,
  keepChildrenOnError = false,
  children,
}: DataStateProps) {
  if (isLoading) {
    return <>{loading ?? <LoadingState type={loadingType} count={loadingCount} />}</>;
  }

  if (isError) {
    const errorNode = error ?? (
      <ErrorState
        title={errorTitle}
        description={errorDescription}
        detail={errorDetail}
        onRetry={onRetry}
        size={keepChildrenOnError ? 'inline' : 'panel'}
      />
    );

    if (keepChildrenOnError) {
      return (
        <div className="space-y-4">
          {errorNode}
          {children}
        </div>
      );
    }
    return <>{errorNode}</>;
  }

  if (isEmpty && empty) {
    return <>{empty}</>;
  }

  return <>{children}</>;
}

/**
 * Normalises the many shapes an error arrives in into one short line safe to
 * show a user.
 *
 * Deliberately does NOT surface a stack, a URL or a response body: those can
 * carry tenant identifiers and internal route structure, and this string is
 * rendered into the DOM of a multi-tenant product.
 */
export function describeQueryError(error: unknown, fallback = 'The request could not be completed.'): string {
  if (!error) return fallback;
  if (typeof error === 'string') return error.slice(0, 200);
  if (error instanceof Error && error.message) return error.message.slice(0, 200);
  if (typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message.slice(0, 200);
  }
  return fallback;
}

/**
 * True when the failure is an authorization refusal rather than a fault, so
 * the caller can render the 'permission' variant instead of offering a retry
 * button that will always fail.
 */
export function isPermissionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { status?: unknown; statusCode?: unknown; code?: unknown };
  const status = candidate.status ?? candidate.statusCode;
  if (status === 403) return true;
  return candidate.code === 'FORBIDDEN' || candidate.code === 'INSUFFICIENT_PERMISSIONS';
}

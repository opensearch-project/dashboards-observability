/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Typed error system for alert-manager route handlers.
 * Replaces fragile string-matching (msg.includes('not found')) with
 * discriminated union error types.
 */

export interface NotFoundError {
  readonly kind: 'not_found';
  readonly message: string;
  readonly resourceId?: string;
}

export interface ValidationError {
  readonly kind: 'validation';
  readonly message: string;
  readonly field?: string;
}

export interface InternalError {
  readonly kind: 'internal';
  readonly message: string;
}

/**
 * Raised when an optimistic-concurrency update (PUT/POST with seq_no +
 * primary_term) fails because another writer bumped the document. Routes
 * should surface this as HTTP 409 so the caller can retry after re-fetching.
 */
export interface ConflictError {
  readonly kind: 'conflict';
  readonly message: string;
  readonly resourceId?: string;
}

export type AlertManagerError = NotFoundError | ValidationError | InternalError | ConflictError;

export function createNotFoundError(message: string, resourceId?: string): NotFoundError {
  return { kind: 'not_found', message, resourceId };
}

export function createValidationError(message: string, field?: string): ValidationError {
  return { kind: 'validation', message, field };
}

export function createInternalError(message: string): InternalError {
  return { kind: 'internal', message };
}

export function createConflictError(message: string, resourceId?: string): ConflictError {
  return { kind: 'conflict', message, resourceId };
}

export function isAlertManagerError(value: unknown): value is AlertManagerError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    typeof (value as AlertManagerError).kind === 'string' &&
    ['not_found', 'validation', 'internal', 'conflict'].includes(
      (value as AlertManagerError).kind
    ) &&
    'message' in value &&
    typeof (value as AlertManagerError).message === 'string'
  );
}

/**
 * Type-guard a thrown value against a specific numeric statusCode. Replaces
 * brittle `String(err).includes('HTTP 404')` patterns with a structural check
 * that works against opensearch-js `ResponseError` (`statusCode` is a getter
 * that reads `meta.body.status ?? meta.statusCode`) and any other shape
 * carrying a `statusCode` field.
 */
export function isStatusCode(value: unknown, statusCode: number): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { statusCode?: unknown }).statusCode === statusCode
  );
}

/**
 * Extract a human-readable message from an arbitrary thrown value.
 *
 * `String(reason)` is unsafe for plain objects: an `AlertManagerError`
 * (`{ kind, message, ... }`) or an opensearch-js error shape that doesn't
 * inherit from `Error` stringifies to `"[object Object]"`, which surfaces
 * to users as a useless "[object Object]" message. This walks the common
 * shapes — Error subclasses, AlertManagerError, plain `{ message }`
 * objects, primitives — and falls back to `String()` only for shapes that
 * carry no recognizable message field.
 *
 * Used at fanout boundaries where settled rejection reasons need to be
 * stringified for client-visible status payloads (datasourceStatus[].error).
 * Internal logging should keep using the raw value to preserve stack
 * traces.
 */
export function extractErrorMessage(reason: unknown): string {
  if (reason == null) return 'Unknown error';
  if (typeof reason === 'string') return reason;
  if (reason instanceof Error) return reason.message || reason.name || String(reason);
  if (isAlertManagerError(reason)) return reason.message;
  if (typeof reason === 'object') {
    const maybe = reason as { message?: unknown; error?: unknown };
    if (typeof maybe.message === 'string' && maybe.message.length > 0) return maybe.message;
    if (typeof maybe.error === 'string' && maybe.error.length > 0) return maybe.error;
  }
  return String(reason);
}

/**
 * Map an AlertManagerError to an HTTP status code.
 */
export function errorToStatus(error: AlertManagerError): number {
  switch (error.kind) {
    case 'not_found':
      return 404;
    case 'validation':
      return 400;
    case 'internal':
      return 500;
    case 'conflict':
      return 409;
    default: {
      const _exhaustive: never = error;
      return 500;
    }
  }
}

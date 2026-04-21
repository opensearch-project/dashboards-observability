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

export type AlertManagerError = NotFoundError | ValidationError | InternalError;

export function createNotFoundError(message: string, resourceId?: string): NotFoundError {
  return { kind: 'not_found', message, resourceId };
}

export function createValidationError(message: string, field?: string): ValidationError {
  return { kind: 'validation', message, field };
}

export function createInternalError(message: string): InternalError {
  return { kind: 'internal', message };
}

export function isAlertManagerError(value: unknown): value is AlertManagerError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    typeof (value as AlertManagerError).kind === 'string' &&
    ['not_found', 'validation', 'internal'].includes((value as AlertManagerError).kind) &&
    'message' in value &&
    typeof (value as AlertManagerError).message === 'string'
  );
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
    default: {
      const _exhaustive: never = error;
      return 500;
    }
  }
}

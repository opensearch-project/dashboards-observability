/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  createNotFoundError,
  createValidationError,
  createInternalError,
  createConflictError,
  isAlertManagerError,
  isStatusCode,
  errorToStatus,
} from '../errors';

describe('errors', () => {
  it('createNotFoundError returns correct shape', () => {
    const err = createNotFoundError('missing', 'id-1');
    expect(err).toEqual({ kind: 'not_found', message: 'missing', resourceId: 'id-1' });
  });

  it('createValidationError returns correct shape', () => {
    const err = createValidationError('bad input', 'name');
    expect(err).toEqual({ kind: 'validation', message: 'bad input', field: 'name' });
  });

  it('createInternalError returns correct shape', () => {
    expect(createInternalError('boom')).toEqual({ kind: 'internal', message: 'boom' });
  });

  it('createConflictError returns correct shape', () => {
    expect(createConflictError('stale', 'id-2')).toEqual({
      kind: 'conflict',
      message: 'stale',
      resourceId: 'id-2',
    });
  });

  it('isAlertManagerError validates correctly', () => {
    expect(isAlertManagerError(createNotFoundError('x'))).toBe(true);
    expect(isAlertManagerError(createConflictError('x'))).toBe(true);
    expect(isAlertManagerError({ kind: 'unknown', message: 'x' })).toBe(false);
    expect(isAlertManagerError(null)).toBe(false);
  });

  it('errorToStatus maps kinds to HTTP codes', () => {
    expect(errorToStatus(createNotFoundError('x'))).toBe(404);
    expect(errorToStatus(createValidationError('x'))).toBe(400);
    expect(errorToStatus(createInternalError('x'))).toBe(500);
    expect(errorToStatus(createConflictError('x'))).toBe(409);
  });

  describe('isStatusCode', () => {
    it('returns true when the value carries a matching numeric statusCode', () => {
      expect(isStatusCode({ statusCode: 404 }, 404)).toBe(true);
      expect(isStatusCode(Object.assign(new Error('boom'), { statusCode: 409 }), 409)).toBe(true);
    });

    it('falls back to meta.statusCode', () => {
      expect(isStatusCode({ meta: { statusCode: 403 } }, 403)).toBe(true);
    });

    it('falls back to body.status (DirectQuery-wrapped upstream error)', () => {
      expect(isStatusCode({ body: { status: 401 } }, 401)).toBe(true);
    });

    it('returns false for non-matching or missing statusCode', () => {
      expect(isStatusCode({ statusCode: 500 }, 404)).toBe(false);
      expect(isStatusCode(new Error('HTTP 404 not found'), 404)).toBe(false);
      expect(isStatusCode(null, 404)).toBe(false);
      expect(isStatusCode(undefined, 404)).toBe(false);
      expect(isStatusCode('404', 404)).toBe(false);
    });
  });
});

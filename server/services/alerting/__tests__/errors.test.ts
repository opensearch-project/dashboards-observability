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
  extractErrorMessage,
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

  describe('extractErrorMessage', () => {
    it('returns the message of an Error subclass', () => {
      expect(extractErrorMessage(new Error('boom'))).toBe('boom');
      expect(extractErrorMessage(new TypeError('bad type'))).toBe('bad type');
    });

    it('returns the message of an AlertManagerError plain object', () => {
      expect(extractErrorMessage(createNotFoundError('Datasource not found: prom-1'))).toBe(
        'Datasource not found: prom-1'
      );
      expect(extractErrorMessage(createValidationError('bad PPL', 'query'))).toBe('bad PPL');
    });

    it('reads .message from an arbitrary object that carries one (e.g. opensearch-js shapes)', () => {
      expect(extractErrorMessage({ message: 'transport failure' })).toBe('transport failure');
    });

    it('reads .error from an arbitrary object when there is no .message', () => {
      expect(extractErrorMessage({ error: 'cluster unavailable' })).toBe('cluster unavailable');
    });

    it('passes through a primitive string', () => {
      expect(extractErrorMessage('plain string error')).toBe('plain string error');
    });

    it('returns "Unknown error" for null / undefined rather than the misleading "null" / "undefined"', () => {
      expect(extractErrorMessage(null)).toBe('Unknown error');
      expect(extractErrorMessage(undefined)).toBe('Unknown error');
    });

    it('falls back to String() for shapes with no recognizable message field', () => {
      // Plain object with no message/error key — String({a:1}) is "[object Object]"; this is the
      // documented fallback. Production callers should aim to throw with a message instead.
      expect(extractErrorMessage({ a: 1 })).toBe('[object Object]');
      expect(extractErrorMessage(42)).toBe('42');
    });

    it('regression: AlertManagerError no longer stringifies as [object Object]', () => {
      // PR #2696: fanout aggregator was using String(settled.reason), which produced
      // "[object Object]" for typed AlertManagerError rejections (e.g. when a Prometheus
      // dsId failed the OS-only resolver). The user-visible "ObservabilityStack_Prometheus:
      // [object Object]" toast came from this path.
      const reason = createNotFoundError('Datasource not found: prom-ds');
      expect(String(reason)).toBe('[object Object]');
      expect(extractErrorMessage(reason)).toBe('Datasource not found: prom-ds');
    });
  });

  describe('isStatusCode', () => {
    it('returns true when the value carries a matching numeric statusCode', () => {
      expect(isStatusCode({ statusCode: 404 }, 404)).toBe(true);
      expect(isStatusCode(Object.assign(new Error('boom'), { statusCode: 409 }), 409)).toBe(true);
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

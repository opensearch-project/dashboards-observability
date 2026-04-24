/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  createNotFoundError,
  createValidationError,
  createInternalError,
  isAlertManagerError,
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

  it('isAlertManagerError validates correctly', () => {
    expect(isAlertManagerError(createNotFoundError('x'))).toBe(true);
    expect(isAlertManagerError({ kind: 'unknown', message: 'x' })).toBe(false);
    expect(isAlertManagerError(null)).toBe(false);
  });

  it('errorToStatus maps kinds to HTTP codes', () => {
    expect(errorToStatus(createNotFoundError('x'))).toBe(404);
    expect(errorToStatus(createValidationError('x'))).toBe(400);
    expect(errorToStatus(createInternalError('x'))).toBe(500);
  });
});

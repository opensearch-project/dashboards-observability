/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { toHandlerResult } from '../route_utils';
import {
  createNotFoundError,
  createValidationError,
  createInternalError,
} from '../../../services/alerting';

describe('toHandlerResult', () => {
  it('maps AlertManagerError not_found to 404', () => {
    const result = toHandlerResult(createNotFoundError('gone'));
    expect(result).toEqual({ status: 404, body: { error: 'gone' } });
  });

  it('maps AlertManagerError validation to 400', () => {
    const result = toHandlerResult(createValidationError('bad'));
    expect(result).toEqual({ status: 400, body: { error: 'bad' } });
  });

  it('maps AlertManagerError internal to 500 with generic message', () => {
    const result = toHandlerResult(createInternalError('secret'));
    expect(result).toEqual({ status: 500, body: { error: 'An internal error occurred' } });
  });

  it('handles null/undefined', () => {
    expect(toHandlerResult(null).status).toBe(500);
    expect(toHandlerResult(undefined).status).toBe(500);
  });

  it('classifies plain Error with "not found" as 404', () => {
    expect(toHandlerResult(new Error('Resource not found')).status).toBe(404);
  });

  it('classifies plain Error with "validation" as 400', () => {
    expect(toHandlerResult(new Error('validation failed')).status).toBe(400);
  });

  it('falls back to 500 for unknown errors', () => {
    expect(toHandlerResult(new Error('something broke')).status).toBe(500);
  });
});

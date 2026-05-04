/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { toHandlerResult } from '../route_utils';
import {
  createNotFoundError,
  createValidationError,
  createInternalError,
  createConflictError,
} from '../../../services/alerting';
import type { Logger } from '../../../../common/types/alerting';

const makeLogger = (): Logger & {
  error: jest.Mock;
  warn: jest.Mock;
  info: jest.Mock;
  debug: jest.Mock;
} => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
});

describe('toHandlerResult', () => {
  it('maps AlertManagerError not_found to 404 and passes the typed message through', () => {
    const result = toHandlerResult(createNotFoundError('Monitor gone'));
    expect(result).toEqual({ status: 404, body: { error: 'Monitor gone' } });
  });

  it('maps AlertManagerError validation to 400 and passes the typed message through', () => {
    const result = toHandlerResult(createValidationError('bad'));
    expect(result).toEqual({ status: 400, body: { error: 'bad' } });
  });

  it('includes the optional `field` on validation errors so clients can highlight it', () => {
    const result = toHandlerResult(createValidationError('must be a string', 'monitor.name'));
    expect(result).toEqual({
      status: 400,
      body: { error: 'must be a string', field: 'monitor.name' },
    });
  });

  it('maps AlertManagerError internal to 500 with a generic message (hides internal detail)', () => {
    const result = toHandlerResult(createInternalError('secret detail'));
    expect(result).toEqual({ status: 500, body: { error: 'An internal error occurred' } });
  });

  it('maps AlertManagerError conflict to 409', () => {
    const result = toHandlerResult(createConflictError('Concurrent writer'));
    expect(result).toEqual({ status: 409, body: { error: 'Concurrent writer' } });
  });

  it('handles null/undefined', () => {
    expect(toHandlerResult(null).status).toBe(500);
    expect(toHandlerResult(undefined).status).toBe(500);
  });

  it('classifies plain Error with "not found" as 404 and scrubs the original message', () => {
    const logger = makeLogger();
    const result = toHandlerResult(
      new Error('monitor not found in index [monitors] on cluster-prod-01.internal'),
      logger
    );
    expect(result.status).toBe(404);
    // Original upstream message must NOT be reflected (would leak index + hostname).
    expect(result.body).toEqual({ error: 'Resource not found' });
    // Full upstream message is logged server-side.
    expect(logger.error).toHaveBeenCalledWith(
      'monitor not found in index [monitors] on cluster-prod-01.internal'
    );
  });

  it('classifies plain Error with "validation" as 400 and scrubs the message', () => {
    const logger = makeLogger();
    const result = toHandlerResult(
      new Error('validation failed: field foo must be string'),
      logger
    );
    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: 'Validation failed' });
    expect(logger.error).toHaveBeenCalled();
  });

  it('classifies plain Error with "REQUIRED" or "Must Be" (case-insensitive) as 400', () => {
    expect(toHandlerResult(new Error('field X is REQUIRED')).status).toBe(400);
    expect(toHandlerResult(new Error('field X Must Be a string')).status).toBe(400);
  });

  it('falls back to 500 with generic message for unknown errors and never reflects upstream content', () => {
    const logger = makeLogger();
    const result = toHandlerResult(
      new Error('connect ECONNREFUSED cluster-prod-01.internal:9200'),
      logger
    );
    expect(result.status).toBe(500);
    expect(result.body).toEqual({ error: 'An internal error occurred' });
    expect(JSON.stringify(result.body)).not.toContain('cluster-prod-01.internal');
    expect(logger.error).toHaveBeenCalledWith('connect ECONNREFUSED cluster-prod-01.internal:9200');
  });
});

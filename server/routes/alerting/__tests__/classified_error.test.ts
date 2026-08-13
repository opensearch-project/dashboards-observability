/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  __resetDefaultsFlagForTests,
  __resetRegistryForTests,
  registerDefaultClassifiers,
} from '../../../../common/error';
import type { ClassifiedError } from '../../../../common/error';
import type { Logger } from '../../../../common/types/alerting';
import { SloRulerError } from '../../../../common/slo/slo_errors';
import { createInternalError } from '../../../services/alerting/errors';
import {
  classifyToHandlerResult,
  configureErrorExposure,
  contextFromError,
} from '../classified_error';

const logger = {
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
} as unknown as Logger;

beforeEach(() => {
  __resetRegistryForTests();
  __resetDefaultsFlagForTests();
  registerDefaultClassifiers();
  configureErrorExposure(false);
  jest.clearAllMocks();
});

describe('contextFromError', () => {
  it('extracts a neutral context from a SloRulerError, dropping httpStatus 0', () => {
    const ctx = contextFromError(new SloRulerError('RULER_UNREACHABLE', 0, 'body'), 'op', 'cid');
    expect(ctx.upstreamCode).toBe('RULER_UNREACHABLE');
    expect(ctx.httpStatus).toBeUndefined();
    expect(ctx.correlationId).toBe('cid');
  });

  it('maps an AlertManagerError to its status', () => {
    const ctx = contextFromError(createInternalError('boom'), 'op', 'cid');
    expect(ctx.httpStatus).toBe(500);
    expect(ctx.message).toBe('boom');
  });

  it('reads opensearch-js style statusCode off a plain Error', () => {
    const e = Object.assign(new Error('nope'), { statusCode: 404 });
    expect(contextFromError(e, 'op', 'cid').httpStatus).toBe(404);
  });
});

describe('classifyToHandlerResult', () => {
  it('turns a ruler-unreachable failure into a specific classified error, not a generic 500', () => {
    const result = classifyToHandlerResult(
      new SloRulerError('RULER_UNREACHABLE', 503, 'upstream body'),
      { operation: 'rule.create.metric', logger }
    );
    const detail = result.body.errorDetail as ClassifiedError;
    expect(detail.category).toBe('UPSTREAM_UNAVAILABLE');
    expect(detail.code).toBe('RULE_BACKEND_UNAVAILABLE');
    expect(detail.title).toBe('Rule service unavailable');
    // The legacy `error` field carries the plain-language message (→ HTTP `message`).
    expect(result.body.error).toBe(detail.message);
    expect(result.body.correlationId).toEqual(expect.any(String));
    // Full detail logged server-side with the correlation id.
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect((logger.error as jest.Mock).mock.calls[0][0]).toContain(result.body.correlationId);
  });

  it('reclassifies a wrapped inner 409 conflict and trusts its 409 over the outer 503', () => {
    const result = classifyToHandlerResult(
      new SloRulerError(
        'RULER_UNREACHABLE',
        503,
        'error: 409 - { "message": "A namespace with name <namespace> already exists in this workspace." }'
      ),
      { operation: 'slo.repair', logger }
    );
    const detail = result.body.errorDetail as ClassifiedError;
    expect(detail.category).toBe('CONFLICT');
    expect(detail.code).toBe('RULE_GROUP_CONFLICT');
    expect(result.status).toBe(409);
  });

  it('strips sensitive detail by default but keeps it when exposure is enabled', () => {
    const err = new SloRulerError(
      'RULER_VALIDATION_FAILED',
      400,
      'invalid PromQL at https://host.internal/x'
    );

    const stripped = classifyToHandlerResult(err, {
      operation: 'rule.create.metric',
      logger,
    });
    const strippedDetail = stripped.body.errorDetail as ClassifiedError;
    expect(strippedDetail.details?.some((d) => d.sensitivity === 'sensitive')).toBeFalsy();
    // Safe (redacted) detail still present.
    const safe = strippedDetail.details?.find((d) => d.sensitivity === 'safe');
    expect(safe?.value).toContain('<redacted-url>');

    configureErrorExposure(true);
    const exposed = classifyToHandlerResult(err, {
      operation: 'rule.create.metric',
      logger,
    });
    const exposedDetail = exposed.body.errorDetail as ClassifiedError;
    expect(exposedDetail.details?.some((d) => d.sensitivity === 'sensitive')).toBe(true);
  });
});

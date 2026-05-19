/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Unit tests for the toast-message extractors that drive the wizard,
 * listing, and detail-page error toasts. The extractors must:
 *
 *   - Prefer `body.message` over `err.message` so OSD's HTTP-status
 *     reason ("Bad Request", "Not Found") does not eclipse the route's
 *     actionable diagnostic.
 *
 *   - Surface `body.attributes.errors` from the route's validation
 *     envelope. The single-error case (the canonical typo'd-datasource
 *     flow) renders inline; the multi-error case appends a count and
 *     defers to the wizard's inline summary.
 */

import { extractRulerErrorEnvelope, extractServerMessage } from '../slo_api_client';

function osdHttpError(body: unknown, message = 'Bad Request'): unknown {
  // Mirrors the IHttpFetchError shape OSD attaches `.body` to.
  const err = new Error(message) as Error & { body?: unknown };
  err.body = body;
  return err;
}

describe('extractServerMessage', () => {
  it('prefers body.message when the OSD envelope is present', () => {
    const err = osdHttpError({ message: 'Workspace id is malformed' }, 'Bad Request');
    expect(extractServerMessage(err)).toBe('Workspace id is malformed');
  });

  it('falls back to err.message when body is absent', () => {
    expect(extractServerMessage(new Error('boom'))).toBe('boom');
  });

  it('returns String(err) for non-Error inputs without a message', () => {
    expect(extractServerMessage(42)).toBe('42');
    expect(extractServerMessage(null)).toBe('null');
  });

  describe('attributes.errors envelope (route validation 400)', () => {
    it('renders single field errors inline as "head\\nfield: msg"', () => {
      const err = osdHttpError({
        message: 'Validation failed',
        attributes: {
          errors: {
            'spec.datasourceId':
              'Datasource "does-not-exist-pr2" is not registered. Pick one from /api/alerting/datasources.',
          },
        },
      });
      expect(extractServerMessage(err)).toBe(
        'Validation failed\n' +
          'spec.datasourceId: Datasource "does-not-exist-pr2" is not registered. ' +
          'Pick one from /api/alerting/datasources.'
      );
    });

    it('falls back to "Validation failed" head when body.message is absent', () => {
      const err = osdHttpError({
        attributes: {
          errors: { 'spec.name': 'Required' },
        },
      });
      expect(extractServerMessage(err)).toBe('Validation failed\nspec.name: Required');
    });

    it('renders multi-field errors as "head (N field errors)" — defers detail to inline summary', () => {
      const err = osdHttpError({
        message: 'Validation failed',
        attributes: {
          errors: {
            'spec.datasourceId': 'Datasource "X" is not registered',
            'spec.objectives[0].target': 'Target must be between 0 and 1',
            'spec.window.duration': 'Unsupported window',
          },
        },
      });
      expect(extractServerMessage(err)).toBe('Validation failed (3 field errors)');
    });

    it('ignores non-string error values and falls through to body.message when none survive', () => {
      const err = osdHttpError({
        message: 'Validation failed',
        attributes: {
          errors: {
            'spec.objectives': { foo: 'bar' }, // not a string
            'spec.window': null,
            'spec.x': '', // empty
          },
        },
      });
      expect(extractServerMessage(err)).toBe('Validation failed');
    });

    it('ignores non-object errors fields and falls through to body.message', () => {
      const err = osdHttpError({
        message: 'Validation failed',
        attributes: { errors: 'not-an-object' },
      });
      expect(extractServerMessage(err)).toBe('Validation failed');
    });
  });
});

describe('extractRulerErrorEnvelope', () => {
  it('returns null when the body has no ruler attributes', () => {
    expect(extractRulerErrorEnvelope(osdHttpError({ message: 'Bad Request' }))).toBeNull();
  });

  it('extracts a RULER_VALIDATION_FAILED envelope', () => {
    const env = extractRulerErrorEnvelope(
      osdHttpError({
        message: 'Ruler dual-write failed',
        attributes: {
          error: 'invalid PromQL',
          code: 'RULER_VALIDATION_FAILED',
          httpStatus: 400,
          rawBody: 'parse error at char 42',
        },
      })
    );
    expect(env).toEqual({
      error: 'invalid PromQL',
      code: 'RULER_VALIDATION_FAILED',
      httpStatus: 400,
      rawBody: 'parse error at char 42',
    });
  });

  it('returns null for unrelated attribute envelopes (e.g. validation 400)', () => {
    expect(
      extractRulerErrorEnvelope(
        osdHttpError({
          message: 'Validation failed',
          attributes: { errors: { 'spec.name': 'Required' } },
        })
      )
    ).toBeNull();
  });
});

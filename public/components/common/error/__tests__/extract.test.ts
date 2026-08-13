/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  classifiedToastColor,
  classifiedToastText,
  extractClassifiedError,
  showClassifiedErrorToast,
} from '../extract';
import type { ClassifiedError } from '../../../../../common/error';

function classified(overrides: Partial<ClassifiedError> = {}): ClassifiedError {
  return {
    category: 'UPSTREAM_UNAVAILABLE',
    code: 'RULE_BACKEND_UNAVAILABLE',
    title: 'Rule service unavailable',
    message: 'The rule backend could not be reached.',
    remediation: 'Retry shortly.',
    retryable: true,
    correlationId: 'cid-1',
    ...overrides,
  };
}

describe('extractClassifiedError', () => {
  it('reads the structured error from an OSD http error body', () => {
    const err = {
      body: { message: 'x', attributes: { errorDetail: classified() } },
    };
    const out = extractClassifiedError(err);
    expect(out?.code).toBe('RULE_BACKEND_UNAVAILABLE');
  });

  it('also reads a top-level body.errorDetail (no attributes wrapper)', () => {
    // Some routes may return the classified body directly rather than the
    // OSD `{ message, attributes }` wrap. Both shapes should work.
    const err = { body: { errorDetail: classified() } };
    const out = extractClassifiedError(err);
    expect(out?.code).toBe('RULE_BACKEND_UNAVAILABLE');
  });

  it('returns null when no structured error is present', () => {
    expect(extractClassifiedError({ body: { message: 'x' } })).toBeNull();
    expect(extractClassifiedError('nope')).toBeNull();
    expect(extractClassifiedError(null)).toBeNull();
  });
});

describe('toast presentation', () => {
  it('maps partial/timeout/rate-limited to warning, others to danger', () => {
    expect(classifiedToastColor(classified({ category: 'PARTIAL_STATE' }))).toBe('warning');
    expect(classifiedToastColor(classified({ category: 'TIMEOUT' }))).toBe('warning');
    expect(classifiedToastColor(classified({ category: 'CONFLICT' }))).toBe('danger');
  });

  it('composes text with message, remediation, safe details and reference', () => {
    const text = classifiedToastText(
      classified({
        details: [
          {
            key: 'redactedDetail',
            label: 'Details',
            value: 'invalid PromQL',
            sensitivity: 'safe',
          },
          {
            key: 'rawDetail',
            label: 'Raw',
            value: 'secret',
            sensitivity: 'sensitive',
          },
        ],
      })
    );
    expect(text).toContain('The rule backend could not be reached.');
    expect(text).toContain('Retry shortly.');
    expect(text).toContain('Details: invalid PromQL');
    expect(text).toContain('Reference: cid-1');
    // Sensitive details never appear in toast text.
    expect(text).not.toContain('secret');
  });

  it('omits the reference for self-serviceable categories, keeps it for escalation ones', () => {
    // VALIDATION / CONFLICT are self-serviceable — no reference noise.
    expect(classifiedToastText(classified({ category: 'VALIDATION' }))).not.toContain('Reference:');
    expect(classifiedToastText(classified({ category: 'CONFLICT' }))).not.toContain('Reference:');
    // Escalation categories keep the reference so it can be quoted in a ticket.
    expect(classifiedToastText(classified({ category: 'UPSTREAM_UNAVAILABLE' }))).toContain(
      'Reference: cid-1'
    );
    expect(classifiedToastText(classified({ category: 'PERMISSION_DENIED' }))).toContain(
      'Reference: cid-1'
    );
  });

  it('dispatches to addWarning/addDanger by category', () => {
    const toasts = { addDanger: jest.fn(), addWarning: jest.fn() };
    showClassifiedErrorToast(toasts, classified({ category: 'CONFLICT' }));
    expect(toasts.addDanger).toHaveBeenCalledTimes(1);
    expect(toasts.addWarning).not.toHaveBeenCalled();

    showClassifiedErrorToast(toasts, classified({ category: 'TIMEOUT' }));
    expect(toasts.addWarning).toHaveBeenCalledTimes(1);
  });
});

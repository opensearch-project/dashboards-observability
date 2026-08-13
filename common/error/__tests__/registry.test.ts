/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  __resetRegistryForTests,
  classifyError,
  registerErrorClassifier,
  registerErrorDetailEnricher,
  setTranslator,
  toClientPayload,
} from '../registry';
import { DetailKey } from '../messages';
import type { ClassifiedError, ErrorClassifier } from '../types';

function classifier(name: string, priority: number, code: string): ErrorClassifier {
  return {
    name,
    priority,
    match: () => true,
    classify: () => ({ category: 'UNKNOWN', code, retryable: false }),
  };
}

describe('registry', () => {
  beforeEach(() => __resetRegistryForTests());

  it('picks the highest-priority matching classifier', () => {
    registerErrorClassifier(classifier('low', 10, 'LOW_CODE'));
    registerErrorClassifier(classifier('high', 100, 'HIGH_CODE'));
    expect(classifyError({ operation: 'op' }).code).toBe('HIGH_CODE');
  });

  it('falls back to UNKNOWN when no classifier matches', () => {
    const result = classifyError({
      operation: 'op',
      message: 'boom at https://host.internal/x',
    });
    expect(result.category).toBe('UNKNOWN');
    expect(result.code).toBe('UNKNOWN_ERROR');
    // Surfaces a redacted safe excerpt and keeps the raw as a sensitive detail.
    const safe = result.details?.find((d) => d.sensitivity === 'safe');
    const sensitive = result.details?.find((d) => d.sensitivity === 'sensitive');
    expect(safe?.value).toBe('boom at <redacted-url>');
    expect(sensitive?.value).toBe('boom at https://host.internal/x');
  });

  it('echoes the correlation id onto the classified error', () => {
    expect(classifyError({ operation: 'op', correlationId: 'abc-123' }).correlationId).toBe(
      'abc-123'
    );
  });

  it('uses the registered translator to resolve wording', () => {
    setTranslator((d) => `T:${d.id}`);
    registerErrorClassifier(classifier('only', 1, 'RULE_GROUP_CONFLICT'));
    expect(classifyError({ operation: 'op' }).title).toBe(
      'T:observability.error.RULE_GROUP_CONFLICT.title'
    );
  });

  describe('toClientPayload exposure policy', () => {
    const withDetails: ClassifiedError = {
      category: 'UNKNOWN',
      code: 'UNKNOWN_ERROR',
      title: 'Something went wrong',
      message: 'An unexpected error occurred.',
      retryable: false,
      details: [
        {
          key: DetailKey.REDACTED,
          label: 'Details',
          value: 'boom',
          sensitivity: 'safe',
        },
        {
          key: DetailKey.RAW,
          label: 'Raw',
          value: 'boom at https://host.internal/x',
          sensitivity: 'sensitive',
        },
      ],
    };

    it('strips sensitive details by default', () => {
      const out = toClientPayload(withDetails);
      expect(out.details).toHaveLength(1);
      expect(out.details?.[0].sensitivity).toBe('safe');
    });

    it('keeps sensitive details when exposeSensitive is set', () => {
      const out = toClientPayload(withDetails, { exposeSensitive: true });
      expect(out.details).toHaveLength(2);
      expect(out.details?.some((d) => d.sensitivity === 'sensitive')).toBe(true);
    });

    it('re-redacts safe detail values as defense in depth', () => {
      const out = toClientPayload({
        ...withDetails,
        details: [
          {
            key: 'x',
            label: 'l',
            value: 'see https://host.cloud/y',
            sensitivity: 'safe',
          },
        ],
      });
      expect(out.details?.[0].value).toBe('see <redacted-url>');
    });
  });

  describe('enrichers', () => {
    it('adds detail but cannot bypass redaction of safe values', () => {
      registerErrorClassifier(classifier('only', 1, 'UNKNOWN_ERROR'));
      registerErrorDetailEnricher({
        name: 'leaky',
        enrich: (err) => ({
          ...err,
          details: [
            ...(err.details ?? []),
            {
              key: 'hint',
              label: 'Hint',
              value: 'call https://host.internal/api',
              sensitivity: 'safe',
            },
          ],
        }),
      });
      const out = classifyError({ operation: 'op' });
      const hint = out.details?.find((d) => d.key === 'hint');
      expect(hint?.value).toBe('call <redacted-url>');
    });

    it('a throwing enricher never breaks classification', () => {
      registerErrorClassifier(classifier('only', 1, 'UNKNOWN_ERROR'));
      registerErrorDetailEnricher({
        name: 'bad',
        enrich: () => {
          throw new Error('enricher blew up');
        },
      });
      expect(() => classifyError({ operation: 'op' })).not.toThrow();
      expect(classifyError({ operation: 'op' }).code).toBe('UNKNOWN_ERROR');
    });
  });
});

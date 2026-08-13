/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Generic, in-repo demonstration of the registration-only extension model.
 *
 * This is what a downstream fork does at startup to add richer, environment-
 * specific behavior WITHOUT editing any core file:
 *   1. register a higher-priority classifier that overrides a default, and
 *   2. register a detail enricher that adds environment-specific detail.
 *
 * Everything here is provider-neutral and uses only placeholders (e.g.
 * `<namespace>`). A real fork would substitute its own (non-open-source)
 * wording and detail in exactly this shape — never by forking core.
 */

import { registerErrorClassifier, registerErrorDetailEnricher } from '../registry';
import { DetailKey } from '../messages';
import type {
  ClassifiedError,
  ErrorClassifier,
  ErrorDetailEnricher,
  RawErrorContext,
} from '../types';

/**
 * A higher-priority classifier that overrides the default UPSTREAM_UNAVAILABLE
 * wording for a specific operation, supplying inline messages and an extra
 * `safe` hint. Priority 200 beats every core classifier (max core priority is
 * 100), so it wins whenever it matches.
 */
export const exampleOverrideClassifier: ErrorClassifier = {
  name: 'example.ruleBackendUnavailable',
  priority: 200,
  match: (ctx: RawErrorContext) =>
    ctx.operation === 'rule.create.metric' && ctx.upstreamCode === 'RULER_UNREACHABLE',
  classify: () => ({
    category: 'UPSTREAM_UNAVAILABLE',
    code: 'EXAMPLE_RULE_BACKEND_UNAVAILABLE',
    retryable: true,
    messages: {
      title: {
        id: 'example.error.ruleBackendUnavailable.title',
        defaultMessage: 'Rule service is temporarily unavailable',
      },
      message: {
        id: 'example.error.ruleBackendUnavailable.message',
        defaultMessage:
          'The rule service in namespace <namespace> did not respond. Your rule was not created.',
      },
      remediation: {
        id: 'example.error.ruleBackendUnavailable.remediation',
        defaultMessage: 'Retry in a few minutes; the service usually recovers on its own.',
      },
    },
    details: [
      {
        key: DetailKey.UPSTREAM_STATUS,
        label: { id: 'example.error.detail.hint', defaultMessage: 'Hint' },
        value: 'Namespace <namespace> is provisioned but the ruler is not reachable.',
        sensitivity: 'safe',
      },
    ],
  }),
};

/**
 * An enricher that appends an environment-specific `safe` breadcrumb to every
 * classified error. Enrichers add detail; they cannot remove the core's safety
 * guarantees (any `safe` value they add is re-redacted by the registry).
 */
export const exampleEnricher: ErrorDetailEnricher = {
  name: 'example.correlationHint',
  enrich: (err: ClassifiedError): ClassifiedError => ({
    ...err,
    details: [
      ...(err.details ?? []),
      {
        key: 'exampleSupportHint',
        label: 'Support',
        value: 'Reference <namespace> when contacting support.',
        sensitivity: 'safe',
      },
    ],
  }),
};

/** Call once at downstream startup — mirrors what a fork's plugin setup does. */
export function registerExampleDownstreamExtensions(): void {
  registerErrorClassifier(exampleOverrideClassifier);
  registerErrorDetailEnricher(exampleEnricher);
}

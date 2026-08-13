/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Framework-agnostic error-classification core. See ./README.md for the
 * taxonomy and the registration-only extension model.
 *
 * Consumers (server routes, client adapters, downstream forks) import from
 * here. The core has no framework dependencies; rendering and i18n live in
 * adapters that call `setTranslator` and the `register*` seams.
 */

export * from './types';
export { redactForDisplay } from './redact';
export { ErrorCode, MESSAGE_CATALOG, DETAIL_LABELS, DetailKey, fallbackEntry } from './messages';
export type { CatalogEntry, ErrorCodeValue } from './messages';
export {
  classifyError,
  toClientPayload,
  localizeClassified,
  registerErrorClassifier,
  registerErrorDetailEnricher,
  setTranslator,
  __resetRegistryForTests,
} from './registry';
export type { ClientPayloadOptions } from './registry';
export {
  classifyRuleHealthState,
  classifyRoutingStatus,
  stateClassifier,
} from './classifiers/state';
export { rulerClassifier } from './classifiers/ruler';
export { upstreamWrappedClassifier } from './classifiers/upstream_wrapped';
export { httpStatusClassifier } from './classifiers/http_status';
export { timeoutClassifier } from './classifiers/timeout';
export { rawDetails, stringifyRaw } from './classifiers/util';

import { registerErrorClassifier } from './registry';
import { upstreamWrappedClassifier } from './classifiers/upstream_wrapped';
import { stateClassifier } from './classifiers/state';
import { rulerClassifier } from './classifiers/ruler';
import { timeoutClassifier } from './classifiers/timeout';
import { httpStatusClassifier } from './classifiers/http_status';

let defaultsRegistered = false;

/**
 * Register the built-in classifiers. Idempotent — safe to call from both the
 * server and public plugin `setup()`. Downstream forks call this too, then add
 * their own higher-priority classifiers/enrichers on top.
 */
export function registerDefaultClassifiers(): void {
  if (defaultsRegistered) return;
  defaultsRegistered = true;
  registerErrorClassifier(upstreamWrappedClassifier);
  registerErrorClassifier(stateClassifier);
  registerErrorClassifier(rulerClassifier);
  registerErrorClassifier(timeoutClassifier);
  registerErrorClassifier(httpStatusClassifier);
}

/** Test-only: allow re-registration of defaults after a registry reset. */
export function __resetDefaultsFlagForTests(): void {
  defaultsRegistered = false;
}

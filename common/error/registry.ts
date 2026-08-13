/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The classification registry and pipeline.
 *
 * Core registers default classifiers at startup; a downstream fork registers
 * additional classifiers (higher priority) and optional detail enrichers —
 * purely by calling the `register*` functions, touching no core file.
 *
 * `classifyError` picks the highest-priority matching classifier, resolves
 * wording from the shared catalog (or the classifier's inline overrides)
 * through the registered `Translator`, applies enrichers, and returns a
 * fully-resolved `ClassifiedError`. `toClientPayload` then enforces the
 * exposure policy that keeps raw upstream text out of the browser by default.
 */

import { DETAIL_LABELS, DetailKey, ErrorCode, MESSAGE_CATALOG, fallbackEntry } from './messages';
import type { CatalogEntry } from './messages';
import { redactForDisplay } from './redact';
import type {
  ClassifiedError,
  ClassifierResult,
  ErrorClassifier,
  ErrorDetail,
  ErrorDetailEnricher,
  MessageDescriptor,
  RawErrorContext,
  ResolvedErrorDetail,
  Translator,
} from './types';

/** Interpolate `{placeholder}` tokens — the identity translator's behavior. */
function interpolate(message: string, values?: Record<string, string | number>): string {
  if (!values) return message;
  return message.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match
  );
}

const identityTranslator: Translator = (descriptor) =>
  interpolate(descriptor.defaultMessage, descriptor.values);

// Module-level mutable registry state. Reset in tests via
// __resetRegistryForTests(). Classifiers are kept sorted by descending
// priority; ties preserve registration order (stable sort).
let classifiers: ErrorClassifier[] = [];
let enrichers: ErrorDetailEnricher[] = [];
let translator: Translator = identityTranslator;

/** Install the framework translator (e.g. `@osd/i18n` / `@kbn/i18n`). */
export function setTranslator(next: Translator): void {
  translator = next;
}

/** Register a classifier. Higher `priority` wins during `classifyError`. */
export function registerErrorClassifier(classifier: ErrorClassifier): void {
  classifiers = [...classifiers, classifier].sort((a, b) => b.priority - a.priority);
}

/** Register a detail enricher. Enrichers run in registration order. */
export function registerErrorDetailEnricher(enricher: ErrorDetailEnricher): void {
  enrichers = [...enrichers, enricher];
}

/** Test-only: clear all registered classifiers/enrichers and the translator. */
export function __resetRegistryForTests(): void {
  classifiers = [];
  enrichers = [];
  translator = identityTranslator;
}

/**
 * Built-in UNKNOWN result. Surfaces a redacted excerpt of the underlying
 * message as a `safe` detail (so users get *something* actionable) and keeps
 * the verbatim message as a `sensitive` detail for opt-in exposure.
 */
function unknownResult(ctx: RawErrorContext): ClassifierResult {
  const details: ErrorDetail[] = [];
  if (ctx.message) {
    const redacted = redactForDisplay(ctx.message);
    if (redacted) {
      details.push({
        key: DetailKey.REDACTED,
        label: DETAIL_LABELS[DetailKey.REDACTED],
        value: redacted,
        sensitivity: 'safe',
      });
    }
    details.push({
      key: DetailKey.RAW,
      label: DETAIL_LABELS[DetailKey.RAW],
      value: String(ctx.message),
      sensitivity: 'sensitive',
    });
  }
  return {
    category: 'UNKNOWN',
    code: ErrorCode.UNKNOWN_ERROR,
    retryable: false,
    httpStatus: ctx.httpStatus,
    details: details.length ? details : undefined,
  };
}

function resolveDetail(detail: ErrorDetail): ResolvedErrorDetail {
  return {
    key: detail.key,
    label: translator(detail.label),
    // Re-redact safe values defensively; sensitive values pass through here and
    // are gated later by toClientPayload.
    value: detail.sensitivity === 'safe' ? redactForDisplay(detail.value) : detail.value,
    sensitivity: detail.sensitivity,
  };
}

/**
 * Classify a raw error context into a fully-resolved `ClassifiedError`.
 * Never throws: an unmatched context yields the UNKNOWN fallback.
 */
export function classifyError(ctx: RawErrorContext): ClassifiedError {
  const classifier = classifiers.find((c) => {
    try {
      return c.match(ctx);
    } catch {
      return false;
    }
  });

  const result = classifier ? classifier.classify(ctx) : unknownResult(ctx);

  const catalog = MESSAGE_CATALOG[result.code] ?? fallbackEntry(result.category);
  const pick = (
    override: MessageDescriptor | undefined,
    base: MessageDescriptor | undefined
  ): string | undefined => {
    const descriptor = override ?? base;
    return descriptor ? translator(descriptor) : undefined;
  };

  let classified: ClassifiedError = {
    category: result.category,
    code: result.code,
    title: pick(result.messages?.title, catalog.title) ?? result.code,
    message: pick(result.messages?.message, catalog.message) ?? '',
    remediation: pick(result.messages?.remediation, catalog.remediation),
    retryable: result.retryable,
    httpStatus: result.httpStatus ?? ctx.httpStatus,
    correlationId: ctx.correlationId,
    details: result.details?.map(resolveDetail),
  };

  for (const enricher of enrichers) {
    try {
      const enriched = enricher.enrich(classified, ctx);
      // Re-apply redaction to any safe details the enricher introduced —
      // enrichers add detail, they cannot bypass the safety guarantee.
      classified = {
        ...enriched,
        details: enriched.details?.map((d) =>
          d.sensitivity === 'safe' ? { ...d, value: redactForDisplay(d.value) } : d
        ),
      };
    } catch {
      // A misbehaving enricher must never break classification.
    }
  }

  return classified;
}

/**
 * Re-localize a classified error's wording using the currently-registered
 * translator, keyed by its stable `code` and detail `key`s. Used on the client
 * to localize a server-produced payload (which arrived resolved in English)
 * through `@osd/i18n`. Codes not in the shared catalog (e.g. a downstream
 * classifier's inline messages) are left as the server provided them.
 */
export function localizeClassified(err: ClassifiedError): ClassifiedError {
  const catalog: CatalogEntry | undefined = MESSAGE_CATALOG[err.code];
  if (!catalog) return err;
  return {
    ...err,
    title: translator(catalog.title),
    message: translator(catalog.message),
    remediation: catalog.remediation ? translator(catalog.remediation) : err.remediation,
    // Re-translate the label (a fixed catalog string) but never the value —
    // detail values are data (a redacted excerpt, a count, an upstream status),
    // not localizable text. A downstream classifier that wants localized detail
    // text should localize it before attaching, not store a message key here.
    details: err.details?.map((d) => {
      const label = DETAIL_LABELS[d.key];
      return label ? { ...d, label: translator(label) } : d;
    }),
  };
}

export interface ClientPayloadOptions {
  /** When true, `sensitive` details survive to the client. Default false. */
  exposeSensitive?: boolean;
}

/**
 * Produce the client-facing payload. Strips `sensitive` details unless
 * `exposeSensitive` is set, and re-redacts `safe` detail values as
 * defense-in-depth. This is the one gate that enforces "no raw upstream text
 * in the browser unless explicitly opted in".
 */
export function toClientPayload(
  err: ClassifiedError,
  options: ClientPayloadOptions = {}
): ClassifiedError {
  const exposeSensitive = options.exposeSensitive ?? false;
  const details = (err.details ?? [])
    .filter((d) => exposeSensitive || d.sensitivity === 'safe')
    .map((d) => (d.sensitivity === 'safe' ? { ...d, value: redactForDisplay(d.value) } : d));
  return { ...err, details: details.length ? details : undefined };
}

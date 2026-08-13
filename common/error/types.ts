/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Framework-agnostic error-classification types.
 *
 * This module is pure TypeScript: it imports nothing from OpenSearch
 * Dashboards, Kibana, React, or EUI, so the whole `common/error/` core drops
 * into a downstream fork unchanged. Rendering (toasts/callouts) and i18n
 * resolution live in framework-specific adapters that consume these types.
 *
 * The design intentionally separates three concerns:
 *   1. Classification — deciding a stable `category` + `code` from a raw error
 *      (the `ErrorClassifier`s). Provider-neutral by contract.
 *   2. Wording — mapping a `code` to user-facing text (the message catalog),
 *      resolved through a pluggable `Translator` so `@osd/i18n` (here) or
 *      `@kbn/i18n` (fork) can localize without touching core.
 *   3. Exposure — how much of the raw upstream detail reaches the browser
 *      (the `sensitivity` flag on `ErrorDetail`, enforced at serialization).
 */

/**
 * Provider-agnostic taxonomy. Every classified error lands in exactly one
 * category; the `code` narrows it to a specific, actionable situation.
 */
export type ErrorCategory =
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PERMISSION_DENIED'
  | 'UPSTREAM_UNAVAILABLE'
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'PRECONDITION_FAILED'
  | 'PARTIAL_STATE'
  | 'UNKNOWN';

/**
 * A localizable message. Carries a stable i18n `id` plus an English
 * `defaultMessage`; adapters translate via a `Translator`. The default
 * (identity) translator returns `defaultMessage` with `{placeholders}`
 * interpolated, so the core is usable with no i18n framework at all.
 */
export interface MessageDescriptor {
  id: string;
  defaultMessage: string;
  values?: Record<string, string | number>;
}

/** Resolves a descriptor to a display string. Registered per framework. */
export type Translator = (descriptor: MessageDescriptor) => string;

/**
 * Whether a piece of detail is safe to show in the browser by default.
 * `safe` values are redacted and always renderable; `sensitive` values hold
 * verbatim upstream text and are stripped before reaching the client unless
 * an operator/enricher explicitly opts in.
 */
export type DetailSensitivity = 'safe' | 'sensitive';

/** Classifier-produced detail (label is still a descriptor, pre-resolution). */
export interface ErrorDetail {
  /** Stable key so adapters can re-localize the label, e.g. 'rawDetail'. */
  key: string;
  label: MessageDescriptor;
  value: string;
  sensitivity: DetailSensitivity;
}

/** Detail after label resolution — the shape carried on a ClassifiedError. */
export interface ResolvedErrorDetail {
  key: string;
  label: string;
  value: string;
  sensitivity: DetailSensitivity;
}

/**
 * Everything a classifier gets to look at. Deliberately neutral: it never
 * carries framework objects, only primitives extracted at the boundary.
 */
export interface RawErrorContext {
  /** Stable operation id, e.g. 'rule.create.metric' | 'slo.repair'. */
  operation: string;
  /** Outer HTTP status, if the failure came from an HTTP call. */
  httpStatus?: number;
  /** Provider-neutral upstream code if one was extracted, e.g. 'RULER_UNREACHABLE'. */
  upstreamCode?: string;
  /** `Error.name` of the thrown value, if any. */
  errorName?: string;
  /** The underlying error message — used for UNKNOWN redaction, never shown verbatim. */
  message?: string;
  /** Original upstream payload. Never surfaced verbatim by default. */
  rawBody?: unknown;
  /** Neutral source hint, e.g. 'prometheus' | 'opensearch'. */
  sourceType?: string;
  /** Correlation id minted at the server boundary; echoed to the client. */
  correlationId?: string;
}

/**
 * What a classifier returns. It decides category/code/retryable and may attach
 * structured details; wording is normally looked up from the shared catalog by
 * `code`, but a classifier (e.g. a downstream one) may inline its own
 * `messages` for codes the catalog doesn't know.
 */
export interface ClassifierResult {
  category: ErrorCategory;
  code: string;
  retryable: boolean;
  httpStatus?: number;
  details?: ErrorDetail[];
  messages?: Partial<Record<'title' | 'message' | 'remediation', MessageDescriptor>>;
}

/** Fully-resolved, client-facing classified error. All text is display-ready. */
export interface ClassifiedError {
  category: ErrorCategory;
  code: string;
  title: string;
  message: string;
  remediation?: string;
  retryable: boolean;
  httpStatus?: number;
  correlationId?: string;
  details?: ResolvedErrorDetail[];
}

/**
 * A classifier. Higher `priority` wins. `match` is a cheap predicate;
 * `classify` runs only for the winning classifier. Downstream forks register
 * additional classifiers at a higher priority to override defaults — without
 * editing any core file.
 */
export interface ErrorClassifier {
  readonly name: string;
  readonly priority: number;
  match(ctx: RawErrorContext): boolean;
  classify(ctx: RawErrorContext): ClassifierResult;
}

/**
 * Optional enrichment seam. Runs after classification+resolution. May add
 * details (safe or sensitive) or refine wording; it cannot remove the safety
 * guarantees — any `safe` detail it returns is re-redacted, and `sensitive`
 * details still obey the client-exposure policy.
 */
export interface ErrorDetailEnricher {
  readonly name: string;
  enrich(err: ClassifiedError, ctx: RawErrorContext): ClassifiedError;
}

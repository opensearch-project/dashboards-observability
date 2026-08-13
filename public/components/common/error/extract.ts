/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Client-side helpers that turn a `ClassifiedError` into presentation inputs.
 * Framework-facing (toasts), but kept free of React so they're unit-testable
 * without a DOM. The callout component lives alongside in
 * ./classified_error_callout.tsx.
 */

import type { ToastInputFields } from '../../../../../../src/core/public';
import { localizeClassified } from '../../../../common/error';
import type { ClassifiedError } from '../../../../common/error';

export type ClassifiedToastColor = 'danger' | 'warning';

/**
 * Pull a structured `ClassifiedError` out of an OSD http error, if the server
 * attached one. OSD wraps `res.customError({ body: { message, attributes } })`
 * into an error whose `.body` is `{ message, attributes }`; our server adapter
 * places the structured error at `attributes.errorDetail` (the shape produced
 * by `toErrorBody` / the SLO route's `{ message, attributes }` wrap). We also
 * accept a top-level `body.errorDetail` so a future route that returns the
 * classified body directly still surfaces the rich toast. Re-localizes the
 * wording through the client translator. Returns null when absent so callers
 * can fall back to their existing generic handling.
 */
export function extractClassifiedError(err: unknown): ClassifiedError | null {
  if (!err || typeof err !== 'object') return null;
  const body = (err as { body?: unknown }).body;
  if (!body || typeof body !== 'object') return null;
  const attrs = (body as { attributes?: unknown }).attributes;
  const fromAttrs =
    attrs && typeof attrs === 'object'
      ? (attrs as { errorDetail?: unknown }).errorDetail
      : undefined;
  const detail = fromAttrs ?? (body as { errorDetail?: unknown }).errorDetail;
  if (
    !detail ||
    typeof detail !== 'object' ||
    typeof (detail as ClassifiedError).code !== 'string' ||
    typeof (detail as ClassifiedError).category !== 'string'
  ) {
    return null;
  }
  return localizeClassified(detail as ClassifiedError);
}

/** Warning for soft/partial/transient states; danger otherwise. */
export function classifiedToastColor(error: ClassifiedError): ClassifiedToastColor {
  switch (error.category) {
    case 'PARTIAL_STATE':
    case 'TIMEOUT':
    case 'RATE_LIMITED':
      return 'warning';
    default:
      return 'danger';
  }
}

/**
 * Categories whose next step is escalation (contact an admin / ops), where the
 * correlation id is worth quoting in a ticket so support can find the full,
 * un-redacted detail in the server logs. Self-serviceable categories
 * (VALIDATION, CONFLICT, NOT_FOUND, PRECONDITION_FAILED) surface an actionable
 * message on their own, so the reference is omitted there to avoid noise.
 */
const REFERENCE_CATEGORIES: ReadonlySet<ClassifiedError['category']> = new Set([
  'UPSTREAM_UNAVAILABLE',
  'TIMEOUT',
  'PERMISSION_DENIED',
  'RATE_LIMITED',
  'PARTIAL_STATE',
  'UNKNOWN',
]);

/**
 * Whether to surface the correlation id ("Reference: …") to the user. True only
 * when a correlation id exists and the category is one the user would escalate.
 */
export function shouldShowCorrelationReference(error: ClassifiedError): boolean {
  return Boolean(error.correlationId) && REFERENCE_CATEGORIES.has(error.category);
}

/** Compose the toast body text: message, remediation, safe details, reference. */
export function classifiedToastText(error: ClassifiedError): string {
  const parts: string[] = [error.message];
  if (error.remediation) parts.push(error.remediation);
  for (const detail of error.details ?? []) {
    if (detail.sensitivity === 'safe' && detail.value)
      parts.push(`${detail.label}: ${detail.value}`);
  }
  if (shouldShowCorrelationReference(error)) parts.push(`Reference: ${error.correlationId}`);
  return parts.join('\n');
}

/** Minimal shape of the OSD toasts service used by the adapter. */
export interface ToastsLike {
  addDanger: (toast: ToastInputFields) => void;
  addWarning: (toast: ToastInputFields) => void;
}

/**
 * Surface a classified error as an EUI toast (danger or warning by category).
 * The title/message are already localized; safe details and the correlation id
 * ride in the text. Raw (`sensitive`) details are shown only in the inline
 * callout, never in a toast.
 */
export function showClassifiedErrorToast(toasts: ToastsLike, error: ClassifiedError): void {
  const toast: ToastInputFields = {
    title: error.title,
    text: classifiedToastText(error),
  };
  if (classifiedToastColor(error) === 'warning') {
    toasts.addWarning(toast);
  } else {
    toasts.addDanger(toast);
  }
}

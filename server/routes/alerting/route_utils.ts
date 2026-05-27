/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { isAlertManagerError, errorToStatus } from '../../services/alerting';
import type { Logger } from '../../../common/types/alerting';

export interface HandlerResult {
  status: number;
  body: Record<string, any>;
}

/**
 * Convert any caught error into a framework-agnostic handler result.
 *
 * Only typed `AlertManagerError` messages are surfaced to clients — those are
 * intentionally shaped for UI display (e.g. "Monitor not found"). Generic
 * `Error.message` content is **never** reflected back, since upstream
 * OpenSearch / Prometheus exceptions routinely include cluster URLs, index
 * names, or stack fragments that leak internal topology. The full upstream
 * message is always logged server-side when a `logger` is supplied.
 *
 * The 400 path is the one narrow exception: when an upstream message has been
 * pattern-classified as a validation / illegal-argument failure (e.g. a PPL
 * compile error), the message itself is the actionable bit for the user, so
 * we surface it with the upstream prefix dropped. The 500 path stays generic
 * — a stack-trace-style "ECONNREFUSED cluster-prod-01.internal:9200" must
 * not leak.
 */
export function toHandlerResult(e: unknown, logger?: Logger): HandlerResult {
  if (isAlertManagerError(e)) {
    if (logger) logger.error(e.message);
    const body =
      e.kind === 'internal' ? { error: 'An internal error occurred' } : { error: e.message };
    return { status: errorToStatus(e), body };
  }
  // Guard against null/undefined being thrown — String(null) → "null" is unhelpful
  if (e == null) {
    if (logger) logger.error('Unknown error (null/undefined thrown)');
    return { status: 500, body: { error: 'An internal error occurred' } };
  }
  const msg = e instanceof Error ? e.message : String(e);
  if (logger) logger.error(msg);
  const lower = msg.toLowerCase();

  // Only classify as 404 when the error is specifically about a monitor or
  // resource not being found — NOT when an upstream PPL/index validation
  // error happens to contain "not found" (e.g. "index_not_found_exception").
  if (
    lower.includes("can't find monitor") ||
    lower.includes('monitor not found') ||
    lower.includes('destination not found')
  ) {
    return { status: 404, body: { error: 'Resource not found' } };
  }
  if (
    lower.includes('validation') ||
    msg.includes('required') ||
    msg.includes('must be') ||
    lower.includes('illegal') ||
    lower.includes('alerting_exception')
  ) {
    return { status: 400, body: { error: sanitizeValidationMessage(msg) } };
  }
  // Generic fallback — never reflect the raw upstream message. The full
  // detail has already been logged above for server-side diagnosis.
  return { status: 500, body: { error: 'An internal error occurred' } };
}

/**
 * Strip out the most common upstream noise prefixes so the user sees the
 * actionable validation reason instead of a transport / class wrapper. We do
 * not promise full sanitization here — these messages have already been
 * classified as user-facing 400s, but a cluster URL or hostname could in
 * principle still slip through (e.g. an illegal-argument error mentioning a
 * remote cross-cluster name). The defense in depth is: never reflect
 * non-validation errors (the 500 path above is generic).
 */
function sanitizeValidationMessage(msg: string): string {
  // Drop "OpenSearchClusterClient: " / "TransportException: " style class
  // wrappers that opensearch-js / common-utils prepend.
  const stripped = msg.replace(/^[\w.]+(Exception|Error):\s*/, '').trim();
  return stripped.length > 0 ? stripped : msg;
}

/**
 * Adapt handler-result body ({ error: '...' } or arbitrary data) to OSD's
 * ResponseError shape ({ message, attributes }). `error` → `message`, and the
 * remaining fields become `attributes`.
 */
export function toErrorBody(
  body: Record<string, unknown>
): { message: string; attributes?: Record<string, unknown> } {
  const { error, message, ...rest } = body as { error?: unknown; message?: unknown };
  const text =
    typeof error === 'string' ? error : typeof message === 'string' ? message : 'An error occurred';
  return Object.keys(rest).length > 0
    ? { message: text, attributes: rest as Record<string, unknown> }
    : { message: text };
}

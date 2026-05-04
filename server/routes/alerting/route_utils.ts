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
 */
export function toHandlerResult(e: unknown, logger?: Logger): HandlerResult {
  if (isAlertManagerError(e)) {
    if (logger) logger.error(e.message);
    if (e.kind === 'internal') {
      return { status: 500, body: { error: 'An internal error occurred' } };
    }
    // Typed errors carry intentionally-UI-safe messages. Surface the optional
    // `field` on validation errors so clients can do per-field highlights.
    const body: Record<string, unknown> = { error: e.message };
    if (e.kind === 'validation' && e.field) body.field = e.field;
    return { status: errorToStatus(e), body };
  }
  // Guard against null/undefined being thrown — String(null) → "null" is unhelpful
  if (e == null) {
    if (logger) logger.error('Unknown error (null/undefined thrown)');
    return { status: 500, body: { error: 'An internal error occurred' } };
  }
  const msg = e instanceof Error ? e.message : String(e);
  if (logger) logger.error(msg);
  const lowerMsg = msg.toLowerCase();
  if (lowerMsg.includes('not found')) {
    return { status: 404, body: { error: 'Resource not found' } };
  }
  if (
    lowerMsg.includes('validation') ||
    lowerMsg.includes('required') ||
    lowerMsg.includes('must be')
  ) {
    return { status: 400, body: { error: 'Validation failed' } };
  }
  return { status: 500, body: { error: 'An internal error occurred' } };
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

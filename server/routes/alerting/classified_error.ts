/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Server boundary adapter for the framework-agnostic error-classification core
 * (`common/error`). It turns a caught error into a `HandlerResult` whose body
 * keeps the legacy `error` string (so existing clients keep working) and adds
 * a structured `errorDetail` object plus a `correlationId`.
 *
 * Responsibilities that belong at the boundary (not in the pure core):
 *   - mint a correlation id,
 *   - build a neutral `RawErrorContext` from framework/domain error shapes,
 *   - log the FULL upstream detail server-side (with the correlation id) so the
 *     true cause is never lost, and
 *   - apply the client-exposure policy (strip `sensitive` details unless the
 *     operator opted in via config).
 */

import { randomUUID } from 'crypto';
import {
  classifyError,
  toClientPayload,
  type ClassifiedError,
  type RawErrorContext,
} from '../../../common/error';
import type { Logger } from '../../../common/types/alerting';
import { SloRulerError } from '../../../common/slo/slo_errors';
import { errorToStatus, isAlertManagerError } from '../../services/alerting/errors';
import type { HandlerResult } from './route_utils';

// Whether verbatim upstream detail (`sensitive` details) may reach the client.
// Default off — set once at plugin setup from
// `observability.errors.exposeSensitiveErrorDetail`.
let exposeSensitive = false;

/** Configure client exposure of sensitive detail. Called at plugin setup. */
export function configureErrorExposure(next: boolean): void {
  exposeSensitive = next;
}

/** Build a provider-neutral context from an arbitrary caught error. */
export function contextFromError(
  e: unknown,
  operation: string,
  correlationId: string
): RawErrorContext {
  const base: RawErrorContext = { operation, correlationId };
  if (e instanceof SloRulerError) {
    return {
      ...base,
      upstreamCode: e.code,
      // httpStatus 0 means "transport failure, no response" — leave undefined
      // so classifiers key off upstreamCode instead of a bogus status.
      httpStatus: e.httpStatus > 0 ? e.httpStatus : undefined,
      rawBody: e.rawBody,
      message: e.message,
      errorName: e.name,
    };
  }
  if (isAlertManagerError(e)) {
    return {
      ...base,
      httpStatus: errorToStatus(e),
      message: e.message,
      errorName: e.kind,
    };
  }
  if (e instanceof Error) {
    const statusCode = (e as { statusCode?: unknown }).statusCode;
    return {
      ...base,
      httpStatus: typeof statusCode === 'number' ? statusCode : undefined,
      message: e.message,
      errorName: e.name,
    };
  }
  return { ...base, message: e == null ? undefined : String(e) };
}

// Cap on the raw upstream body written to the server log line, so a large
// upstream object can't balloon log output. The full body is still available
// upstream of this layer; this only bounds the diagnostic log.
const LOG_RAW_MAX_LEN = 4096;

function stringifyRaw(rawBody: unknown): string {
  if (rawBody == null) return '';
  if (typeof rawBody === 'string') return rawBody;
  try {
    return JSON.stringify(rawBody);
  } catch {
    return String(rawBody);
  }
}

export interface ClassifyOptions {
  operation: string;
  logger?: Logger;
}

/**
 * Classify a caught error into a `HandlerResult`. The body is backward
 * compatible: `error` (string) still maps to the response `message`, and the
 * added `code` / `correlationId` / `errorDetail` fields ride along in
 * `attributes` through the existing route adapters.
 */
export function classifyToHandlerResult(e: unknown, opts: ClassifyOptions): HandlerResult {
  const correlationId = randomUUID();
  const ctx = contextFromError(e, opts.operation, correlationId);
  const classified: ClassifiedError = { ...classifyError(ctx), correlationId };

  if (opts.logger) {
    // Full detail, server-side only, keyed by correlation id — this is where
    // the true upstream cause is preserved regardless of what the client sees.
    // Cap the raw body so a large upstream object can't balloon a log line.
    const raw = stringifyRaw(ctx.rawBody);
    const rawForLog = raw.length > LOG_RAW_MAX_LEN ? `${raw.slice(0, LOG_RAW_MAX_LEN)}…` : raw;
    opts.logger.error(
      `[${opts.operation}] correlationId=${correlationId} ` +
        `${classified.category}/${classified.code} ` +
        `(HTTP ${classified.httpStatus ?? '-'}): ${ctx.message ?? ''} ${rawForLog}`.trim()
    );
  }

  const clientErr = toClientPayload(classified, { exposeSensitive });
  return {
    status: clientErr.httpStatus ?? 500,
    body: {
      error: clientErr.message,
      code: clientErr.code,
      correlationId,
      errorDetail: clientErr,
    },
  };
}

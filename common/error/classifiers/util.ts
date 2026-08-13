/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DETAIL_LABELS, DetailKey } from '../messages';
import { redactForDisplay } from '../redact';
import type { ErrorDetail } from '../types';

/** Best-effort stringify of an arbitrary upstream body. */
export function stringifyRaw(rawBody: unknown): string {
  if (rawBody == null) return '';
  if (typeof rawBody === 'string') return rawBody;
  try {
    return JSON.stringify(rawBody);
  } catch {
    return String(rawBody);
  }
}

/**
 * Build the standard pair of details from an upstream body: a `safe`
 * redacted excerpt (shown by default) and the `sensitive` verbatim text
 * (stripped from client payloads unless exposure is opted in).
 */
export function rawDetails(rawBody: unknown): ErrorDetail[] {
  const raw = stringifyRaw(rawBody);
  if (!raw) return [];
  const details: ErrorDetail[] = [];
  const redacted = redactForDisplay(raw);
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
    value: raw,
    sensitivity: 'sensitive',
  });
  return details;
}

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { TimeRange } from '../../common/types/service_types';

/**
 * URL-param parsing for the "Suggest SLOs" page. The page accepts
 *   #/slos/suggest[?source=apm][&services=<csv>][&from=<time>&to=<time>]
 * when entered from APM surfaces so it can scope the service list to the
 * caller's intent (e.g. "suggest missing SLOs for foo,bar") and reuse the
 * time range the user was viewing when they launched suggestion.
 *
 * `source` is currently validated only for `'apm'`; the field exists so
 * future CTAs can add new sources without a URL-shape change.
 */

export type SuggestSource = 'apm';

export interface SuggestScope {
  source: SuggestSource;
  /** `undefined` = unscoped (show everything `useServices()` returns). */
  services: string[] | undefined;
  /**
   * Time range carried over from the launching page. `undefined` when the page
   * is opened without an explicit (and valid) range, so callers can fall back
   * to a default.
   */
  timeRange: TimeRange | undefined;
}

const KNOWN_SOURCES: SuggestSource[] = ['apm'];

function isKnownSource(value: string): value is SuggestSource {
  return (KNOWN_SOURCES as string[]).includes(value);
}

/** Allowed characters for a relative/absolute time value (e.g. `now-15m`, ISO). */
const TIME_VALUE_REGEX = /^[a-zA-Z0-9_\-:+.TZ ]+$/;

/** Validate a single `from`/`to` value; returns `undefined` when unusable. */
function parseTimeValue(value: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 256 || !TIME_VALUE_REGEX.test(trimmed)) return undefined;
  return trimmed;
}

/**
 * Parse `?source=&services=&from=&to=` out of a `location.search` string.
 * Unknown `source` values fall back to `'apm'` (the only meaningful source
 * today); `services` missing or empty yields `undefined` rather than `[]` so
 * callers can distinguish "unscoped" from "scoped to nothing". A `timeRange` is
 * returned only when both `from` and `to` are present and valid.
 */
export function parseSuggestScopeFromSearch(search: string): SuggestScope {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const rawSource = params.get('source');
  const source: SuggestSource = rawSource && isKnownSource(rawSource) ? rawSource : 'apm';

  const from = parseTimeValue(params.get('from'));
  const to = parseTimeValue(params.get('to'));
  const timeRange = from && to ? { from, to } : undefined;

  const rawServices = params.get('services');
  if (!rawServices) return { source, services: undefined, timeRange };

  const services = rawServices
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  return { source, services: services.length > 0 ? services : undefined, timeRange };
}

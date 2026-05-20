/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * URL-param parsing for the "Suggest SLOs" page. The page accepts
 *   #/slos/suggest[?source=apm][&services=<csv>]
 * when entered from APM surfaces so it can scope the service list to the
 * caller's intent (e.g. "suggest missing SLOs for foo,bar").
 *
 * `source` is currently validated only for `'apm'`; the field exists so
 * future CTAs can add new sources without a URL-shape change.
 */

export type SuggestSource = 'apm';

export interface SuggestScope {
  source: SuggestSource;
  /** `undefined` = unscoped (show everything `useServices()` returns). */
  services: string[] | undefined;
}

const KNOWN_SOURCES: SuggestSource[] = ['apm'];

function isKnownSource(value: string): value is SuggestSource {
  return (KNOWN_SOURCES as string[]).includes(value);
}

/**
 * Parse `?source=&services=` out of a `location.search` string. Unknown
 * `source` values fall back to `'apm'` (the only meaningful source today);
 * `services` missing or empty yields `undefined` rather than `[]` so callers
 * can distinguish "unscoped" from "scoped to nothing".
 */
export function parseSuggestScopeFromSearch(search: string): SuggestScope {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const rawSource = params.get('source');
  const source: SuggestSource = rawSource && isKnownSource(rawSource) ? rawSource : 'apm';

  const rawServices = params.get('services');
  if (!rawServices) return { source, services: undefined };

  const services = rawServices
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  return { source, services: services.length > 0 ? services : undefined };
}

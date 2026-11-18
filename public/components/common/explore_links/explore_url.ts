/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EXPLORE_SIGNALS,
  ExploreQueryTarget,
  ExploreTimeRange,
} from '../../../../common/types/explore_links';

/**
 * Builds Explore (Discover Logs / Metrics / Traces) links from an {@link ExploreQueryTarget}.
 *
 * The `_g` / `_q` / `_a` rison is hand-built (no rison dependency), following Explore's URL
 * state contract (`src/plugins/explore/.../state_management/utils/redux_persistence.ts`):
 * - `_q.dataset` keeps only id, title, type, language, timeFieldName, dataSource, signalType;
 * - a Metrics dataset needs `signalType:metrics` or Explore replaces it (and drops the query);
 * - `_q.query` must be present, or Explore Logs injects the dataset's default query;
 * - `_a.ui.metricsPageMode:query` opens the Metrics query view instead of the metric browser.
 */

const RISON_NOT_IDCHAR = " '!:(),*@$";

/**
 * Escape a value for embedding inside a rison single-quoted string. Rison treats `!` as its
 * escape char and `'` as the string terminator, so both must be escaped (`!`→`!!` FIRST, then
 * `'`→`!'`) or the surrounding rison is corrupted and the OSD read path silently drops the
 * enclosing object.
 */
export function escapeRisonString(value: string): string {
  return value.replace(/!/g, '!!').replace(/'/g, "!'");
}

/**
 * Serialize a single datemath time value (from/to) for a hand-built rison `_g` on a URL hash.
 * Two hazards, both verified against rison-node + the OSD read path (URL-decode → rison-decode →
 * datemath):
 *  1) rison parse: a value starting with `-`/a digit, or containing a rison structural char (the
 *     `:` in an absolute ISO timestamp), must be rison single-quoted or rison treats `:` as a
 *     delimiter and drops `_g` entirely. Relative values like `now` / `now-1h` stay bare.
 *  2) URL decode runs BEFORE rison on read and turns a literal `+` into a space (`now+1h` →
 *     "now 1h", which datemath rejects → blank time). encodeURIComponent makes it `%2B`, which
 *     the read path decodes back to `+`.
 * So: rison-string-encode, THEN encodeURIComponent — mirrors OSD's canonical rison→URL write path
 * (encodeURIComponent is a stricter superset: it also percent-encodes `:`/`/`, which the read path
 * decodes back before rison, so every value round-trips).
 */
export function encodeTimeRangeValueForG(value: string): string {
  let bare = value !== '' && '-0123456789'.indexOf(value[0]) === -1;
  if (bare) {
    for (const ch of value) {
      if (RISON_NOT_IDCHAR.indexOf(ch) !== -1) {
        bare = false;
        break;
      }
    }
  }
  const risonValue = bare ? value : `'${escapeRisonString(value)}'`;
  return encodeURIComponent(risonValue);
}

/** A rison single-quoted string, rison-escaped then URL-encoded for a hash. */
function risonString(value: string): string {
  return `'${encodeURIComponent(escapeRisonString(value))}'`;
}

/** Whether a value is a well-formed target this builder can open. */
export function isExploreQueryTarget(value: unknown): value is ExploreQueryTarget {
  const t = value as ExploreQueryTarget | undefined;
  return (
    !!t &&
    typeof t === 'object' &&
    EXPLORE_SIGNALS.includes(t.signal) &&
    !!t.dataset &&
    typeof t.dataset.id === 'string' &&
    t.dataset.id.length > 0 &&
    typeof t.dataset.type === 'string' &&
    t.dataset.type.length > 0 &&
    typeof t.language === 'string' &&
    t.language.length > 0 &&
    typeof t.query === 'string'
  );
}

/** The Explore app id for a signal: `explore/logs`, `explore/metrics` or `explore/traces`. */
export function exploreAppId(signal: ExploreQueryTarget['signal']): string {
  return `explore/${signal}`;
}

/**
 * The app id and hash path that open `target` in Explore over `timeRange`. Pass both to
 * `application.navigateToApp(appId, { path })` or `getUrlForApp(appId, { path })`: both keep the
 * current workspace.
 */
export function buildExploreNavigation(
  target: ExploreQueryTarget,
  timeRange: ExploreTimeRange
): { appId: string; path: string } {
  const { dataset } = target;
  const fields: string[] = [`id:${risonString(dataset.id)}`];
  fields.push(`title:${risonString(dataset.title || dataset.id)}`);
  fields.push(`type:${risonString(dataset.type)}`);
  fields.push(`language:${risonString(target.language)}`);
  if (dataset.timeFieldName) fields.push(`timeFieldName:${risonString(dataset.timeFieldName)}`);
  if (target.signal !== 'logs') fields.push(`signalType:${target.signal}`);
  if (dataset.dataSource) {
    const ds = dataset.dataSource;
    const dsFields = [
      ds.id !== undefined ? `id:${risonString(ds.id)}` : undefined,
      ds.title !== undefined ? `title:${risonString(ds.title)}` : undefined,
      ds.type !== undefined ? `type:${risonString(ds.type)}` : undefined,
      ds.meta !== undefined
        ? `meta:(${Object.entries(ds.meta)
            .map(([k, v]) => `${risonString(k)}:${risonString(v)}`)
            .join(',')})`
        : undefined,
    ].filter(Boolean);
    fields.push(`dataSource:(${dsFields.join(',')})`);
  }
  // Line breaks are kept (URL-encoded): collapsing them could change a query, e.g. a PromQL
  // `#` comment would swallow the lines after it.
  const query = target.query.trim();
  const g = `_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:${encodeTimeRangeValueForG(
    timeRange.from
  )},to:${encodeTimeRangeValueForG(timeRange.to)}))`;
  const q = `_q=(dataset:(${fields.join(',')}),language:${risonString(
    target.language
  )},query:${risonString(query)})`;
  const ui =
    target.signal === 'metrics'
      ? 'activeTabId:explore_visualization_tab,metricsPageMode:query'
      : 'activeTabId:logs';
  const a = `_a=(ui:(${ui}))`;
  return { appId: exploreAppId(target.signal), path: `#/?${g}&${q}&${a}` };
}

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Helper for the "Run preview" affordance in the Create Monitor flyout.
 * Wraps the existing observability PPL proxy (`POST /api/ppl/search`) with
 * a friendlier success/error envelope so the UI can render
 * "✓ N rows in Mms" or a parse / index / timeout error without parsing
 * the cluster's raw shape.
 *
 * Reuses `coreRefs.pplService` — already wired during plugin start — so
 * MDS routing and HTTP plumbing match the rest of the plugin.
 */
import { i18n } from '@osd/i18n';
import { coreRefs } from '../../../../framework/core_refs';

export interface PplPreviewSchemaField {
  name: string;
  type: string;
}

export interface PplPreviewSuccess {
  ok: true;
  /** Total rows the query produced. */
  total: number;
  /** Server-reported execution time in ms when present. */
  tookMs?: number;
  /** Column metadata in declaration order. */
  schema: PplPreviewSchemaField[];
  /** Row records keyed by column name (first N rows only — caller decides N). */
  rows: Array<Record<string, unknown>>;
  /** The query that was actually executed — used to drive column ordering
   * (e.g. promoting `where`-clause fields). Frozen alongside the rows so
   * subsequent edits to the editor don't shuffle visible columns. */
  executedQuery: string;
}

export interface PplPreviewFailure {
  ok: false;
  /** User-facing error string — already mapped through the friendly-message table. */
  message: string;
  /** Raw server message preserved for debug copy/paste. */
  rawMessage?: string;
}

export type PplPreviewResult = PplPreviewSuccess | PplPreviewFailure;

const MAX_PREVIEW_ROWS = 2;

// Names users almost always want to see first when previewing log/trace
// queries. Order matters — earlier entries score lower (i.e., higher
// preference). Match is case-insensitive against the leaf field name.
const HEADLINE_FIELD_NAMES: readonly string[] = [
  'time',
  '@timestamp',
  'timestamp',
  'body',
  'message',
  'severityText',
  'severity_text',
  'severity',
  'level',
  'attributes.service.name',
  'resource.attributes.service.name',
  'serviceName',
  'service.name',
  'traceId',
  'trace_id',
  'attributes.otelTraceID',
  'spanId',
  'span_id',
];

// PPL/OpenSearch primitive types that render cleanly in a single cell.
// Anything outside this set is treated as "complex" and pushed lower.
const SCALAR_TYPES = new Set([
  'string',
  'keyword',
  'text',
  'boolean',
  'byte',
  'short',
  'integer',
  'int',
  'long',
  'bigint',
  'float',
  'double',
  'half_float',
  'scaled_float',
  'date',
  'date_nanos',
  'timestamp',
  'ip',
]);

const COMPLEX_TYPES = new Set(['struct', 'object', 'nested', 'array']);

// Members of the timestamp family — when more than one shows up in a
// schema (e.g. `time` AND `@timestamp` carrying identical values from an
// ingest pipeline copy), only the first one in headline order is kept;
// the rest are folded into "N columns hidden" so a column slot opens up
// for something more informative.
const TIMESTAMP_FAMILY = new Set(['time', '@timestamp', 'timestamp']);

/**
 * Pull leaf field names referenced by a `where` clause out of the user's
 * PPL query. Used as a soft signal to surface filter columns immediately
 * after the timestamp — if a user is filtering on `attributes.otelTraceID`,
 * that's almost certainly the column they want to see in the preview.
 *
 * Best-effort regex parse — we don't ship a real PPL parser here. Tolerant
 * of backticks, dotted paths, and chained AND/OR conditions; ignores
 * literal values on the right-hand side. False positives go through the
 * normal scalar/complex ordering, so the worst case is "no extra promotion."
 */
export function extractWhereFieldNames(query: string): string[] {
  if (!query) return [];
  const found = new Set<string>();
  // Match every `where` / `WHERE` segment up to the next pipe (PPL command
  // boundary) or end-of-string. Greedy on identifiers, lazy on the segment.
  const whereSegments = query.match(/\bwhere\b([^|]+)/gi);
  if (!whereSegments) return [];
  for (const seg of whereSegments) {
    // Strip the leading "where" keyword.
    const body = seg.replace(/^\s*where\b/i, '');
    // Tokens that look like field references on the LHS of comparisons /
    // function calls. Pulls anything matching `foo`, `foo.bar`, or
    // backticked variants. Skips obvious literals (numbers, quoted strings).
    const tokenRe = /`([^`]+)`|([A-Za-z_][\w.]*)/g;
    let m: RegExpExecArray | null;
    while ((m = tokenRe.exec(body)) !== null) {
      const name = m[1] ?? m[2];
      if (!name) continue;
      const lc = name.toLowerCase();
      // Skip operators, function names, boolean keywords — anything that
      // wouldn't be a column. Conservative list; missing entries just mean
      // a few junk promotions, not broken sort.
      if (
        ['and', 'or', 'not', 'in', 'between', 'like', 'is', 'null', 'true', 'false'].includes(lc)
      ) {
        continue;
      }
      // Skip values that PPL function calls produce (e.g. `now()`).
      // We strip the trailing `(` by checking the next char in the source.
      const next = body[tokenRe.lastIndex];
      if (next === '(') continue;
      found.add(name);
    }
  }
  return Array.from(found);
}

/**
 * Score a schema field for preview-column ordering. Lower scores sort first.
 * Priority bands (most negative wins):
 *   - Headline fields (time, body, severityText, …) — pinned to the very top
 *   - Fields referenced in a `where` clause — pinned just after headlines so
 *     the user immediately sees what they're filtering on
 *   - Scalar types — readable in a single cell
 *   - Default — declaration order
 *   - Complex types (struct/object/nested/array) — sunk to the bottom
 */
function fieldOrderScore(
  field: PplPreviewSchemaField,
  index: number,
  whereFieldsLc: Set<string>
): number {
  const lcName = field.name.toLowerCase();
  const headlineIdx = HEADLINE_FIELD_NAMES.findIndex((h) => h.toLowerCase() === lcName);
  if (headlineIdx >= 0) return -10000 + headlineIdx;
  if (whereFieldsLc.has(lcName)) return -5000 + index;
  const lcType = field.type?.toLowerCase() ?? '';
  if (SCALAR_TYPES.has(lcType)) return -1000 + index;
  if (COMPLEX_TYPES.has(lcType)) return 1000 + index;
  return index;
}

/**
 * Sort the schema so the most useful columns come first, then drop redundant
 * timestamp duplicates. Returns a new array — the original cluster-declaration
 * order is preserved on the input.
 *
 * `query` is optional: when provided, fields referenced in a `where` clause
 * are promoted directly after the timestamp so users see what they're
 * filtering on without scrolling.
 */
export function orderSchemaForPreview(
  schema: PplPreviewSchemaField[],
  query?: string
): PplPreviewSchemaField[] {
  const whereFieldsLc = new Set(extractWhereFieldNames(query ?? '').map((n) => n.toLowerCase()));
  const sorted = [...schema]
    .map((f, index) => ({ f, index, score: fieldOrderScore(f, index, whereFieldsLc) }))
    .sort((a, b) => a.score - b.score)
    .map(({ f }) => f);

  // Drop additional members of the timestamp family beyond the first.
  // Keeps the order produced above — `time` wins over `@timestamp` because
  // it's listed earlier in `HEADLINE_FIELD_NAMES`.
  let timestampSeen = false;
  return sorted.filter((f) => {
    if (TIMESTAMP_FAMILY.has(f.name.toLowerCase())) {
      if (timestampSeen) return false;
      timestampSeen = true;
    }
    return true;
  });
}

/**
 * Map common PPL/cluster error strings to short, action-oriented copy.
 * The original message is kept on `rawMessage` so power users can still
 * see the verbatim cluster response in DevTools.
 */
function friendlyMessage(raw: string): string {
  const lc = raw.toLowerCase();
  if (lc.includes('syntax') || lc.includes('parse')) {
    return i18n.translate('observability.alerting.pplPreview.error.syntax', {
      defaultMessage: 'Invalid PPL query syntax. Check pipes, quoting, and command order.',
    });
  }
  if (lc.includes('not found') && (lc.includes('index') || lc.includes('table'))) {
    return i18n.translate('observability.alerting.pplPreview.error.indexNotFound', {
      defaultMessage: 'Index not found. Verify the index/alias name in the source clause.',
    });
  }
  if (lc.includes('field') && lc.includes('not found')) {
    // Surface the cluster's verbatim message — it already names the missing
    // field, which is the most useful thing the user can see.
    return raw;
  }
  if (lc.includes('timeout')) {
    return i18n.translate('observability.alerting.pplPreview.error.timeout', {
      defaultMessage: 'Query timed out. Try narrowing the time range or simplifying the query.',
    });
  }
  if (lc.includes('forbidden') || lc.includes('unauthorized')) {
    return i18n.translate('observability.alerting.pplPreview.error.forbidden', {
      defaultMessage:
        'You do not have permission to run this query against the selected datasource.',
    });
  }
  return raw;
}

function extractRawMessage(err: unknown): string {
  const e = err as { body?: { message?: string }; message?: string };
  if (e?.body?.message) return e.body.message;
  if (e?.message) return e.message;
  try {
    return JSON.stringify(err);
  } catch {
    return 'Unknown error';
  }
}

/**
 * Run the user's PPL string against the chosen datasource and return a
 * normalized preview envelope. Always resolves — never throws — so the UI
 * can render success / failure with a single render path.
 */
export async function runPplPreview({
  query,
  mdsId,
}: {
  query: string;
  /** Stable MDS saved-object id; undefined for the local cluster. */
  mdsId?: string;
}): Promise<PplPreviewResult> {
  const trimmed = query.trim();
  if (!trimmed) {
    return {
      ok: false,
      message: i18n.translate('observability.alerting.pplPreview.error.emptyQuery', {
        defaultMessage: 'Enter a PPL query before running a preview.',
      }),
    };
  }

  const ppl = coreRefs.pplService;
  if (!ppl) {
    return {
      ok: false,
      message: i18n.translate('observability.alerting.pplPreview.error.serviceUnavailable', {
        defaultMessage: 'PPL service is not available yet. Try again in a moment.',
      }),
    };
  }

  try {
    // `format: 'jdbc'` returns the schema + datarows the adaptor reshapes
    // into `jsonData` (one record per row, keyed by column name).
    const resp = (await ppl.fetch({ query: trimmed, format: 'jdbc' }, mdsId)) as {
      schema?: PplPreviewSchemaField[];
      datarows?: unknown[][];
      total?: number;
      size?: number;
      took?: number;
      jsonData?: Array<Record<string, unknown>>;
    } | null;

    if (!resp) {
      return {
        ok: false,
        message: i18n.translate('observability.alerting.pplPreview.error.emptyResponse', {
          defaultMessage: 'Empty response from PPL service.',
        }),
      };
    }

    const schema = resp.schema ?? [];
    const rowsAll = resp.jsonData ?? [];
    const total = resp.total ?? rowsAll.length;
    const tookMs = typeof resp.took === 'number' ? resp.took : undefined;

    return {
      ok: true,
      total,
      tookMs,
      schema,
      rows: rowsAll.slice(0, MAX_PREVIEW_ROWS),
      executedQuery: trimmed,
    };
  } catch (err) {
    const raw = extractRawMessage(err);
    return {
      ok: false,
      message: friendlyMessage(raw),
      rawMessage: raw,
    };
  }
}

export const PPL_PREVIEW_MAX_ROWS = MAX_PREVIEW_ROWS;

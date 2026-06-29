/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Structured PromQL model for the SLI query builder.
 *
 * The builder UI manipulates this model and serializes it to a PromQL string
 * that is stored verbatim in the wizard's `customPromql` state — the SLO data
 * model, rule generator, and validators are unchanged. `parsePromQL` is the
 * inverse: a best-effort hydrate so the Builder/Code modes stay in sync, the
 * same way Grafana synchronizes its visual and text editors.
 *
 * Scope: this models the common SLI shape — an aggregation over a windowed
 * `rate()` of a single counter with label matchers, optionally grouped `by`.
 * That covers availability/throughput ratio numerators and denominators. Any
 * expression too complex to round-trip falls back to raw Code mode (the parser
 * returns null), so the user is never blocked.
 */

/** Prometheus label matcher operators. */
export type MatchOp = '=' | '!=' | '=~' | '!~';

export interface LabelFilter {
  label: string;
  op: MatchOp;
  value: string;
}

/** Outer aggregation applied over the windowed rate. `none` = no aggregation. */
export type AggOp = 'sum' | 'avg' | 'min' | 'max' | 'count' | 'none';

/** A single metric term: `agg by (...)( rate(metric{filters}[window]) )`. */
export interface MetricTerm {
  metric: string;
  filters: LabelFilter[];
}

export interface PromQLModel {
  metric: string;
  filters: LabelFilter[];
  /** Wrap the selector in `rate(...[window])`. Counters need this; gauges don't. */
  rate: boolean;
  /** Rate window token, e.g. `5m`. Only meaningful when `rate` is true. */
  window: string;
  agg: AggOp;
  /** Labels for an `agg by (...)` clause. Empty = aggregate across all. */
  by: string[];
  /**
   * Optional second metric subtracted from the first, producing
   * `<term> - <subtractTerm>`. Models the common APM "good = request - fault"
   * shape so it stays in the visual builder instead of falling back to raw
   * text. The subtract term shares this model's agg/rate/window/by — they're a
   * matched pair, so the user only sets its metric + filters.
   */
  subtract?: MetricTerm;
}

export const DEFAULT_MODEL: PromQLModel = {
  metric: '',
  filters: [],
  rate: true,
  window: '5m',
  agg: 'sum',
  by: [],
};

const METRIC_NAME_RE = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/;
const LABEL_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const WINDOW_RE = /^\d+(ms|s|m|h|d|w|y)$/;
const MATCH_OPS: MatchOp[] = ['=~', '!~', '!=', '=']; // order matters: longest first

/** Escape a label value for a double-quoted PromQL string. */
function quoteValue(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** Render the `{label op "value", ...}` matcher block (empty string if none). */
function serializeFilters(filters: LabelFilter[]): string {
  const parts = filters
    .filter((f) => f.label && f.value !== undefined)
    .map((f) => `${f.label}${f.op}${quoteValue(f.value)}`);
  return parts.length ? `{${parts.join(', ')}}` : '';
}

/**
 * Serialize one metric term using the model's shared agg/rate/window/by.
 * Returns '' when the term has no metric.
 */
function serializeTerm(
  metric: string,
  filters: LabelFilter[],
  rate: boolean,
  window: string,
  agg: AggOp,
  by: string[]
): string {
  if (!metric) return '';
  const selector = `${metric}${serializeFilters(filters)}`;
  const inner = rate ? `rate(${selector}[${window}])` : selector;
  if (agg === 'none') return inner;
  const byClause = by.length ? ` by (${by.join(', ')})` : '';
  return `${agg}${byClause}(${inner})`;
}

/**
 * Serialize a model to PromQL. Returns '' when there's no metric yet (so the
 * preview shows nothing rather than a malformed fragment). When `subtract` is
 * present, emits `<term> - <subtractTerm>` (both share agg/rate/window/by).
 */
export function serializePromQL(model: PromQLModel): string {
  const main = serializeTerm(
    model.metric,
    model.filters,
    model.rate,
    model.window,
    model.agg,
    model.by
  );
  if (!main) return '';
  if (model.subtract && model.subtract.metric) {
    const sub = serializeTerm(
      model.subtract.metric,
      model.subtract.filters,
      model.rate,
      model.window,
      model.agg,
      model.by
    );
    return `${main} - ${sub}`;
  }
  return main;
}

function filtersComplete(filters: LabelFilter[]): boolean {
  return filters.every((f) => LABEL_NAME_RE.test(f.label) && f.value !== '');
}

/** True when a model is complete enough to serialize into a usable query. */
export function isModelComplete(model: PromQLModel): boolean {
  if (!METRIC_NAME_RE.test(model.metric)) return false;
  if (model.rate && !WINDOW_RE.test(model.window)) return false;
  if (model.by.some((l) => !LABEL_NAME_RE.test(l))) return false;
  if (!filtersComplete(model.filters)) return false;
  if (model.subtract && model.subtract.metric) {
    if (!METRIC_NAME_RE.test(model.subtract.metric)) return false;
    if (!filtersComplete(model.subtract.filters)) return false;
  }
  return true;
}

// ============================================================================
// Parser — best-effort hydrate from a PromQL string.
// ============================================================================

/** Split a matcher block body (without braces) into individual filters. */
function parseFilters(body: string): LabelFilter[] | null {
  const trimmed = body.trim();
  if (!trimmed) return [];
  const filters: LabelFilter[] = [];
  // Split on commas not inside quotes.
  const parts = trimmed.match(/(?:[^,"]|"(?:\\.|[^"])*")+/g) ?? [];
  for (const part of parts) {
    const seg = part.trim();
    if (!seg) continue;
    const op = MATCH_OPS.find((o) => {
      const i = seg.indexOf(o);
      // Operator must sit right after the label name (no earlier op char).
      return i > 0 && LABEL_NAME_RE.test(seg.slice(0, i));
    });
    if (!op) return null;
    const idx = seg.indexOf(op);
    const label = seg.slice(0, idx).trim();
    let value = seg.slice(idx + op.length).trim();
    if (!(value.startsWith('"') && value.endsWith('"'))) return null;
    value = value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    filters.push({ label, op, value });
  }
  return filters;
}

/**
 * Given `text` whose first non-space char is `open`, return the substring
 * between that delimiter and its *balanced* partner, requiring the partner to
 * be the final non-space char (nothing may trail it). Quotes are respected so
 * a `)` or `}` inside a label value doesn't close the group.
 *
 * This is what stops `sum(A) - sum(B)` from being mis-read as a single
 * `sum(...)`: the first `(` closes after `A`, leaving ` - sum(B)` trailing, so
 * we return null and the caller falls back to the raw text box.
 */
function extractBalanced(text: string, open: '(' | '{'): string | null {
  const close = open === '(' ? ')' : '}';
  const trimmed = text.trim();
  if (trimmed[0] !== open) return null;
  let depth = 0;
  let inQuote = false;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (inQuote) {
      if (ch === '\\') i++;
      // skip escaped char
      else if (ch === '"') inQuote = false;
      continue;
    }
    if (ch === '"') inQuote = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) {
        // Matched. Anything after (other than whitespace) means this wasn't a
        // single balanced group — reject.
        return trimmed.slice(i + 1).trim() === '' ? trimmed.slice(1, i) : null;
      }
    }
  }
  return null;
}

/** Parse `metric{...}` or `metric` into { metric, filters }. */
function parseSelector(text: string): { metric: string; filters: LabelFilter[] } | null {
  const trimmed = text.trim();
  const braceIdx = trimmed.indexOf('{');
  if (braceIdx === -1) {
    return METRIC_NAME_RE.test(trimmed) ? { metric: trimmed, filters: [] } : null;
  }
  const metric = trimmed.slice(0, braceIdx).trim();
  if (!METRIC_NAME_RE.test(metric)) return null;
  // The matcher block must be a single balanced `{...}` ending the string.
  const body = extractBalanced(trimmed.slice(braceIdx), '{');
  if (body === null) return null;
  const filters = parseFilters(body);
  return filters ? { metric, filters } : null;
}

/** Shape of a single parsed term — one aggregated (optionally rated) metric. */
interface ParsedTerm {
  metric: string;
  filters: LabelFilter[];
  rate: boolean;
  window: string;
  agg: AggOp;
  by: string[];
}

/**
 * Parse a single term: `agg by (...)( rate(metric{filters}[window]) )`, or any
 * subset thereof. Returns null when the text isn't a single balanced term.
 */
function parseTerm(input: string): ParsedTerm | null {
  let text = input.trim();
  if (!text) return null;

  let agg: AggOp = 'none';
  let by: string[] = [];

  // Optional outer aggregation: `agg by (a, b) ( ... )` or `agg( ... )`. Only
  // the leading `agg`/`by(...)` tokens are matched by regex; the argument list
  // is then extracted with balanced-paren matching so `sum(A) - sum(B)` (whose
  // first `(` does NOT wrap the whole expression) is rejected, not mangled.
  const aggMatch = text.match(/^(sum|avg|min|max|count)\s*(?:by\s*\(([^)]*)\)\s*)?/i);
  if (aggMatch && aggMatch[0].trim()) {
    const rest = text.slice(aggMatch[0].length).trim();
    const inner = extractBalanced(rest, '(');
    // A bare metric named `sum`/`count` etc. has no `(...)` — fall through to
    // treating the whole string as a selector rather than forcing an agg.
    if (inner !== null) {
      agg = aggMatch[1].toLowerCase() as AggOp;
      if (aggMatch[2] !== undefined) {
        by = aggMatch[2]
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      }
      text = inner.trim();
    }
  }

  // Optional rate wrapper: `rate( selector [window] )`.
  let rate = false;
  let window = DEFAULT_MODEL.window;
  if (/^rate\s*\(/i.test(text)) {
    const innerRate = extractBalanced(text.slice(text.indexOf('(')), '(');
    if (innerRate === null) return null;
    rate = true;
    const trimmedInner = innerRate.trim();
    const winMatch = trimmedInner.match(/\[(\w+)\]$/);
    if (!winMatch || !WINDOW_RE.test(winMatch[1])) return null;
    window = winMatch[1];
    text = trimmedInner.slice(0, trimmedInner.length - winMatch[0].length).trim();
  }

  const selector = parseSelector(text);
  if (!selector) return null;

  return { metric: selector.metric, filters: selector.filters, rate, window, agg, by };
}

/**
 * Find the index of a top-level binary `-` (surrounded by whitespace), i.e. one
 * not nested in parens/braces or inside a quoted value. Returns -1 if none.
 * Requires whitespace on both sides so a metric/label name's `-` isn't matched
 * (PromQL identifiers can't contain `-`, but label values can).
 */
function findTopLevelMinus(text: string): number {
  let depth = 0;
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuote) {
      if (ch === '\\') i++;
      else if (ch === '"') inQuote = false;
      continue;
    }
    if (ch === '"') inQuote = true;
    else if (ch === '(' || ch === '{') depth++;
    else if (ch === ')' || ch === '}') depth--;
    else if (ch === '-' && depth === 0 && text[i - 1] === ' ' && text[i + 1] === ' ') {
      return i;
    }
  }
  return -1;
}

/**
 * Best-effort parse of a serialized SLI query back into the structured model.
 * Returns null when the string doesn't fit the builder's supported shape — the
 * caller then keeps the user in Code mode rather than corrupting their query.
 *
 * Supports an optional top-level `<term> - <term>` (the APM "good = request -
 * fault" shape). Both terms must share the same agg/rate/window/by, since the
 * builder renders the subtract term as a sibling of the main metric under one
 * set of shared controls.
 */
export function parsePromQL(query: string): PromQLModel | null {
  const text = query.trim();
  if (!text) return null;

  const minusIdx = findTopLevelMinus(text);
  if (minusIdx === -1) {
    const term = parseTerm(text);
    if (!term) return null;
    return { ...term };
  }

  // Difference of two terms — model as main minus subtract.
  const left = parseTerm(text.slice(0, minusIdx));
  const right = parseTerm(text.slice(minusIdx + 1));
  if (!left || !right) return null;
  // The two terms must share aggregation shape to be representable as one
  // builder block with a single set of agg/rate/window/by controls.
  if (
    left.agg !== right.agg ||
    left.rate !== right.rate ||
    left.window !== right.window ||
    left.by.length !== right.by.length ||
    left.by.some((b, i) => b !== right.by[i])
  ) {
    return null;
  }

  return {
    metric: left.metric,
    filters: left.filters,
    rate: left.rate,
    window: left.window,
    agg: left.agg,
    by: left.by,
    subtract: { metric: right.metric, filters: right.filters },
  };
}

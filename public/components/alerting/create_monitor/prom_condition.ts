/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Pure composition + parsing core for the PromQL alert-condition
 * builder. Kept free of React so the (fiddly) expression assembly and its
 * inverse round-trip parser can be exhaustively unit-tested; the UI in
 * `prom_query_builder.tsx` is a thin shell over these functions.
 *
 * The builder assembles a Prometheus alerting `expr` in four stacked layers:
 *
 *   1. Series selector  — `metric` or `metric{label OP "value"}`
 *   2. Function (optional) — a range/over-time function applied over a window:
 *        rate / increase / delta, or the reduce family avg|min|max|sum|count|
 *        last `_over_time`. Emitted as `<fn>(<selector>[<window>])`.
 *   3. Aggregate (optional) — an aggregation operator across series:
 *        sum / avg / min / max / count, with optional `by (…)` / `without (…)`
 *        grouping. Emitted as `<op>[ by|without (labels)](<inner>)`.
 *   4. Condition — a comparison that makes the expr return samples ONLY when
 *        the alert should fire: IS ABOVE `>`, ABOVE-OR-EQUAL `>=`, BELOW `<`,
 *        BELOW-OR-EQUAL `<=`, EQUAL `==`, NOT EQUAL `!=`, and the range forms
 *        OUTSIDE RANGE → `(<inner> < a or <inner> > b)`
 *        WITHIN RANGE  → `(<inner> >= a and <inner> <= b)`
 *
 * `buildExpr` composes the layers inside-out; `parseExpr` peels them back off in
 * reverse so switching Builder↔Code (or editing then re-opening) is lossless for
 * any expression the builder itself could have produced (e.g.
 * `sum(rate(metric[4m])) > 6`). Anything more complex parses to `null`, leaving
 * the builder inert so a hand-written Code expression is never rewritten.
 */

/** Range / over-time function applied to the selector over a window. */
export type RangeFn =
  | 'none'
  | 'rate'
  | 'increase'
  | 'delta'
  | 'avg_over_time'
  | 'min_over_time'
  | 'max_over_time'
  | 'sum_over_time'
  | 'count_over_time'
  | 'last_over_time';

/** Aggregation operator across matching series. */
export type AggOp = 'none' | 'sum' | 'avg' | 'min' | 'max' | 'count';

/** Grouping modifier for the aggregation. */
export type AggGrouping = 'none' | 'by' | 'without';

export type ConditionOp =
  'none' | 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq' | 'outside' | 'within';

export interface ConditionBuilderState {
  /** Metric name — the only required field; empty means "no query yet". */
  metric: string;
  /** Optional single label matcher. */
  labelName?: string;
  /** Label match operator: `=`, `!=`, `=~`, `!~`. */
  labelOperator?: string;
  labelValue?: string;
  /** Range/over-time function; `none` = raw instant selector. */
  func: RangeFn;
  /** Window for the function, e.g. `5m`. Ignored when `func === 'none'`. */
  window: string;
  /** Aggregation operator across series; `none` = no aggregation. */
  aggOp: AggOp;
  /** Grouping modifier; only meaningful when `aggOp !== 'none'`. */
  aggGrouping: AggGrouping;
  /** Labels for `by`/`without`; only meaningful when grouping is set. */
  aggLabels: string[];
  /** Alert condition; `none` = no comparison (an always-firing selector). */
  conditionOp: ConditionOp;
  /** Primary threshold (comparison RHS, or the LOW bound of a range). */
  thresholdA?: number;
  /** HIGH bound — only used by the `outside` / `within` range operators. */
  thresholdB?: number;
}

export const DEFAULT_WINDOW = '5m';

/** Functions that emit `<fn>(<selector>[<window>])` — every non-`none` RangeFn. */
const RANGE_FNS: ReadonlyArray<Exclude<RangeFn, 'none'>> = [
  'rate',
  'increase',
  'delta',
  'avg_over_time',
  'min_over_time',
  'max_over_time',
  'sum_over_time',
  'count_over_time',
  'last_over_time',
];

const AGG_OPS: ReadonlyArray<Exclude<AggOp, 'none'>> = ['sum', 'avg', 'min', 'max', 'count'];

/** Single-comparison operator → PromQL symbol. */
const SIMPLE_OP_TO_SYMBOL: Record<
  Extract<ConditionOp, 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq'>,
  string
> = {
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  eq: '==',
  neq: '!=',
};

const SYMBOL_TO_SIMPLE_OP: Record<string, ConditionOp> = {
  '>': 'gt',
  '>=': 'gte',
  '<': 'lt',
  '<=': 'lte',
  '==': 'eq',
  '!=': 'neq',
};

/** True for the two-bound range operators. */
export function isRangeOp(op: ConditionOp): boolean {
  return op === 'outside' || op === 'within';
}

/** Render a number for embedding in PromQL (no locale separators, no `NaN`). */
function num(n: number | undefined): string {
  return Number.isFinite(n as number) ? String(n) : '0';
}

/** Escape a label value for a PromQL double-quoted string literal. */
function escapeLabelValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function unescapeLabelValue(value: string): string {
  return value.replace(/\\(["\\])/g, '$1');
}

/** Layer 1 — the bare series selector. Empty metric → empty string. */
function buildSelector(state: ConditionBuilderState): string {
  const metric = (state.metric || '').trim();
  if (!metric) return '';
  if (state.labelName && state.labelValue !== undefined && state.labelValue !== '') {
    const op = state.labelOperator || '=';
    return `${metric}{${state.labelName}${op}"${escapeLabelValue(state.labelValue)}"}`;
  }
  return metric;
}

/**
 * Compose the full PromQL expression from builder state. Returns `''` until a
 * metric is chosen (nothing to preview / save yet).
 */
export function buildExpr(state: ConditionBuilderState): string {
  const selector = buildSelector(state);
  if (!selector) return '';

  // Layer 2 — range / over-time function.
  let inner = selector;
  if (state.func !== 'none') {
    const window = (state.window || DEFAULT_WINDOW).trim() || DEFAULT_WINDOW;
    inner = `${state.func}(${selector}[${window}])`;
  }

  // Layer 3 — aggregation across series. With grouping we emit the canonical
  // `op by (labels) (inner)` (space before the inner group); without grouping,
  // `op(inner)`.
  if (state.aggOp !== 'none') {
    const labels = (state.aggLabels || []).map((l) => l.trim()).filter(Boolean);
    inner =
      state.aggGrouping !== 'none' && labels.length > 0
        ? `${state.aggOp} ${state.aggGrouping} (${labels.join(', ')}) (${inner})`
        : `${state.aggOp}(${inner})`;
  }

  // Layer 4 — condition. A chosen operator whose threshold(s) are still blank is
  // treated as "no condition yet": we return the pre-condition expression rather
  // than emitting a surprise `… > 0` the user never typed (which would otherwise
  // save as a real threshold). The always-firing warning then correctly nudges
  // them to enter a value.
  const a = state.thresholdA;
  const b = state.thresholdB;
  switch (state.conditionOp) {
    case 'none':
      return inner;
    case 'outside':
      return Number.isFinite(a as number) && Number.isFinite(b as number)
        ? `(${inner} < ${num(a)} or ${inner} > ${num(b)})`
        : inner;
    case 'within':
      return Number.isFinite(a as number) && Number.isFinite(b as number)
        ? `(${inner} >= ${num(a)} and ${inner} <= ${num(b)})`
        : inner;
    default:
      return Number.isFinite(a as number)
        ? `${inner} ${SIMPLE_OP_TO_SYMBOL[state.conditionOp]} ${num(a)}`
        : inner;
  }
}

const NUMBER = String.raw`-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?`;
const SELECTOR_RE = new RegExp(
  String.raw`^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*(=~|!~|!=|=)\s*"((?:[^"\\]|\\.)*)"\s*\})?$`
);
const RANGE_FN_RE = new RegExp(
  String.raw`^(${RANGE_FNS.join('|')})\(\s*(.+?)\s*\[\s*(\d+[smhdwy])\s*\]\s*\)$`
);
// `<op>[ by|without (labels)] (<inner>)`
const AGG_RE = new RegExp(
  String.raw`^(${AGG_OPS.join('|')})(?:\s+(by|without)\s*\(([^)]*)\))?\s*\(\s*(.+?)\s*\)$`
);
const SIMPLE_CMP_RE = new RegExp(String.raw`^(.+?)\s*(>=|<=|==|!=|>|<)\s*(${NUMBER})$`);
const OUTSIDE_RE = new RegExp(
  String.raw`^\(\s*(.+?)\s*<\s*(${NUMBER})\s+or\s+(.+?)\s*>\s*(${NUMBER})\s*\)$`
);
const WITHIN_RE = new RegExp(
  String.raw`^\(\s*(.+?)\s*>=\s*(${NUMBER})\s+and\s+(.+?)\s*<=\s*(${NUMBER})\s*\)$`
);

/** Parse a bare selector (`metric` / `metric{l OP "v"}`) into partial state. */
function parseSelector(
  selector: string
): Pick<ConditionBuilderState, 'metric' | 'labelName' | 'labelOperator' | 'labelValue'> | null {
  const m = selector.trim().match(SELECTOR_RE);
  if (!m) return null;
  const [, metric, labelName, labelOperator, escaped] = m;
  if (!labelName) return { metric };
  return { metric, labelName, labelOperator, labelValue: unescapeLabelValue(escaped) };
}

/**
 * Inverse of {@link buildExpr}. Returns fully-populated builder state for any
 * expression the builder could have emitted, or `null` for anything else (so
 * the caller leaves the builder inert rather than clobbering a Code expression).
 */
export function parseExpr(query: string): ConditionBuilderState | null {
  const q = (query || '').trim();
  if (!q) return null;

  let conditionOp: ConditionOp = 'none';
  let thresholdA: number | undefined;
  let thresholdB: number | undefined;
  let inner = q;

  // Layer 4 — range forms first (they wrap in parens), then a simple comparison.
  const outside = q.match(OUTSIDE_RE);
  const within = q.match(WITHIN_RE);
  if (outside && outside[1].trim() === outside[3].trim()) {
    conditionOp = 'outside';
    inner = outside[1].trim();
    thresholdA = Number(outside[2]);
    thresholdB = Number(outside[4]);
  } else if (within && within[1].trim() === within[3].trim()) {
    conditionOp = 'within';
    inner = within[1].trim();
    thresholdA = Number(within[2]);
    thresholdB = Number(within[4]);
  } else {
    const cmp = q.match(SIMPLE_CMP_RE);
    if (cmp) {
      conditionOp = SYMBOL_TO_SIMPLE_OP[cmp[2]];
      inner = cmp[1].trim();
      thresholdA = Number(cmp[3]);
    }
  }

  // Layer 3 — aggregation.
  let aggOp: AggOp = 'none';
  let aggGrouping: AggGrouping = 'none';
  let aggLabels: string[] = [];
  const agg = inner.match(AGG_RE);
  if (agg) {
    aggOp = agg[1] as AggOp;
    if (agg[2]) {
      aggGrouping = agg[2] as AggGrouping;
      aggLabels = agg[3]
        .split(',')
        .map((l) => l.trim())
        .filter(Boolean);
    }
    inner = agg[4].trim();
  }

  // Layer 2 — range / over-time function.
  let func: RangeFn = 'none';
  let window = DEFAULT_WINDOW;
  const fn = inner.match(RANGE_FN_RE);
  if (fn) {
    func = fn[1] as RangeFn;
    inner = fn[2].trim();
    window = fn[3];
  }

  // Layer 1 — selector.
  const parsedSelector = parseSelector(inner);
  if (!parsedSelector) return null;

  return {
    ...parsedSelector,
    func,
    window,
    aggOp,
    aggGrouping,
    aggLabels,
    conditionOp,
    thresholdA,
    thresholdB,
  };
}

/**
 * Heuristic used to warn about an always-firing rule: true when the expression
 * carries no top-level comparison, so it returns samples whenever the series
 * merely exists. Conservative by design — it strips label matchers and quoted
 * strings first, so a real threshold (`… > 5`) is never flagged; only a bare
 * selector (or function/aggregation with no comparison) trips it. Empty input is
 * NOT always-firing (there's simply nothing yet).
 */
export function isAlwaysFiring(query: string): boolean {
  const q = (query || '').trim();
  if (!q) return false;
  const stripped = q
    // Strip quoted strings FIRST: a label value may contain a `}` (e.g.
    // `metric{path="a}b"}`), which would otherwise make the label-matcher
    // strip below stop early and leak a stray `>`/`<` from inside the value.
    .replace(/"(?:[^"\\]|\\.)*"/g, '') // quoted strings (label values)
    .replace(/\{[^}]*\}/g, ''); // then label matchers
  return !/(>=|<=|==|!=|>|<)/.test(stripped);
}

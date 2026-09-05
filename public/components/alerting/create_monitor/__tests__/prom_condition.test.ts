/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  buildExpr,
  ConditionBuilderState,
  DEFAULT_WINDOW,
  isAlwaysFiring,
  isRangeOp,
  parseExpr,
} from '../prom_condition';

const state = (over: Partial<ConditionBuilderState> = {}): ConditionBuilderState => ({
  metric: 'cpu_usage',
  func: 'none',
  window: DEFAULT_WINDOW,
  aggOp: 'none',
  aggGrouping: 'none',
  aggLabels: [],
  conditionOp: 'none',
  ...over,
});

describe('buildExpr', () => {
  it('returns empty string until a metric is chosen', () => {
    expect(buildExpr(state({ metric: '' }))).toBe('');
    expect(buildExpr(state({ metric: '   ' }))).toBe('');
  });

  it('builds a bare selector', () => {
    expect(buildExpr(state())).toBe('cpu_usage');
  });

  it('omits the comparison when a chosen operator has no threshold yet', () => {
    // A chosen operator with a blank/NaN threshold must NOT emit a surprise
    // `… > 0`; it yields the pre-condition expression (still valid, and the
    // always-firing warning then nudges the user to enter a value).
    expect(buildExpr(state({ conditionOp: 'gt' }))).toBe('cpu_usage');
    expect(buildExpr(state({ func: 'rate', window: '5m', aggOp: 'sum', conditionOp: 'gt' }))).toBe(
      'sum(rate(cpu_usage[5m]))'
    );
    // Range ops need BOTH bounds; a missing bound also falls back to no condition.
    expect(buildExpr(state({ conditionOp: 'outside', thresholdA: 10 }))).toBe('cpu_usage');
    // With the threshold present, the comparison is emitted as usual.
    expect(buildExpr(state({ conditionOp: 'gt', thresholdA: 0 }))).toBe('cpu_usage > 0');
  });

  it('builds a labelled selector, escaping the value', () => {
    expect(buildExpr(state({ labelName: 'host', labelOperator: '=', labelValue: 'web"1' }))).toBe(
      'cpu_usage{host="web\\"1"}'
    );
  });

  it('wraps in an over-time function over the window', () => {
    expect(buildExpr(state({ func: 'avg_over_time', window: '10m' }))).toBe(
      'avg_over_time(cpu_usage[10m])'
    );
  });

  it('wraps in a rate function', () => {
    expect(buildExpr(state({ func: 'rate', window: '4m' }))).toBe('rate(cpu_usage[4m])');
  });

  it('applies a plain aggregation across series', () => {
    expect(buildExpr(state({ aggOp: 'sum' }))).toBe('sum(cpu_usage)');
  });

  it('applies an aggregation with by-grouping', () => {
    expect(
      buildExpr(state({ aggOp: 'sum', aggGrouping: 'by', aggLabels: ['job', 'instance'] }))
    ).toBe('sum by (job, instance) (cpu_usage)');
  });

  it('applies an aggregation with without-grouping', () => {
    expect(buildExpr(state({ aggOp: 'avg', aggGrouping: 'without', aggLabels: ['pod'] }))).toBe(
      'avg without (pod) (cpu_usage)'
    );
  });

  it('drops grouping when no labels are given', () => {
    expect(buildExpr(state({ aggOp: 'sum', aggGrouping: 'by', aggLabels: [] }))).toBe(
      'sum(cpu_usage)'
    );
  });

  it('stacks aggregation over a function (the sum(rate(...)) shape)', () => {
    expect(buildExpr(state({ func: 'rate', window: '4m', aggOp: 'sum' }))).toBe(
      'sum(rate(cpu_usage[4m]))'
    );
  });

  it('builds the full sum(rate(...)) > N expression from the question', () => {
    expect(
      buildExpr(
        state({
          metric: 'gen_ai_client_token_usage_total',
          func: 'rate',
          window: '4m',
          aggOp: 'sum',
          conditionOp: 'gt',
          thresholdA: 6,
        })
      )
    ).toBe('sum(rate(gen_ai_client_token_usage_total[4m])) > 6');
  });

  it.each([
    ['gt', 'cpu_usage > 0.5'],
    ['gte', 'cpu_usage >= 0.5'],
    ['lt', 'cpu_usage < 0.5'],
    ['lte', 'cpu_usage <= 0.5'],
    ['eq', 'cpu_usage == 0.5'],
    ['neq', 'cpu_usage != 0.5'],
  ] as const)('applies the %s comparison', (op, expected) => {
    expect(buildExpr(state({ conditionOp: op, thresholdA: 0.5 }))).toBe(expected);
  });

  it('builds an OUTSIDE RANGE condition', () => {
    expect(buildExpr(state({ conditionOp: 'outside', thresholdA: 10, thresholdB: 90 }))).toBe(
      '(cpu_usage < 10 or cpu_usage > 90)'
    );
  });

  it('builds a WITHIN RANGE condition', () => {
    expect(buildExpr(state({ conditionOp: 'within', thresholdA: 10, thresholdB: 90 }))).toBe(
      '(cpu_usage >= 10 and cpu_usage <= 90)'
    );
  });

  it('never emits NaN for a threshold', () => {
    // A finite threshold renders normally; a missing one drops the comparison
    // entirely (see "omits the comparison when a chosen operator has no threshold
    // yet") rather than emitting `NaN` or a surprise `> 0`.
    expect(buildExpr(state({ conditionOp: 'gt', thresholdA: 0 }))).toBe('cpu_usage > 0');
    expect(buildExpr(state({ conditionOp: 'gt' }))).not.toContain('NaN');
  });
});

describe('parseExpr round-trips buildExpr', () => {
  const cases: ConditionBuilderState[] = [
    state(),
    state({ labelName: 'host', labelOperator: '=', labelValue: 'web-1' }),
    state({ labelName: 'host', labelOperator: '=~', labelValue: 'web.*' }),
    state({ labelName: 'host', labelOperator: '!=', labelValue: 'web-1' }),
    state({ labelName: 'host', labelOperator: '!~', labelValue: 'web.*' }),
    state({ func: 'avg_over_time', window: '10m' }),
    state({ func: 'min_over_time', window: '3m' }),
    state({ func: 'max_over_time', window: '3m' }),
    state({ func: 'sum_over_time', window: '3m' }),
    state({ func: 'count_over_time', window: '3m' }),
    state({ func: 'last_over_time', window: '3m' }),
    state({ func: 'rate', window: '4m' }),
    state({ func: 'increase', window: '1h' }),
    state({ func: 'delta', window: '30m' }),
    // Day / week / year windows (parseable per RANGE_FN_RE + selectable in the UI).
    state({ func: 'rate', window: '2d' }),
    state({ func: 'increase', window: '1w' }),
    state({ func: 'delta', window: '1y' }),
    state({ aggOp: 'sum' }),
    state({ aggOp: 'min' }),
    state({ aggOp: 'max' }),
    state({ aggOp: 'count' }),
    // `count` aggregation vs the `count_over_time` function must stay distinct.
    state({ func: 'count_over_time', window: '5m', aggOp: 'count' }),
    state({ aggOp: 'sum', aggGrouping: 'by', aggLabels: ['job', 'instance'] }),
    state({ aggOp: 'avg', aggGrouping: 'without', aggLabels: ['pod'] }),
    state({ conditionOp: 'gte', thresholdA: 1000 }),
    state({ conditionOp: 'lt', thresholdA: 0 }),
    state({ func: 'rate', window: '4m', aggOp: 'sum', conditionOp: 'gt', thresholdA: 6 }),
    state({ conditionOp: 'gt', thresholdA: 0.5 }),
    state({ conditionOp: 'lte', thresholdA: -3.5 }),
    state({ conditionOp: 'outside', thresholdA: 10, thresholdB: 90 }),
    state({ conditionOp: 'within', thresholdA: 10, thresholdB: 90 }),
    state({
      metric: 'http_requests_total',
      labelName: 'job',
      labelOperator: '=',
      labelValue: 'api',
      func: 'rate',
      window: '5m',
      aggOp: 'sum',
      aggGrouping: 'by',
      aggLabels: ['code'],
      conditionOp: 'gte',
      thresholdA: 100,
    }),
  ];

  it.each(cases)('round-trips %#', (s) => {
    const expr = buildExpr(s);
    const parsed = parseExpr(expr);
    expect(parsed).not.toBeNull();
    // Re-building from the parsed state yields the identical expression.
    expect(buildExpr(parsed!)).toBe(expr);
    // Stronger: the parsed state deep-equals the original (canonical) state, so a
    // parser that mangled a field in a way that happened to re-serialize the same
    // is still caught. (Undefined threshold keys are ignored by toEqual.)
    expect(parsed).toEqual(s);
  });
});

describe('parseExpr', () => {
  it('returns null for an empty query', () => {
    expect(parseExpr('')).toBeNull();
    expect(parseExpr('   ')).toBeNull();
  });

  it('parses the sum(rate(...)) > N expression from the question', () => {
    expect(parseExpr('sum(rate(gen_ai_client_token_usage_total[4m])) > 6')).toMatchObject({
      metric: 'gen_ai_client_token_usage_total',
      func: 'rate',
      window: '4m',
      aggOp: 'sum',
      conditionOp: 'gt',
      thresholdA: 6,
    });
  });

  it('parses a scientific-notation threshold', () => {
    expect(parseExpr('http_errors > 1e3')).toMatchObject({
      metric: 'http_errors',
      conditionOp: 'gt',
      thresholdA: 1000,
    });
  });

  it('parses an aggregation with by-grouping', () => {
    expect(parseExpr('sum by (job, instance) (rate(cpu_usage[4m]))')).toMatchObject({
      metric: 'cpu_usage',
      func: 'rate',
      aggOp: 'sum',
      aggGrouping: 'by',
      aggLabels: ['job', 'instance'],
    });
  });

  it('returns null for an expression the builder cannot represent', () => {
    // Nested aggregation the builder does not model.
    expect(parseExpr('sum(sum(cpu_usage))')).toBeNull();
    expect(parseExpr('histogram_quantile(0.9, rate(x[5m]))')).toBeNull();
    expect(parseExpr('cpu_usage{a="1",b="2"}')).toBeNull(); // multiple matchers
  });

  it('does not confuse a range form for a simple comparison', () => {
    expect(parseExpr('(cpu_usage < 10 or cpu_usage > 90)')).toMatchObject({
      conditionOp: 'outside',
      thresholdA: 10,
      thresholdB: 90,
    });
  });

  it('rejects a range whose two inner expressions differ', () => {
    expect(parseExpr('(cpu_usage < 10 or mem_usage > 90)')).toBeNull();
  });
});

describe('isAlwaysFiring', () => {
  it('is false for empty input (nothing yet, not a footgun)', () => {
    expect(isAlwaysFiring('')).toBe(false);
  });

  it('is true for a condition-less expression', () => {
    expect(isAlwaysFiring('up')).toBe(true);
    expect(isAlwaysFiring('cpu_usage{host="web-1"}')).toBe(true);
    expect(isAlwaysFiring('sum(rate(cpu_usage[5m]))')).toBe(true);
  });

  it('is false once a comparison is present', () => {
    expect(isAlwaysFiring('up == 0')).toBe(false);
    expect(isAlwaysFiring('sum(rate(cpu_usage[4m])) > 6')).toBe(false);
    expect(isAlwaysFiring('(cpu_usage < 10 or cpu_usage > 90)')).toBe(false);
  });

  it('is not fooled by a comparison-like character inside a label value', () => {
    expect(isAlwaysFiring('cpu_usage{path="/a>b"}')).toBe(true);
  });

  it('is not fooled by a closing brace AND a comparison char inside a label value', () => {
    // The label value contains `}` which used to end the label-matcher strip
    // early, leaking the `>` and wrongly reporting a comparison. Bare selector →
    // still always-firing.
    expect(isAlwaysFiring('cpu_usage{path="a}>b"}')).toBe(true);
    // A genuine comparison alongside a `}`-bearing value is still detected.
    expect(isAlwaysFiring('cpu_usage{path="a}b"} > 5')).toBe(false);
  });
});

describe('isRangeOp', () => {
  it('is true only for range operators', () => {
    expect(isRangeOp('outside')).toBe(true);
    expect(isRangeOp('within')).toBe(true);
    expect(isRangeOp('gt')).toBe(false);
    expect(isRangeOp('none')).toBe(false);
  });
});

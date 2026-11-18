/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { signalExpressions, splitTopLevelAnd, stripTrailingComparison } from '../promql_signal';

describe('splitTopLevelAnd', () => {
  it('returns the expression alone when it has no top-level and', () => {
    expect(splitTopLevelAnd('rate(errors[5m]) > 0.1')).toEqual(['rate(errors[5m]) > 0.1']);
  });
  it('splits multi-window conditions on top-level and', () => {
    expect(
      splitTopLevelAnd('a:ratio_rate_5m{slo_id="s"} > 14.4 and a:ratio_rate_1h{slo_id="s"} > 14.4')
    ).toEqual(['a:ratio_rate_5m{slo_id="s"} > 14.4', 'a:ratio_rate_1h{slo_id="s"} > 14.4']);
  });
  it('ignores and inside parentheses, braces and strings', () => {
    expect(splitTopLevelAnd('sum(a and b) > 1')).toEqual(['sum(a and b) > 1']);
    expect(splitTopLevelAnd('x{job="this and that"} > 1')).toEqual(['x{job="this and that"} > 1']);
    expect(splitTopLevelAnd('brand_total > 1')).toEqual(['brand_total > 1']);
  });
  it('drops an on()/ignoring() matching modifier from the right side', () => {
    expect(splitTopLevelAnd('a > 1 and on(job) b > 2')).toEqual(['a > 1', 'b > 2']);
    expect(splitTopLevelAnd('a > 1 and ignoring (pod) b > 2')).toEqual(['a > 1', 'b > 2']);
  });
});

describe('signalExpressions', () => {
  it('strips the threshold of a single condition', () => {
    expect(signalExpressions('rate(errors[5m]) > 0.1')).toEqual(['rate(errors[5m])']);
  });
  it('returns one stripped series per and side', () => {
    expect(signalExpressions('a_5m > 14.4 and a_1h > 14.4')).toEqual(['a_5m', 'a_1h']);
  });
  it('keeps the whole expression when a side cannot be reduced to a series', () => {
    expect(signalExpressions('a > 1 and b')).toEqual(['a > 1 and b']);
    expect(signalExpressions('a > 1 and b > 2 or c > 3')).toEqual(['a > 1 and b > 2 or c > 3']);
  });
  it('returns nothing for an empty expression', () => {
    expect(signalExpressions('  ')).toEqual([]);
  });
  it('keeps stripTrailingComparison behaviour', () => {
    expect(stripTrailingComparison('a > 1 and b > 2')).toBe('a > 1 and b > 2');
    expect(stripTrailingComparison('up == 0')).toBe('up');
  });
});

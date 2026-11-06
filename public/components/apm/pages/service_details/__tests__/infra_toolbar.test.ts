/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { applyLabelFilters, matchesLabelFilter } from '../infra_toolbar';

describe('applyLabelFilters', () => {
  it('adds the matchers to every selector, including __name__ selectors', () => {
    const q =
      'sum by (p) (a{ns="x"}) or label_replace(max(b{ns="x",p=~"a|b"}), "p", "limit", "", "")' +
      ' or max by (p) ({__name__=~"k8s_pod_phase_?",ns="x"})';
    expect(applyLabelFilters(q, [{ name: 'node', operator: '=', value: 'n1' }])).toBe(
      'sum by (p) (a{node="n1",ns="x"}) or label_replace(max(b{node="n1",ns="x",p=~"a|b"}), "p", "limit", "", "")' +
        ' or max by (p) ({node="n1",__name__=~"k8s_pod_phase_?",ns="x"})'
    );
  });

  it('leaves the query alone without filters and escapes values', () => {
    expect(applyLabelFilters('a{x="1"}', [])).toBe('a{x="1"}');
    expect(applyLabelFilters('a{x="1"}', [{ name: 'p', operator: '!=', value: 'q"r' }])).toBe(
      'a{p!="q\\"r",x="1"}'
    );
  });
});

describe('matchesLabelFilter', () => {
  it('matches equality and anchored regexes like PromQL', () => {
    expect(matchesLabelFilter('pod-a', { name: 'p', operator: '=', value: 'pod-a' })).toBe(true);
    expect(matchesLabelFilter('pod-a', { name: 'p', operator: '!=', value: 'pod-a' })).toBe(false);
    expect(matchesLabelFilter('pod-ab', { name: 'p', operator: '=~', value: 'pod-a' })).toBe(false);
    expect(matchesLabelFilter('pod-ab', { name: 'p', operator: '=~', value: 'pod-a.*' })).toBe(
      true
    );
    expect(matchesLabelFilter('pod-ab', { name: 'p', operator: '!~', value: 'pod-a.*' })).toBe(
      false
    );
    expect(matchesLabelFilter('x', { name: 'p', operator: '=~', value: '(' })).toBe(true);
  });
});

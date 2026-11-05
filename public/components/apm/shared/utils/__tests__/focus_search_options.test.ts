/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { filterFocusOptions } from '../focus_search_options';

const opt = (label: string, env: string) => ({
  label,
  value: `${env}/${label}`,
  key: `${env}/${label}`,
});
const groups = [
  { label: 'env-00', options: [opt('load-svc-0120', 'env-00'), opt('cart', 'env-00')] },
  { label: 'env-05', options: [opt('svc-0123', 'env-05'), opt('svc-012', 'env-05')] },
  { label: 'generic:default', options: [opt('email', 'generic:default')] },
];

describe('filterFocusOptions', () => {
  it('lists everything without a search', () => {
    expect(filterFocusOptions(groups, '  ')).toBe(groups);
  });

  it('keeps each match under its environment and drops environments without one', () => {
    expect(filterFocusOptions(groups, 'emai')).toEqual([
      { label: 'generic:default', options: [opt('email', 'generic:default')] },
    ]);
  });

  it('puts the best matches first, within and across environments', () => {
    const result = filterFocusOptions(groups, 'SVC-012');
    expect(result.map((g) => g.label)).toEqual(['env-05', 'env-00']);
    expect(result[0].options.map((o) => o.label)).toEqual(['svc-012', 'svc-0123']);
    expect(result[1].options.map((o) => o.label)).toEqual(['load-svc-0120']);
  });
});

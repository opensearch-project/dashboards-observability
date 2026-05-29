/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { matchesSearch } from '../monitors_table_filters';
import type { UnifiedRuleSummary } from '../../../../../common/types/alerting';

function rule(over: Partial<UnifiedRuleSummary> = {}): UnifiedRuleSummary {
  return ({
    id: 'rule-id-1',
    datasourceId: 'ds-1',
    datasourceType: 'opensearch',
    name: 'My Monitor',
    enabled: true,
    severity: 'medium',
    query: '',
    condition: '',
    labels: {},
    annotations: {},
    monitorType: 'ppl',
    status: 'active',
    healthStatus: 'healthy',
    createdBy: 'system',
    createdAt: '',
    lastModified: '',
    ...over,
  } as unknown) as UnifiedRuleSummary;
}

describe('matchesSearch', () => {
  it('matches by free-text against the rule name', () => {
    expect(matchesSearch(rule({ name: 'My Monitor' }), 'monitor')).toBe(true);
    expect(matchesSearch(rule({ name: 'My Monitor' }), 'other')).toBe(false);
  });

  it('matches `label:value` against rule.labels', () => {
    expect(matchesSearch(rule({ labels: { team: 'infra' } }), 'team:infra')).toBe(true);
    expect(matchesSearch(rule({ labels: { team: 'infra' } }), 'team:platform')).toBe(false);
  });

  it('matches `monitor_id:<id>` against `rule.id` (BUG-14 deep-link)', () => {
    // Alerts only carry `monitor_id` in labels; the rule itself doesn't
    // have a `monitor_id` label — its stable handle is `rule.id`.
    expect(
      matchesSearch(rule({ id: '197fa54B-r6EicsgSghN' }), 'monitor_id:197fa54B-r6EicsgSghN')
    ).toBe(true);
    expect(matchesSearch(rule({ id: '197fa54B-r6EicsgSghN' }), 'monitor_id:other-id')).toBe(false);
  });

  it('label:value still wins when the value also appears in another field', () => {
    // Without a label match, `monitor_id:foo` must NOT fall back to
    // matching `foo` against name/labels via the legacy free-text path.
    expect(matchesSearch(rule({ id: 'rule-id-1', name: 'foo monitor' }), 'monitor_id:foo')).toBe(
      false
    );
  });
});

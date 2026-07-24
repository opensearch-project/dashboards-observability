/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for Prometheus rule mutation handlers:
 *   - buildRuleGroup: the query alone is the alert expression (legacy
 *     operator/threshold still appended when provided)
 *   - handleCreatePrometheusRule: merges into existing shared groups
 *     instead of replacing them
 *   - handleDeletePrometheusRule: splices a single rule out of a shared
 *     group, deleting the group only when it becomes empty
 */
import {
  buildRuleGroup,
  handleCreatePrometheusRule,
  handleDeletePrometheusRule,
  PrometheusRulePayload,
  USER_RULES_NAMESPACE,
} from '../mutations/prometheus_handlers';
import type { GeneratedRuleGroup } from '../../../../common/slo/slo_types';

const basePayload: PrometheusRulePayload = {
  name: 'HighErrorRate',
  query: 'sum(rate(http_requests_total{status_code=~"5.."}[5m])) > 0.05',
  forDuration: '5m',
  evaluationInterval: '1m',
  labels: { severity: 'critical' },
  annotations: { summary: 'Error rate is high' },
  enabled: true,
};

const mockClient = {} as any;
const mockDatasource = { id: 'ds-1', name: 'test-prom' } as any;

const makeRulerClient = (existingGroup: GeneratedRuleGroup | null = null) => ({
  upsertRuleGroup: jest.fn().mockResolvedValue(undefined),
  deleteRuleGroup: jest.fn().mockResolvedValue(undefined),
  getRuleGroup: jest.fn().mockResolvedValue(existingGroup),
  listRuleGroups: jest.fn().mockResolvedValue([]),
});

describe('buildRuleGroup', () => {
  it('uses the query as the complete alert expression', () => {
    const group = buildRuleGroup(basePayload);
    expect(group.rules).toHaveLength(1);
    expect(group.rules[0].expr).toBe(basePayload.query);
    expect(group.rules[0].for).toBe('5m');
  });

  it('appends legacy operator/threshold when both are provided', () => {
    const group = buildRuleGroup({
      ...basePayload,
      query: 'up',
      operator: '==',
      threshold: 0,
    });
    expect(group.rules[0].expr).toBe('up == 0');
  });

  it('defaults groupName to the rule name and honors overrides', () => {
    expect(buildRuleGroup(basePayload).groupName).toBe('HighErrorRate');
    expect(buildRuleGroup({ ...basePayload, groupName: 'my-team-rules' }).groupName).toBe(
      'my-team-rules'
    );
  });
});

describe('handleCreatePrometheusRule — shared group merge', () => {
  it('creates a new group when none exists', async () => {
    const ruler = makeRulerClient(null);
    const result = await handleCreatePrometheusRule(ruler as any, mockClient, mockDatasource, {
      ...basePayload,
      groupName: 'team-rules',
    });

    expect(result).toEqual({
      success: true,
      groupName: 'team-rules',
      namespace: USER_RULES_NAMESPACE,
    });
    const upserted = ruler.upsertRuleGroup.mock.calls[0][3] as GeneratedRuleGroup;
    expect(upserted.rules).toHaveLength(1);
    expect(upserted.rules[0].name).toBe('HighErrorRate');
  });

  it('preserves sibling rules when adding to an existing group', async () => {
    const ruler = makeRulerClient({
      groupName: 'team-rules',
      interval: 60,
      rules: [{ type: 'alerting', name: 'ExistingRule', expr: 'up == 0', for: '1m' } as any],
    });
    await handleCreatePrometheusRule(ruler as any, mockClient, mockDatasource, {
      ...basePayload,
      groupName: 'team-rules',
    });

    const upserted = ruler.upsertRuleGroup.mock.calls[0][3] as GeneratedRuleGroup;
    expect(upserted.rules.map((r) => r.name)).toEqual(['ExistingRule', 'HighErrorRate']);
  });

  it('replaces a same-named rule instead of duplicating it (edit upsert)', async () => {
    const ruler = makeRulerClient({
      groupName: 'team-rules',
      interval: 60,
      rules: [
        { type: 'alerting', name: 'HighErrorRate', expr: 'old_expr', for: '1m' } as any,
        { type: 'alerting', name: 'OtherRule', expr: 'up == 0', for: '1m' } as any,
      ],
    });
    await handleCreatePrometheusRule(ruler as any, mockClient, mockDatasource, {
      ...basePayload,
      groupName: 'team-rules',
    });

    const upserted = ruler.upsertRuleGroup.mock.calls[0][3] as GeneratedRuleGroup;
    expect(upserted.rules).toHaveLength(2);
    expect(upserted.rules.map((r) => r.name).sort()).toEqual(['HighErrorRate', 'OtherRule']);
    const updated = upserted.rules.find((r) => r.name === 'HighErrorRate');
    expect(updated?.expr).toBe(basePayload.query);
  });
});

describe('handleDeletePrometheusRule — per-rule splice', () => {
  it('splices a single rule out of a shared group', async () => {
    const ruler = makeRulerClient({
      groupName: 'team-rules',
      interval: 60,
      rules: [
        { type: 'alerting', name: 'RuleA', expr: 'up == 0', for: '1m' } as any,
        { type: 'alerting', name: 'RuleB', expr: 'up == 1', for: '1m' } as any,
      ],
    });
    await handleDeletePrometheusRule(
      ruler as any,
      mockClient,
      mockDatasource,
      'team-rules',
      undefined,
      'RuleA'
    );

    expect(ruler.deleteRuleGroup).not.toHaveBeenCalled();
    const upserted = ruler.upsertRuleGroup.mock.calls[0][3] as GeneratedRuleGroup;
    expect(upserted.rules.map((r) => r.name)).toEqual(['RuleB']);
  });

  it('deletes the whole group when removing its last rule', async () => {
    const ruler = makeRulerClient({
      groupName: 'team-rules',
      interval: 60,
      rules: [{ type: 'alerting', name: 'OnlyRule', expr: 'up == 0', for: '1m' } as any],
    });
    await handleDeletePrometheusRule(
      ruler as any,
      mockClient,
      mockDatasource,
      'team-rules',
      undefined,
      'OnlyRule'
    );

    expect(ruler.upsertRuleGroup).not.toHaveBeenCalled();
    expect(ruler.deleteRuleGroup).toHaveBeenCalledWith(
      mockClient,
      mockDatasource,
      USER_RULES_NAMESPACE,
      'team-rules'
    );
  });

  it('deletes the whole group when no ruleName is provided', async () => {
    const ruler = makeRulerClient(null);
    await handleDeletePrometheusRule(ruler as any, mockClient, mockDatasource, 'team-rules');

    expect(ruler.getRuleGroup).not.toHaveBeenCalled();
    expect(ruler.deleteRuleGroup).toHaveBeenCalledWith(
      mockClient,
      mockDatasource,
      USER_RULES_NAMESPACE,
      'team-rules'
    );
  });
});

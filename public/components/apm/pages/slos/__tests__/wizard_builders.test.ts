/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SLO_TEMPLATES } from '../../../../../../common/slo/slo_templates';
import type { PrometheusSli, SingleSli } from '../../../../../../common/slo/slo_types';
import { initialState, reducer } from '../wizard_state';
import { buildCreateInput, parseKeyValueBlock } from '../wizard_builders';

// Small helper that narrows the SLI shape to the single+prometheus arm. Used
// across tests so we don't trip jest/no-conditional-expect by branching on
// discriminants inside each assertion.
function singlePromSli(
  sli: { type: string; definition?: { backend: string } } | SingleSli
): PrometheusSli {
  if (
    'type' in sli &&
    sli.type === 'single' &&
    'definition' in sli &&
    sli.definition &&
    sli.definition.backend === 'prometheus'
  ) {
    return sli.definition as PrometheusSli;
  }
  throw new Error(`expected single + prometheus SLI, got: ${JSON.stringify(sli)}`);
}

describe('wizard_builders', () => {
  const httpAvailability = SLO_TEMPLATES.find((t) => t.id === 'http-availability')!;
  const httpLatency = SLO_TEMPLATES.find((t) => t.id === 'http-latency')!;
  const custom = SLO_TEMPLATES.find((t) => t.id === 'custom')!;

  function baseState() {
    let s = initialState();
    s = reducer(s, { kind: 'setField', field: 'datasourceId', value: 'ds-2' });
    s = reducer(s, { kind: 'setField', field: 'name', value: 'slo-foo' });
    s = reducer(s, { kind: 'setField', field: 'service', value: 'foo' });
    s = reducer(s, { kind: 'setField', field: 'ownerTeam', value: 'sre' });
    s = reducer(s, {
      kind: 'setDimension',
      index: 0,
      dim: { name: 'service', value: 'foo' },
    });
    return s;
  }

  it('parses key=value blocks and drops malformed lines', () => {
    const out = parseKeyValueBlock(`compliance=pci\n=bad\n  region = us-west-2  \nempty=`);
    expect(out).toEqual({ compliance: 'pci', region: 'us-west-2', empty: '' });
  });

  it('emits every objective as its own entry with percent → decimal conversion', () => {
    let s = baseState();
    s = reducer(s, { kind: 'addObjective' });
    s = reducer(s, {
      kind: 'setObjectiveField',
      index: 1,
      field: 'name',
      value: 'availability-99',
    });
    s = reducer(s, {
      kind: 'setObjectiveField',
      index: 1,
      field: 'target',
      value: '99.0',
    });
    const input = buildCreateInput(s, httpAvailability);
    expect(input.spec.objectives).toHaveLength(2);
    expect(input.spec.objectives[0].target).toBeCloseTo(0.999, 5);
    expect(input.spec.objectives[1].name).toBe('availability-99');
    expect(input.spec.objectives[1].target).toBeCloseTo(0.99, 5);
  });

  it('attaches latencyThreshold only for latency_threshold templates', () => {
    const availInput = buildCreateInput(baseState(), httpAvailability);
    expect(availInput.spec.objectives[0].latencyThreshold).toBeUndefined();

    let s = reducer(baseState(), { kind: 'setTemplate', templateId: 'http-latency' });
    // applyTemplate wiped service — replay.
    s = reducer(s, { kind: 'setField', field: 'service', value: 'foo' });
    s = reducer(s, {
      kind: 'setDimension',
      index: 0,
      dim: { name: 'service', value: 'foo' },
    });
    const latInput = buildCreateInput(s, httpLatency);
    expect(latInput.spec.objectives[0].latencyThreshold).toBe(0.5);
    expect(latInput.spec.sli.type).toBe('single');
    expect(singlePromSli(latInput.spec.sli).latencyThresholdUnit).toBe('seconds');
  });

  it('builds a custom events-mode SLI from customPromql state', () => {
    let s = reducer(baseState(), { kind: 'setTemplate', templateId: 'custom' });
    s = reducer(s, {
      kind: 'setCustomPromql',
      patch: {
        mode: 'events',
        goodQuery: 'sum(rate(http_requests_total{code!~"5.."}[5m]))',
        totalQuery: 'sum(rate(http_requests_total[5m]))',
      },
    });
    const input = buildCreateInput(s, custom);
    expect(input.spec.sli.type).toBe('single');
    const def = singlePromSli(input.spec.sli);
    expect(def.type).toBe('custom');
    expect(def.metric).toBeUndefined();
    expect(def.customExpr).toEqual({
      mode: 'events',
      goodQuery: 'sum(rate(http_requests_total{code!~"5.."}[5m]))',
      totalQuery: 'sum(rate(http_requests_total[5m]))',
    });
  });

  it('builds a custom raw-mode SLI when customPromql.mode === raw', () => {
    let s = reducer(baseState(), { kind: 'setTemplate', templateId: 'custom' });
    s = reducer(s, {
      kind: 'setCustomPromql',
      patch: { mode: 'raw', errorRatioQuery: 'some_precomputed_ratio' },
    });
    const input = buildCreateInput(s, custom);
    expect(singlePromSli(input.spec.sli).customExpr).toEqual({
      mode: 'raw',
      errorRatioQuery: 'some_precomputed_ratio',
    });
  });

  it('builds an APM span-derived availability SLI from the template custom defaults', () => {
    const apmAvailability = SLO_TEMPLATES.find((t) => t.id === 'apm-service-availability')!;
    let s = reducer(initialState(), {
      kind: 'setField',
      field: 'datasourceId',
      value: 'ds-2',
    });
    s = reducer(s, { kind: 'setField', field: 'name', value: 'checkout-avail' });
    s = reducer(s, { kind: 'setField', field: 'service', value: 'checkout' });
    s = reducer(s, { kind: 'setField', field: 'ownerTeam', value: 'sre' });
    s = reducer(s, { kind: 'setTemplate', templateId: 'apm-service-availability' });
    const input = buildCreateInput(s, apmAvailability);
    const def = singlePromSli(input.spec.sli);
    expect(def.type).toBe('custom');
    // Narrow out-of-band so jest/no-conditional-expect stays happy.
    const events =
      def.customExpr?.mode === 'events'
        ? def.customExpr
        : ((undefined as never) as { goodQuery: string; totalQuery: string });
    expect(events.goodQuery).toContain('service="checkout"');
    expect(events.goodQuery).toContain('remoteService=""');
    expect(events.totalQuery).toContain('namespace="span_derived"');
  });

  it('builds a DB client latency template with seconds unit and the histogram metric', () => {
    const dbLatency = SLO_TEMPLATES.find((t) => t.id === 'db-client-latency')!;
    let s = baseState();
    s = reducer(s, { kind: 'setTemplate', templateId: 'db-client-latency' });
    s = reducer(s, { kind: 'setField', field: 'service', value: 'foo' });
    s = reducer(s, {
      kind: 'setDimension',
      index: 0,
      dim: { name: 'service_name', value: 'foo' },
    });
    const input = buildCreateInput(s, dbLatency);
    const def = singlePromSli(input.spec.sli);
    expect(def.type).toBe('latency_threshold');
    expect(def.metric).toBe('db_client_operation_duration_seconds_bucket');
    expect(def.latencyThresholdUnit).toBe('seconds');
  });

  it('persists burn-rate, budget-warning, alarm, and exclusion-window edits into the spec', () => {
    let s = baseState();
    s = reducer(s, {
      kind: 'setBurnRateField',
      index: 0,
      field: 'burnRateMultiplier',
      value: 20,
    });
    s = reducer(s, {
      kind: 'setBudgetWarningField',
      index: 0,
      field: 'threshold',
      value: 0.25,
    });
    s = reducer(s, { kind: 'setAlarmToggle', alarm: 'sliHealth', enabled: true });
    s = reducer(s, { kind: 'addExclusionWindow' });
    s = reducer(s, {
      kind: 'setExclusionWindowField',
      index: 0,
      field: 'name',
      value: 'weekly-maintenance',
    });
    const input = buildCreateInput(s, httpAvailability);
    expect(input.spec.alerting.burnRates[0].burnRateMultiplier).toBe(20);
    expect(input.spec.budgetWarningThresholds[0].threshold).toBe(0.25);
    expect(input.spec.alarms.sliHealth.enabled).toBe(true);
    expect(input.spec.exclusionWindows[0].name).toBe('weekly-maintenance');
  });
});

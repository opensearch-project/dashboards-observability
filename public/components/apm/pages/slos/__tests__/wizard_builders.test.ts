/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for the form-state → SloCreateInput builder. Most of the wizard's
 * complexity is shape: percent → decimal target, key=value rows → flat
 * record, custom-PromQL mode routing, latency-only `latencyThreshold` field.
 */

import { SLO_TEMPLATES } from '../../../../../../common/slo/slo_templates';
import type { SloTemplate } from '../../../../../../common/slo/slo_templates';
import { buildCreateInput, entriesToRecord, parseKeyValueBlock } from '../wizard_builders';
import { initialState, reducer } from '../wizard_state';
import type { FormState } from '../wizard_state';

function pickTemplate(id: string): SloTemplate {
  const t = SLO_TEMPLATES.find((x) => x.id === id);
  if (!t) throw new Error(`expected fixture template "${id}" to exist`);
  return t;
}

function statePopulated(): FormState {
  let s = initialState();
  s = reducer(s, { kind: 'setField', field: 'datasourceId', value: 'ds-1' });
  s = reducer(s, { kind: 'setField', field: 'name', value: 'checkout-availability' });
  s = reducer(s, { kind: 'setField', field: 'service', value: 'checkout' });
  s = reducer(s, { kind: 'setField', field: 'ownerTeam', value: 'storefront' });
  s = reducer(s, { kind: 'setObjectiveField', index: 0, field: 'target', value: '99.5' });
  return s;
}

describe('buildCreateInput', () => {
  it('converts target % into a decimal ratio', () => {
    const t = pickTemplate('apm-service-availability');
    const input = buildCreateInput(statePopulated(), t);
    expect(input.spec.objectives[0].target).toBeCloseTo(0.995, 5);
  });

  it('emits one objective per wizard row (multi-objective)', () => {
    let s = statePopulated();
    s = reducer(s, { kind: 'addObjective' });
    s = reducer(s, { kind: 'setObjectiveField', index: 1, field: 'target', value: '99.0' });
    const input = buildCreateInput(s, pickTemplate('apm-service-availability'));
    expect(input.spec.objectives.map((o) => o.target)).toEqual([
      expect.closeTo(0.995, 5),
      expect.closeTo(0.99, 5),
    ]);
  });

  it('only carries latencyThreshold for latency_threshold templates', () => {
    const availability = buildCreateInput(
      statePopulated(),
      pickTemplate('apm-service-availability')
    );
    expect(availability.spec.objectives[0].latencyThreshold).toBeUndefined();

    const latencyTemplate = SLO_TEMPLATES.find((t) => t.sli.type === 'latency_threshold');
    if (!latencyTemplate) {
      throw new Error('expected at least one latency_threshold template fixture');
    }
    let s = statePopulated();
    s = reducer(s, {
      kind: 'setObjectiveField',
      index: 0,
      field: 'latencyThreshold',
      value: '0.4',
    });
    const latency = buildCreateInput(s, latencyTemplate);
    expect(latency.spec.objectives[0].latencyThreshold).toBeCloseTo(0.4, 5);
  });

  it('routes events-mode custom PromQL into customExpr.goodQuery / totalQuery', () => {
    const customTemplate = SLO_TEMPLATES.find((t) => t.sli.type === 'custom');
    if (!customTemplate) throw new Error('expected a custom template fixture');
    let s = statePopulated();
    s = reducer(s, {
      kind: 'setCustomPromql',
      patch: { mode: 'events', goodQuery: 'g', totalQuery: 't' },
    });
    const input = buildCreateInput(s, customTemplate);
    expect(input.spec.sli.type).toBe('single');
    const sli = input.spec.sli as { type: 'single'; definition?: { customExpr?: unknown } };
    expect(sli.definition?.customExpr).toEqual({
      mode: 'events',
      goodQuery: 'g',
      totalQuery: 't',
    });
  });

  it('routes raw-mode custom PromQL into customExpr.errorRatioQuery', () => {
    const customTemplate = SLO_TEMPLATES.find((t) => t.sli.type === 'custom');
    if (!customTemplate) throw new Error('expected a custom template fixture');
    let s = statePopulated();
    s = reducer(s, {
      kind: 'setCustomPromql',
      patch: { mode: 'raw', errorRatioQuery: 'rate(errors[5m])' },
    });
    const input = buildCreateInput(s, customTemplate);
    expect(input.spec.sli.type).toBe('single');
    const sli = input.spec.sli as { type: 'single'; definition?: { customExpr?: unknown } };
    expect(sli.definition?.customExpr).toEqual({
      mode: 'raw',
      errorRatioQuery: 'rate(errors[5m])',
    });
  });

  it('flattens the labels grid into Record<string,string>, dropping empty-key rows', () => {
    let s = statePopulated();
    s = reducer(s, { kind: 'addLabelEntry' });
    s = reducer(s, { kind: 'setLabelEntry', index: 0, field: 'key', value: 'compliance' });
    s = reducer(s, { kind: 'setLabelEntry', index: 0, field: 'value', value: 'pci' });
    s = reducer(s, { kind: 'addLabelEntry' });
    s = reducer(s, { kind: 'setLabelEntry', index: 1, field: 'key', value: '' });
    s = reducer(s, { kind: 'setLabelEntry', index: 1, field: 'value', value: 'orphan' });
    const input = buildCreateInput(s, pickTemplate('apm-service-availability'));
    expect(input.spec.labels).toEqual({ compliance: 'pci' });
  });

  it('drops empty dimensions but keeps entered ones', () => {
    let s = statePopulated();
    s = reducer(s, { kind: 'setDimension', index: 0, dim: { name: 'service', value: 'checkout' } });
    s = reducer(s, { kind: 'addDimension' });
    s = reducer(s, { kind: 'setDimension', index: 1, dim: { name: '', value: 'orphan' } });
    const input = buildCreateInput(s, pickTemplate('apm-service-availability'));
    expect(input.spec.sli.type).toBe('single');
    const sli = input.spec.sli as {
      type: 'single';
      dimensions?: Array<{ name: string; value: string }>;
    };
    expect(sli.dimensions).toEqual([{ name: 'service', value: 'checkout' }]);
  });
});

describe('entriesToRecord', () => {
  it('drops rows with empty keys', () => {
    expect(
      entriesToRecord([
        { key: 'a', value: '1' },
        { key: '', value: 'orphan' },
        { key: 'b', value: '' },
      ])
    ).toEqual({ a: '1', b: '' });
  });
});

describe('parseKeyValueBlock', () => {
  it('parses a multi-line key=value block, tolerating whitespace', () => {
    const block = `
      compliance = pci
      runbook=https://wiki/slo
      ignored without equals
    `;
    expect(parseKeyValueBlock(block)).toEqual({
      compliance: 'pci',
      runbook: 'https://wiki/slo',
    });
  });
});

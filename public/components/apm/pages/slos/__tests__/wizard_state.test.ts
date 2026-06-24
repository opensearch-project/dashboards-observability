/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SLO_TEMPLATES } from '../../../../../../common/slo/slo_templates';
import { initialState, reducer, applyTemplate } from '../wizard_state';

describe('wizard_state reducer', () => {
  it('starts with a single objective and the 28d window default', () => {
    const s = initialState();
    expect(s.objectives).toHaveLength(1);
    expect(s.windowDuration).toBe('28d');
    expect(s.burnRates.length).toBeGreaterThanOrEqual(4);
  });

  it('applies the HTTP Availability template without resetting the user service', () => {
    const s0 = reducer(initialState(), {
      kind: 'setField',
      field: 'service',
      value: 'my-api',
    });
    const template = SLO_TEMPLATES.find((t) => t.id === 'http-availability')!;
    const s1 = applyTemplate(s0, template);
    expect(s1.service).toBe('my-api');
    // Dimension label name comes from the template's dimensionHints — not hardcoded.
    expect(s1.dimensions[0]).toEqual({
      name: template.dimensionHints.serviceLabel,
      value: 'my-api',
    });
    expect(s1.objectives[0].name).toBe('availability-99-9');
  });

  it('resets objectives to a latency-appropriate default when switching templates', () => {
    let s = initialState();
    s = reducer(s, { kind: 'setTemplate', templateId: 'http-availability' });
    s = reducer(s, { kind: 'addObjective' });
    expect(s.objectives).toHaveLength(2);
    s = reducer(s, { kind: 'setTemplate', templateId: 'http-latency' });
    expect(s.objectives).toHaveLength(1);
    expect(s.objectives[0].latencyThreshold).toBe('0.5');
  });

  it('adds and removes objectives but refuses to drop below one', () => {
    let s = initialState();
    s = reducer(s, { kind: 'addObjective' });
    s = reducer(s, { kind: 'addObjective' });
    expect(s.objectives).toHaveLength(3);
    s = reducer(s, { kind: 'removeObjective', index: 1 });
    expect(s.objectives).toHaveLength(2);
    s = reducer(s, { kind: 'removeObjective', index: 0 });
    s = reducer(s, { kind: 'removeObjective', index: 0 });
    // The second removal is a no-op because length is 1.
    expect(s.objectives).toHaveLength(1);
  });

  it('routes custom PromQL patches into the customPromql slice', () => {
    let s = initialState();
    s = reducer(s, { kind: 'setCustomPromql', patch: { mode: 'raw' } });
    s = reducer(s, {
      kind: 'setCustomPromql',
      patch: { errorRatioQuery: 'sum(rate(errors[5m])) / sum(rate(total[5m]))' },
    });
    expect(s.customPromql.mode).toBe('raw');
    expect(s.customPromql.errorRatioQuery).toContain('errors');
  });

  it('edits a burn-rate tier in place without clobbering siblings', () => {
    let s = initialState();
    const before = s.burnRates[1];
    s = reducer(s, {
      kind: 'setBurnRateField',
      index: 0,
      field: 'burnRateMultiplier',
      value: 20,
    });
    expect(s.burnRates[0].burnRateMultiplier).toBe(20);
    expect(s.burnRates[1]).toEqual(before);
  });

  it('toggles supplemental alarms and no-data duration independently', () => {
    let s = initialState();
    s = reducer(s, { kind: 'setAlarmToggle', alarm: 'sliHealth', enabled: true });
    s = reducer(s, { kind: 'setNoDataDuration', forDuration: '30m' });
    expect(s.alarms.sliHealth.enabled).toBe(true);
    expect(s.alarms.noData.forDuration).toBe('30m');
    expect(s.alarms.noData.enabled).toBe(false);
  });

  it('pre-fills custom PromQL with the service name substituted for APM span-derived templates', () => {
    let s = reducer(initialState(), {
      kind: 'setField',
      field: 'service',
      value: 'checkout',
    });
    s = reducer(s, { kind: 'setTemplate', templateId: 'apm-service-availability' });
    expect(s.customPromql.mode).toBe('events');
    // `${service}` placeholder should have been replaced.
    expect(s.customPromql.goodQuery).not.toContain('${service}');
    expect(s.customPromql.goodQuery).toContain('service="checkout"');
    expect(s.customPromql.totalQuery).toContain('service="checkout"');
    // Latency histogram bucket selector preserved in the *latency* template.
    s = reducer(s, { kind: 'setTemplate', templateId: 'apm-service-latency' });
    expect(s.customPromql.goodQuery).toContain('latency_seconds_bucket');
    expect(s.customPromql.goodQuery).toContain('le="0.5"');
  });

  it('leaves ${remoteService} placeholder intact when the dependency template is applied without a remoteService', () => {
    let s = reducer(initialState(), {
      kind: 'setField',
      field: 'service',
      value: 'frontend',
    });
    s = reducer(s, { kind: 'setTemplate', templateId: 'apm-dependency-availability' });
    // Caller is filled in, dependency is not.
    expect(s.customPromql.goodQuery).toContain('service="frontend"');
    expect(s.customPromql.goodQuery).toContain('remoteService="${remoteService}"');
  });

  it('swaps exclusion window schedule types, seeding sensible defaults', () => {
    let s = initialState();
    s = reducer(s, { kind: 'addExclusionWindow' });
    expect(s.exclusionWindows[0].schedule.type).toBe('cron');
    s = reducer(s, { kind: 'setExclusionWindowScheduleType', index: 0, type: 'oneoff' });
    const schedule = s.exclusionWindows[0].schedule;
    expect(schedule.type).toBe('oneoff');
    // Narrow after the type assertion; the `schedule` const keeps us out of
    // jest/no-conditional-expect's branched territory.
    const oneoff =
      schedule.type === 'oneoff'
        ? schedule
        : ((undefined as never) as typeof schedule & { type: 'oneoff' });
    expect(oneoff.start).toMatch(/T/);
    expect(oneoff.end).toMatch(/T/);
  });
});

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Reducer-shape sanity checks. The wizard reducer is small but its array
 * mutations (objectives, dimensions, burn rates, exclusion windows,
 * labels/annotations) are easy to break: forgetting to slice() leaks state
 * mutation; forgetting to clamp `removeObjective` lets the user delete the
 * sole remaining objective and submit with `objectives.length === 0`.
 */

import { initialState, reducer } from '../wizard_state';

describe('reducer — multi-objective edits', () => {
  it('starts with one objective row', () => {
    const s = initialState();
    expect(s.objectives).toHaveLength(1);
  });

  it("addObjective appends a new row carrying the first row's defaults", () => {
    const s0 = initialState();
    const s1 = reducer(s0, { kind: 'addObjective' });
    expect(s1.objectives).toHaveLength(2);
    expect(s1.objectives[1].name).toBe('objective-2');
    expect(s1.objectives[1].target).toBe(s0.objectives[0].target);
  });

  it('removeObjective drops the targeted row but never the last one', () => {
    let s = initialState();
    s = reducer(s, { kind: 'addObjective' });
    s = reducer(s, { kind: 'addObjective' });
    expect(s.objectives).toHaveLength(3);
    s = reducer(s, { kind: 'removeObjective', index: 1 });
    expect(s.objectives).toHaveLength(2);

    // Remove down to one — can't go further.
    s = reducer(s, { kind: 'removeObjective', index: 0 });
    s = reducer(s, { kind: 'removeObjective', index: 0 });
    expect(s.objectives).toHaveLength(1);
  });

  it('setObjectiveField updates only the targeted row', () => {
    let s = initialState();
    s = reducer(s, { kind: 'addObjective' });
    s = reducer(s, { kind: 'setObjectiveField', index: 1, field: 'target', value: '99.5' });
    expect(s.objectives[0].target).toBe('99.9');
    expect(s.objectives[1].target).toBe('99.5');
  });
});

describe('reducer — burn-rate presets', () => {
  it('applyBurnRatePreset overwrites the burn-rate tiers', () => {
    let s = initialState();
    expect(s.burnRates.length).toBe(4); // balanced default
    s = reducer(s, { kind: 'applyBurnRatePreset', preset: 'page-heavy' });
    expect(s.burnRates.length).toBe(3);
    expect(s.burnRates.every((t) => t.severity === 'critical')).toBe(true);
    s = reducer(s, { kind: 'applyBurnRatePreset', preset: 'ticket-heavy' });
    expect(s.burnRates.every((t) => t.severity === 'warning')).toBe(true);
  });

  it('addBurnRate adds a fresh tier', () => {
    let s = initialState();
    const before = s.burnRates.length;
    s = reducer(s, { kind: 'addBurnRate' });
    expect(s.burnRates.length).toBe(before + 1);
  });
});

describe('reducer — labels / annotations grids', () => {
  it('addLabelEntry appends an empty row', () => {
    let s = initialState();
    s = reducer(s, { kind: 'addLabelEntry' });
    expect(s.labels).toEqual([{ key: '', value: '' }]);
  });

  it('setLabelEntry edits the targeted row', () => {
    let s = initialState();
    s = reducer(s, { kind: 'addLabelEntry' });
    s = reducer(s, { kind: 'setLabelEntry', index: 0, field: 'key', value: 'compliance' });
    s = reducer(s, { kind: 'setLabelEntry', index: 0, field: 'value', value: 'pci' });
    expect(s.labels[0]).toEqual({ key: 'compliance', value: 'pci' });
  });

  it('annotation grid is independent of label grid', () => {
    let s = initialState();
    s = reducer(s, { kind: 'addLabelEntry' });
    s = reducer(s, { kind: 'addAnnotationEntry' });
    s = reducer(s, { kind: 'setAnnotationEntry', index: 0, field: 'key', value: 'runbook' });
    expect(s.labels[0]).toEqual({ key: '', value: '' });
    expect(s.annotations[0]).toEqual({ key: 'runbook', value: '' });
  });
});

describe('reducer — supplemental alarm toggles', () => {
  it('preserves noData.forDuration when toggling enabled', () => {
    let s = initialState();
    s = reducer(s, { kind: 'setNoDataDuration', forDuration: '15m' });
    expect(s.alarms.noData).toEqual({ enabled: false, forDuration: '15m' });
    s = reducer(s, { kind: 'setAlarmToggle', alarm: 'noData', enabled: true });
    expect(s.alarms.noData).toEqual({ enabled: true, forDuration: '15m' });
  });

  it('toggles other alarm types without disturbing the rest', () => {
    let s = initialState();
    s = reducer(s, { kind: 'setAlarmToggle', alarm: 'sliHealth', enabled: true });
    expect(s.alarms.sliHealth.enabled).toBe(true);
    expect(s.alarms.budgetWarning.enabled).toBe(true); // unchanged
    expect(s.alarms.attainmentBreach.enabled).toBe(false); // unchanged
  });
});

describe('reducer — submit gate', () => {
  it('markSubmitAttempted is idempotent', () => {
    const s0 = initialState();
    const s1 = reducer(s0, { kind: 'markSubmitAttempted' });
    expect(s1.submitAttempted).toBe(true);
    const s2 = reducer(s1, { kind: 'markSubmitAttempted' });
    expect(s2).toBe(s1); // same object: no-op when already attempted
  });
});

describe('reducer — exclusion windows', () => {
  it('addExclusionWindow seeds a default cron schedule', () => {
    let s = initialState();
    s = reducer(s, { kind: 'addExclusionWindow' });
    expect(s.exclusionWindows).toHaveLength(1);
    expect(s.exclusionWindows[0].schedule.type).toBe('cron');
  });

  it('flipping schedule type to oneoff replaces the schedule shape', () => {
    let s = initialState();
    s = reducer(s, { kind: 'addExclusionWindow' });
    s = reducer(s, { kind: 'setExclusionWindowScheduleType', index: 0, type: 'oneoff' });
    expect(s.exclusionWindows[0].schedule.type).toBe('oneoff');
  });
});

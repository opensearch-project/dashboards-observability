/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SLO_TEMPLATES } from '../../../../../../common/slo/slo_templates';
import type { SloDocument } from '../../../../../../common/slo/slo_types';
import { hydrateFromDoc, initialState, reducer, applyTemplate } from '../wizard_state';
import { buildCreateInput } from '../wizard_builders';

describe('wizard_state reducer', () => {
  it('starts with a single objective and the 28d window default', () => {
    const s = initialState();
    expect(s.objectives).toHaveLength(1);
    expect(s.windowDuration).toBe('28d');
    expect(s.burnRates.length).toBeGreaterThanOrEqual(4);
  });

  it('resets the whole form to a fresh state when a template is applied', () => {
    // Switching/picking a template is a clean slate (product decision): prior
    // identity fields do NOT carry over. The user re-enters them per template.
    const s0 = reducer(initialState(), {
      kind: 'setField',
      field: 'service',
      value: 'my-api',
    });
    const template = SLO_TEMPLATES.find((t) => t.id === 'http-availability')!;
    const s1 = applyTemplate(s0, template);
    expect(s1.service).toBe('');
    // Dimension label name comes from the template's dimensionHints; value is
    // reset to blank (no service yet).
    expect(s1.dimensions[0]).toEqual({
      name: template.dimensionHints.serviceLabel,
      value: '',
    });
    expect(s1.metric).toBe(template.sli.metric);
    expect(s1.objectives[0].name).toBe('availability-99-9');
  });

  it('clears fields from a previously selected template when switching', () => {
    let s = reducer(initialState(), { kind: 'setTemplate', templateId: 'http-availability' });
    s = reducer(s, { kind: 'setField', field: 'service', value: 'frontend' });
    s = reducer(s, { kind: 'setField', field: 'name', value: 'my-slo' });
    // Switch to a different template — everything resets.
    s = reducer(s, { kind: 'setTemplate', templateId: 'rpc-latency' });
    expect(s.service).toBe('');
    expect(s.name).toBe('');
    expect(s.metric).toBe('rpc_server_duration_seconds_bucket');
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

  it('pre-fills custom PromQL with the service substituted once the service is set', () => {
    // Template applies first (fresh state, blank service), then the user picks a
    // service which substitutes the ${service} placeholder.
    let s = reducer(initialState(), {
      kind: 'setTemplate',
      templateId: 'apm-service-availability',
    });
    s = reducer(s, { kind: 'setField', field: 'service', value: 'checkout' });
    expect(s.customPromql.mode).toBe('events');
    expect(s.customPromql.goodQuery).not.toContain('${service}');
    expect(s.customPromql.goodQuery).toContain('service="checkout"');
    expect(s.customPromql.totalQuery).toContain('service="checkout"');
    // Switching to the *latency* template resets, then re-set the service: the
    // latency histogram bucket selector + bound come through.
    s = reducer(s, { kind: 'setTemplate', templateId: 'apm-service-latency' });
    s = reducer(s, { kind: 'setField', field: 'service', value: 'checkout' });
    expect(s.customPromql.goodQuery).toContain('latency_seconds_bucket');
    expect(s.customPromql.goodQuery).toContain('le="0.5"');
  });

  it('substitutes ${service} when the service is set AFTER the template (deep-link order)', () => {
    // Landing on /create/apm-service-availability applies the template first
    // (service still empty), then the user picks a service. The placeholder
    // must be filled on that later setField, else the query keeps `${service}`
    // and matches no data ("No samples match this query").
    let s = reducer(initialState(), {
      kind: 'setTemplate',
      templateId: 'apm-service-availability',
    });
    expect(s.customPromql.goodQuery).toContain('${service}');
    s = reducer(s, { kind: 'setField', field: 'service', value: 'frontend' });
    expect(s.customPromql.goodQuery).not.toContain('${service}');
    expect(s.customPromql.goodQuery).toContain('service="frontend"');
    expect(s.customPromql.totalQuery).toContain('service="frontend"');
  });

  it('re-derives the template query when the service is switched', () => {
    let s = reducer(initialState(), {
      kind: 'setTemplate',
      templateId: 'apm-service-availability',
    });
    s = reducer(s, { kind: 'setField', field: 'service', value: 'frontend' });
    expect(s.customPromql.goodQuery).toContain('service="frontend"');
    // Switch service — the query must follow.
    s = reducer(s, { kind: 'setField', field: 'service', value: 'checkout' });
    expect(s.customPromql.goodQuery).toContain('service="checkout"');
    expect(s.customPromql.goodQuery).not.toContain('frontend');
    expect(s.customPromql.totalQuery).toContain('service="checkout"');
  });

  it('preserves a manually-edited query when the service is switched', () => {
    let s = reducer(initialState(), {
      kind: 'setTemplate',
      templateId: 'apm-service-availability',
    });
    s = reducer(s, { kind: 'setField', field: 'service', value: 'frontend' });
    // User edits the query in Advanced mode.
    s = reducer(s, {
      kind: 'setCustomPromql',
      patch: { goodQuery: 'sum(rate(my_custom_metric[5m]))' },
    });
    // Switching service must NOT clobber the hand-tuned query.
    s = reducer(s, { kind: 'setField', field: 'service', value: 'checkout' });
    expect(s.customPromql.goodQuery).toBe('sum(rate(my_custom_metric[5m]))');
  });

  it('leaves ${remoteService} placeholder intact when only the service is set', () => {
    // Apply the dependency template, then set the caller service. The caller is
    // substituted; the dependency (${remoteService}) stays a placeholder since
    // there's no remoteService form field driving it.
    let s = reducer(initialState(), {
      kind: 'setTemplate',
      templateId: 'apm-dependency-availability',
    });
    s = reducer(s, { kind: 'setField', field: 'service', value: 'frontend' });
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
        : (undefined as never as typeof schedule & { type: 'oneoff' });
    expect(oneoff.start).toMatch(/T/);
    expect(oneoff.end).toMatch(/T/);
  });
});

describe('hydrateFromDoc (edit-mode prefill)', () => {
  function makeDoc(): SloDocument {
    return {
      id: 'slo-1',
      spec: {
        datasourceId: 'prom_conn',
        name: 'api-availability',
        description: 'checkout availability',
        enabled: true,
        mode: 'shadow',
        service: 'checkout',
        owner: { teams: ['sre'], primaryUser: 'alice' },
        tier: 'tier-1',
        sli: {
          type: 'single',
          definition: {
            backend: 'prometheus',
            type: 'availability',
            calcMethod: 'events',
            metric: 'http_requests_total',
            goodEventsFilter: 'status!~"5.."',
          },
          dimensions: [{ name: 'service', value: 'checkout' }],
        },
        objectives: [{ name: 'obj-1', target: 0.999 }],
        budgetWarningThresholds: [{ threshold: 0.5, severity: 'warning' }],
        window: { type: 'rolling', duration: '14d' },
        alerting: {
          strategy: 'mwmbr',
          burnRates: [
            {
              shortWindow: '5m',
              longWindow: '1h',
              burnRateMultiplier: 14,
              severity: 'page',
              createAlarm: true,
              forDuration: '2m',
            },
          ],
        },
        alarms: {
          sliHealth: { enabled: false },
          attainmentBreach: { enabled: false },
          budgetWarning: { enabled: true },
          noData: { enabled: false, forDuration: '10m' },
          resolved: { enabled: false },
        },
        exclusionWindows: [],
        labels: { compliance: 'pci' },
        annotations: { runbook: 'https://wiki/slo' },
      },
      status: {
        version: 4,
        createdAt: '2026-01-01T00:00:00Z',
        createdBy: 'tester',
        updatedAt: '2026-01-02T00:00:00Z',
        updatedBy: 'tester',
        provisioning: { backend: 'prometheus', rulerNamespace: 'ns' },
      },
    };
  }

  it('maps a persisted spec back into the form state and carries the version', () => {
    const hydrated = hydrateFromDoc(makeDoc());
    expect(hydrated).not.toBeNull();
    const { state, version } = hydrated!;
    expect(version).toBe(4);
    expect(state.datasourceId).toBe('prom_conn');
    expect(state.name).toBe('api-availability');
    expect(state.service).toBe('checkout');
    expect(state.ownerTeam).toBe('sre');
    expect(state.ownerPrimaryUser).toBe('alice');
    expect(state.windowDuration).toBe('14d');
    expect(state.shadow).toBe(true);
    // Decimal target → percent string, no float artifacts.
    expect(state.objectives[0].target).toBe('99.9');
    expect(state.metric).toBe('http_requests_total');
    expect(state.labels).toEqual([{ key: 'compliance', value: 'pci' }]);
    expect(state.annotations).toEqual([{ key: 'runbook', value: 'https://wiki/slo' }]);
  });

  it('round-trips: buildCreateInput(hydrated) reproduces the persisted spec', () => {
    const doc = makeDoc();
    const hydrated = hydrateFromDoc(doc)!;
    const rebuilt = buildCreateInput(hydrated.state, hydrated.template);
    expect(rebuilt.spec.name).toBe(doc.spec.name);
    expect(rebuilt.spec.service).toBe(doc.spec.service);
    expect(rebuilt.spec.mode).toBe('shadow');
    expect(rebuilt.spec.objectives[0].target).toBeCloseTo(0.999, 6);
    const rebuiltSli = rebuilt.spec.sli;
    expect(rebuiltSli.type).toBe('single');
    if (rebuiltSli.type === 'single') {
      expect(rebuiltSli.definition.type).toBe('availability');
    }
    expect(rebuilt.spec.window).toEqual({ type: 'rolling', duration: '14d' });
  });

  it('returns null for composite SLIs (cannot be edited in the wizard)', () => {
    const doc = makeDoc();
    doc.spec.sli = {
      type: 'composite',
      operator: 'all',
      members: [{ sloId: 'a' }],
    };
    expect(hydrateFromDoc(doc)).toBeNull();
  });

  it('returns null for a rolling window the wizard cannot represent (no silent coercion)', () => {
    // The server accepts any 1d–30d rolling window, but the wizard only offers
    // 7/14/28/30d. A 21d SLO must be reported UNSUPPORTED — not coerced to 28d —
    // otherwise saving an edit to any unrelated field would silently rewrite the
    // window (and its alert/error-budget math) via the server's shallow merge.
    const doc = makeDoc();
    doc.spec.window = { type: 'rolling', duration: '21d' };
    expect(hydrateFromDoc(doc)).toBeNull();
  });

  it('returns null for a calendar window (wizard only models rolling windows)', () => {
    // A calendar window isn't representable at all; coercing would silently
    // change the window TYPE (calendar → 28d rolling) on save.
    const doc = makeDoc();
    doc.spec.window = { type: 'calendar', period: 'month' };
    expect(hydrateFromDoc(doc)).toBeNull();
  });
});

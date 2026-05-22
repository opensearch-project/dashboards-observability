/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { classifySloKind, rollupSloHealth } from '../classifier';
import type { SloHealthState, SloSummary, SuggestionKind } from '../slo_types';

function summary(overrides: Partial<SloSummary> = {}): SloSummary {
  return {
    id: overrides.id ?? 'slo-1',
    datasourceId: 'prom-1',
    datasourceType: 'prometheus',
    name: overrides.name ?? 'name',
    enabled: true,
    mode: 'active',
    service: overrides.service ?? 'svc-a',
    owner: { teams: ['t'] },
    canonicalKind: overrides.canonicalKind,
    sliNodeType: overrides.sliNodeType ?? 'single',
    sliBackend: overrides.sliBackend ?? 'prometheus',
    sliLeafType: overrides.sliLeafType,
    objectiveCount: 1,
    worstTarget: 0.99,
    window: { type: 'rolling', duration: '28d' },
    labels: {},
    status: {
      sloId: overrides.id ?? 'slo-1',
      objectives: [],
      state: overrides.status?.state ?? 'ok',
      firingCount: 0,
      ruleCount: 0,
      computedAt: '2026-04-01T00:00:00Z',
    },
    ...overrides,
  };
}

describe('classifySloKind', () => {
  it('returns the stored canonicalKind when set', () => {
    const s = summary({ canonicalKind: 'http-latency', sliLeafType: 'availability' });
    expect(classifySloKind(s)).toBe('http-latency');
  });

  it('falls back to availability heuristic for prometheus availability SLIs', () => {
    const s = summary({ sliBackend: 'prometheus', sliLeafType: 'availability' });
    expect(classifySloKind(s)).toBe('apm-availability');
  });

  it('falls back to latency heuristic for prometheus latency_threshold SLIs', () => {
    const s = summary({ sliBackend: 'prometheus', sliLeafType: 'latency_threshold' });
    expect(classifySloKind(s)).toBe('apm-latency');
  });

  it('returns undefined for unknown sliLeafType', () => {
    const s = summary({ sliBackend: 'prometheus', sliLeafType: 'mystery' });
    expect(classifySloKind(s)).toBeUndefined();
  });

  it('returns undefined for non-prometheus backends', () => {
    const s = summary({ sliBackend: 'opensearch', sliLeafType: 'availability' });
    expect(classifySloKind(s)).toBeUndefined();
  });
});

describe('rollupSloHealth', () => {
  function withState(id: string, service: string, state: SloHealthState, kind?: SuggestionKind) {
    return summary({
      id,
      service,
      canonicalKind: kind,
      status: {
        sloId: id,
        objectives: [],
        state,
        firingCount: 0,
        ruleCount: 0,
        computedAt: '2026-04-01T00:00:00Z',
      },
    });
  }

  it('seeds an empty bucket per requested service', () => {
    const r = rollupSloHealth(['svc-a', 'svc-b'], []);
    expect(r.bySvc.size).toBe(2);
    expect(r.bySvc.get('svc-a')!.total).toBe(0);
    expect(r.bySvc.get('svc-b')!.total).toBe(0);
    // No services => aggregate.hasAvailability seeded false (length 0).
    // With services, both flags start true and flip when any service lacks one.
    expect(r.aggregate.hasAvailability).toBe(false);
    expect(r.aggregate.hasLatency).toBe(false);
  });

  it('rolls up state counts by service', () => {
    const summaries = [
      withState('1', 'svc-a', 'ok'),
      withState('2', 'svc-a', 'breached'),
      withState('3', 'svc-a', 'warning'),
      withState('4', 'svc-a', 'no_data'),
      withState('5', 'svc-a', 'source_idle'),
      withState('6', 'svc-a', 'stale'),
      withState('7', 'svc-a', 'disabled'),
      withState('8', 'svc-a', 'rules_missing'),
    ];
    const r = rollupSloHealth(['svc-a'], summaries);
    const b = r.bySvc.get('svc-a')!;
    expect(b.total).toBe(8);
    expect(b.ok).toBe(1);
    expect(b.breached).toBe(1);
    expect(b.warning).toBe(1);
    // source_idle rolls into noData per the comment.
    expect(b.noData).toBe(2);
    expect(b.stale).toBe(1);
    expect(b.disabled).toBe(1);
    expect(b.rulesMissing).toBe(1);
  });

  it('marks hasAvailability/hasLatency from the canonical-kind suffix', () => {
    const summaries = [
      withState('1', 'svc-a', 'ok', 'http-availability'),
      withState('2', 'svc-a', 'ok', 'apm-latency'),
    ];
    const r = rollupSloHealth(['svc-a'], summaries);
    const b = r.bySvc.get('svc-a')!;
    expect(b.hasAvailability).toBe(true);
    expect(b.hasLatency).toBe(true);
    expect(b.missingCanonicalPair).toBe(false);
  });

  it('flips aggregate.hasAvailability false when any service lacks an availability SLO', () => {
    const summaries = [
      withState('1', 'svc-a', 'ok', 'http-availability'),
      withState('2', 'svc-a', 'ok', 'apm-latency'),
      withState('3', 'svc-b', 'ok', 'apm-latency'),
    ];
    const r = rollupSloHealth(['svc-a', 'svc-b'], summaries);
    expect(r.bySvc.get('svc-a')!.hasAvailability).toBe(true);
    expect(r.bySvc.get('svc-b')!.hasAvailability).toBe(false);
    expect(r.aggregate.hasAvailability).toBe(false);
    expect(r.aggregate.hasLatency).toBe(true);
    expect(r.aggregate.missingCanonicalPair).toBe(true);
  });

  it('drops summaries whose service is not in the requested set', () => {
    const summaries = [withState('1', 'unknown-svc', 'breached', 'http-availability')];
    const r = rollupSloHealth(['svc-a'], summaries);
    expect(r.bySvc.get('svc-a')!.total).toBe(0);
    expect(r.aggregate.total).toBe(0);
  });

  it('aggregate tally includes every counted summary', () => {
    const summaries = [
      withState('1', 'svc-a', 'ok', 'apm-availability'),
      withState('2', 'svc-a', 'breached', 'apm-latency'),
      withState('3', 'svc-b', 'warning', 'apm-availability'),
    ];
    const r = rollupSloHealth(['svc-a', 'svc-b'], summaries);
    expect(r.aggregate.total).toBe(3);
    expect(r.aggregate.ok).toBe(1);
    expect(r.aggregate.breached).toBe(1);
    expect(r.aggregate.warning).toBe(1);
    // svc-b has only availability — aggregate latency flips false.
    expect(r.aggregate.hasLatency).toBe(false);
  });
});

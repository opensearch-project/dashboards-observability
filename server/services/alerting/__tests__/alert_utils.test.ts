/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Unit tests for the Prometheus-episode → unified mapper.
 *
 * Exercised cases:
 *   - Active episode (`stillActiveAtRangeEnd`) ⇒ `state: 'active'`.
 *   - Resolved episode ⇒ `state: 'resolved'`.
 *   - Missing `labels.severity` ⇒ fallback `'medium'` (plan override —
 *     historical episodes prefer medium over `'info'` so they sort with
 *     real alerts rather than below them).
 *   - `truncatedStart` flag ⇒ `annotations.truncatedStart = 'true'`.
 */
import { promEpisodeToUnified } from '../alert_utils';

describe('promEpisodeToUnified', () => {
  const START = Date.UTC(2024, 0, 15, 12, 0, 0);
  const END = Date.UTC(2024, 0, 15, 13, 0, 0);

  it('maps an active episode to state "active" with critical severity', () => {
    const u = promEpisodeToUnified(
      {
        labels: { alertname: 'HighCPU', instance: 'i-1', severity: 'critical' },
        startMs: START,
        endMs: END,
        stillActiveAtRangeEnd: true,
      },
      'ds-prom'
    );
    expect(u.state).toBe('active');
    expect(u.severity).toBe('critical');
    expect(u.name).toBe('HighCPU');
    expect(u.datasourceId).toBe('ds-prom');
    expect(u.datasourceType).toBe('prometheus');
    expect(u.startTime).toBe(new Date(START).toISOString());
    expect(u.lastUpdated).toBe(new Date(END).toISOString());
  });

  it('maps a resolved episode to state "resolved"', () => {
    const u = promEpisodeToUnified(
      {
        labels: { alertname: 'HighCPU', severity: 'high' },
        startMs: START,
        endMs: END,
      },
      'ds-prom'
    );
    expect(u.state).toBe('resolved');
    expect(u.severity).toBe('high');
  });

  it('missing severity ⇒ fallback "medium" (historical-episode override)', () => {
    const u = promEpisodeToUnified(
      {
        labels: { alertname: 'NoSev' },
        startMs: START,
        endMs: END,
      },
      'ds-prom'
    );
    expect(u.severity).toBe('medium');
  });

  it('truncatedStart flag emits annotations.truncatedStart = "true"', () => {
    const u = promEpisodeToUnified(
      {
        labels: { alertname: 'EarlyFire', severity: 'high' },
        startMs: START,
        endMs: END,
        truncatedStart: true,
      },
      'ds-prom'
    );
    expect(u.annotations.truncatedStart).toBe('true');
  });

  it('no truncatedStart ⇒ annotation absent', () => {
    const u = promEpisodeToUnified(
      {
        labels: { alertname: 'X', severity: 'low' },
        startMs: START,
        endMs: END,
      },
      'ds-prom'
    );
    expect(u.annotations.truncatedStart).toBeUndefined();
  });

  it('id incorporates datasource, alertname, instance, and startMs', () => {
    const u = promEpisodeToUnified(
      {
        labels: { alertname: 'X', instance: 'host-1' },
        startMs: 12345,
        endMs: END,
      },
      'ds-prom'
    );
    expect(u.id).toContain('ds-prom');
    expect(u.id).toContain('X');
    expect(u.id).toContain('host-1');
    expect(u.id).toContain('12345');
  });
});

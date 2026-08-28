/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  alertMatchesSearch,
  emptyFilters,
  filterAlerts,
  matchesFilters,
  matchesSearch,
  sortRules,
} from '../filter';

describe('filter', () => {
  describe('emptyFilters', () => {
    it('returns a zeroed filter state with empty arrays and label map', () => {
      expect(emptyFilters()).toEqual({
        status: [],
        severity: [],
        monitorType: [],
        healthStatus: [],
        labels: {},
        createdBy: [],
        destinations: [],
        backend: [],
      });
    });
  });

  describe('matchesSearch', () => {
    const rule = {
      name: 'HighCpuUsage',
      labels: { severity: 'warning', team: 'infra' },
      annotations: { summary: 'CPU above 80%', runbook: 'https://wiki/x' },
    };

    it('matches empty query trivially', () => {
      expect(matchesSearch(rule, '')).toBe(true);
    });

    it('matches by name (case-insensitive) and label value', () => {
      expect(matchesSearch(rule, 'highcpu')).toBe(true);
      expect(matchesSearch(rule, 'WARNING')).toBe(true);
    });

    it('matches key:value syntax against labels and annotations', () => {
      expect(matchesSearch(rule, 'team:infra')).toBe(true);
      expect(matchesSearch(rule, 'summary:cpu')).toBe(true);
      expect(matchesSearch(rule, 'team:legal')).toBe(false);
    });

    it('requires every whitespace-separated term to match (AND semantics)', () => {
      expect(matchesSearch(rule, 'cpu infra')).toBe(true);
      expect(matchesSearch(rule, 'cpu nonexistent')).toBe(false);
    });
  });

  describe('matchesFilters', () => {
    const rule = {
      status: 'firing',
      severity: 'critical',
      monitorType: 'metrics',
      healthStatus: 'ok',
      labels: { severity: 'critical', team: 'infra' },
      createdBy: 'alice',
      datasourceType: 'prometheus',
      notificationDestinations: ['slack-ops', 'email-sre'],
    };

    it('returns true when all filter arrays are empty', () => {
      expect(matchesFilters(rule, emptyFilters())).toBe(true);
    });

    it('combines multiple criteria with AND semantics', () => {
      const filters = {
        ...emptyFilters(),
        status: ['firing'],
        severity: ['critical'],
        backend: ['prometheus'],
        labels: { team: ['infra'] },
      };
      expect(matchesFilters(rule, filters)).toBe(true);

      expect(matchesFilters(rule, { ...filters, status: ['resolved'] })).toBe(false);
      expect(matchesFilters(rule, { ...filters, labels: { team: ['sec'] } })).toBe(false);
    });

    it('matches destinations if any rule destination is selected', () => {
      expect(
        matchesFilters(rule, { ...emptyFilters(), destinations: ['email-sre', 'pagerduty-x'] })
      ).toBe(true);
      expect(matchesFilters(rule, { ...emptyFilters(), destinations: ['pagerduty-x'] })).toBe(
        false
      );
    });
  });

  describe('sortRules', () => {
    const rules = [
      { name: 'bravo', score: 2 },
      { name: 'ALPHA', score: 3 },
      { name: 'charlie', score: 1 },
    ];

    it('sorts strings case-insensitively ascending', () => {
      expect(sortRules(rules, 'name', 'asc').map((r) => r.name)).toEqual([
        'ALPHA',
        'bravo',
        'charlie',
      ]);
    });

    it('sorts numbers descending and does not mutate the input', () => {
      const copy = [...rules];
      expect(sortRules(rules, 'score', 'desc').map((r) => r.score)).toEqual([3, 2, 1]);
      expect(rules).toEqual(copy);
    });

    it('uses a custom accessor when provided', () => {
      const items = [
        { name: 'bravo', score: 2 },
        { name: 'a', score: 3 },
        { name: 'charlie', score: 1 },
      ];
      const byNameLen = (r: { name: string }) => r.name.length;
      expect(sortRules(items, 'name', 'asc', byNameLen).map((r) => r.name)).toEqual([
        'a',
        'bravo',
        'charlie',
      ]);
    });
  });

  describe('filterAlerts', () => {
    const alerts = [
      {
        name: 'HighCpu',
        severity: 'critical',
        state: 'firing',
        labels: { team: 'infra', env: 'prod' },
        message: 'CPU over threshold',
      },
      {
        name: 'LowDisk',
        severity: 'warning',
        state: 'pending',
        labels: { team: 'storage', env: 'prod' },
        message: 'Disk filling',
      },
      {
        name: 'OomKill',
        severity: 'critical',
        state: 'resolved',
        labels: { team: 'infra', env: 'staging' },
      },
    ];

    it('returns all alerts when no filter criteria given', () => {
      expect(filterAlerts(alerts, {})).toHaveLength(3);
    });

    it('filters by severity and state', () => {
      const result = filterAlerts(alerts, { severity: ['critical'], state: ['firing'] });
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('HighCpu');
    });

    it('requires every label key to be satisfied', () => {
      expect(
        filterAlerts(alerts, { labels: { team: ['infra'], env: ['prod'] } }).map((a) => a.name)
      ).toEqual(['HighCpu']);
    });

    it('search matches name, message, or label values (case-insensitive)', () => {
      expect(filterAlerts(alerts, { search: 'DISK' }).map((a) => a.name)).toEqual(['LowDisk']);
      expect(filterAlerts(alerts, { search: 'storage' }).map((a) => a.name)).toEqual(['LowDisk']);
      // alert without message still searches name/labels
      expect(filterAlerts(alerts, { search: 'oom' }).map((a) => a.name)).toEqual(['OomKill']);
    });

    it('scopes to a single SLO via a `slo_id:<id>` label deep-link (SLO detail "View alerts" pivot)', () => {
      const sloAlerts = [
        { name: 'BurnA', severity: 'critical', state: 'firing', labels: { slo_id: 'abc-123' } },
        { name: 'BurnB', severity: 'warning', state: 'firing', labels: { slo_id: 'def-456' } },
      ];
      // The value alone won't appear as a literal `slo_id:abc-123` substring in
      // any field — the label-aware branch is what makes this match.
      expect(filterAlerts(sloAlerts, { search: 'slo_id:abc-123' }).map((a) => a.name)).toEqual([
        'BurnA',
      ]);
      expect(filterAlerts(sloAlerts, { search: 'slo_id:none' })).toHaveLength(0);
    });
  });

  describe('alertMatchesSearch', () => {
    const alert = { name: 'HighCpu', message: 'CPU over threshold', labels: { slo_id: 'abc-123' } };

    it('matches an empty query', () => {
      expect(alertMatchesSearch(alert, '')).toBe(true);
      expect(alertMatchesSearch(alert, '   ')).toBe(true);
    });

    it('matches a single labelKey:value term against the label, not as a substring', () => {
      expect(alertMatchesSearch(alert, 'slo_id:abc-123')).toBe(true);
      expect(alertMatchesSearch(alert, 'slo_id:abc')).toBe(true); // includes()
      expect(alertMatchesSearch(alert, 'slo_id:zzz')).toBe(false);
      expect(alertMatchesSearch(alert, 'other:abc-123')).toBe(false); // wrong key
    });

    it('keeps whole-string substring behavior for free-text (with a space)', () => {
      expect(alertMatchesSearch(alert, 'cpu over')).toBe(true); // message substring
      expect(alertMatchesSearch(alert, 'highcpu')).toBe(true); // name substring
      expect(alertMatchesSearch(alert, 'no match')).toBe(false);
    });
  });
});

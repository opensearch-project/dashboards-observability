/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render } from '@testing-library/react';

const mockChartData = jest.fn();
jest.mock('../../../shared/hooks/use_promql_chart_data', () => ({
  usePromQLChartData: (...args: unknown[]) => mockChartData(...args),
  isResolutionExceededError: () => false,
  PromQLError: class extends Error {},
  RESOLUTION_EXCEEDED_CODE: 'RESOLUTION_EXCEEDED',
}));

import {
  classifyTier,
  healthColor,
  healthLabel,
  severityLabel,
  SloBurnRatePanel,
} from '../slo_burn_rate_panel';
import type { Objective, SloDocument } from '../../../../../../common/slo/slo_types';

function baseSlo(): SloDocument {
  return {
    id: 'slo-1',
    spec: {
      datasourceId: 'ds-1',
      name: 'avail',
      enabled: true,
      mode: 'active',
      service: 'svc',
      owner: { teams: ['t'] },
      sli: {
        type: 'single',
        definition: {
          backend: 'prometheus',
          type: 'availability',
          calcMethod: 'events',
          metric: 'http_requests_total',
        },
        dimensions: [{ name: 'service', value: 'svc' }],
      },
      objectives: [{ name: 'o', target: 0.99 }],
      budgetWarningThresholds: [],
      window: { type: 'rolling', duration: '28d' },
      alerting: {
        strategy: 'mwmbr',
        burnRates: [
          {
            shortWindow: '5m',
            longWindow: '1h',
            burnRateMultiplier: 14,
            severity: 'critical',
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
      labels: {},
      annotations: {},
    },
    status: {
      version: 1,
      createdAt: '2026-04-01T00:00:00Z',
      createdBy: 't',
      updatedAt: '2026-04-01T00:00:00Z',
      updatedBy: 't',
      provisioning: { backend: 'prometheus', rulerNamespace: 'slo-generated' },
    },
  };
}

const objective: Objective = { name: 'o', target: 0.99 };

beforeEach(() => {
  mockChartData.mockReset();
  // usePromQLChartData is called twice per tier (short + long); return empty.
  mockChartData.mockReturnValue({
    series: [],
    latestValue: null,
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  });
});

describe('classifyTier (M2 — no false green on missing data)', () => {
  const threshold = 0.1;

  it('classifies both-under-threshold as ok', () => {
    expect(classifyTier(0.01, 0.02, threshold)).toBe('ok');
  });

  it('classifies both-over-threshold as firing', () => {
    expect(classifyTier(0.5, 0.4, threshold)).toBe('firing');
  });

  it('classifies exactly one window over threshold as at_risk (not firing)', () => {
    expect(classifyTier(0.5, 0.02, threshold)).toBe('at_risk');
    expect(classifyTier(0.02, 0.5, threshold)).toBe('at_risk');
  });

  it('NEVER reports ok/green when a window is null, undefined, or NaN', () => {
    expect(classifyTier(null, 0.02, threshold)).toBe('no_data');
    expect(classifyTier(0.02, null, threshold)).toBe('no_data');
    expect(classifyTier(null, null, threshold)).toBe('no_data');
    expect(classifyTier(undefined as never, 0.02, threshold)).toBe('no_data');
    expect(classifyTier(NaN, 0.02, threshold)).toBe('no_data');
    expect(classifyTier(0.02, NaN, threshold)).toBe('no_data');
    expect(classifyTier(Infinity, 0.02, threshold)).toBe('no_data');
  });

  it('maps no_data to a subdued (grey) health color — never success/green', () => {
    const color = healthColor('no_data');
    expect(color).toBe('subdued');
    expect(color).not.toBe('success');
  });

  it('labels each tier health honestly in title case', () => {
    expect(healthLabel('firing')).toBe('Firing');
    expect(healthLabel('at_risk')).toBe('At risk');
    expect(healthLabel('ok')).toBe('Healthy');
    expect(healthLabel('no_data')).toBe('No data');
  });
});

describe('severityLabel (CLAR6)', () => {
  it('maps known severities to title-case labels', () => {
    expect(severityLabel('critical')).toBe('Critical');
    expect(severityLabel('warning')).toBe('Warning');
    expect(severityLabel('page')).toBe('Page');
    expect(severityLabel('ticket')).toBe('Ticket');
  });

  it('falls back to the raw token for unknown severities', () => {
    expect(severityLabel('sev2')).toBe('sev2');
  });
});

describe('SloBurnRatePanel', () => {
  it('mounts without throwing for an availability SLO', () => {
    render(
      <SloBurnRatePanel
        slo={baseSlo()}
        objective={objective}
        prometheusConnectionId="prom-1"
        timeRange={{ from: 'now-1h', to: 'now' }}
        refreshTrigger={0}
      />
    );
    // The panel renders even with empty data — just verify no throw.
    expect(document.body).toBeTruthy();
  });

  it('renders even when there are no burn rate tiers configured', () => {
    const slo = baseSlo();
    slo.spec.alerting.burnRates = [];
    render(
      <SloBurnRatePanel
        slo={slo}
        objective={objective}
        prometheusConnectionId="prom-1"
        timeRange={{ from: 'now-1h', to: 'now' }}
        refreshTrigger={0}
      />
    );
    expect(document.body).toBeTruthy();
  });
});

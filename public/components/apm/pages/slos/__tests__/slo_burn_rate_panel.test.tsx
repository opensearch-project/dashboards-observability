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

import { SloBurnRatePanel } from '../slo_burn_rate_panel';
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

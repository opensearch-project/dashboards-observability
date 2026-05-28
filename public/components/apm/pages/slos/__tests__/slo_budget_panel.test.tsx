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

import { SloBudgetPanel } from '../slo_budget_panel';
import type { Objective, SloDocument, SloLiveStatus } from '../../../../../../common/slo/slo_types';

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
        dimensions: [],
      },
      objectives: [{ name: 'o', target: 0.99 }],
      budgetWarningThresholds: [
        { threshold: 0.5, severity: 'warning' },
        { threshold: 0.2, severity: 'critical' },
      ],
      window: { type: 'rolling', duration: '28d' },
      alerting: { strategy: 'mwmbr', burnRates: [] },
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

const liveStatus: SloLiveStatus = {
  sloId: 'slo-1',
  objectives: [
    {
      objectiveName: 'o',
      currentValue: 0.99,
      currentValueUnit: 'ratio',
      attainment: 0.99,
      errorBudgetRemaining: 0.6,
      state: 'ok',
    },
  ],
  state: 'ok',
  firingCount: 0,
  ruleCount: 0,
  computedAt: '2026-04-01T00:00:00Z',
};

beforeEach(() => {
  mockChartData.mockReset();
  mockChartData.mockReturnValue({
    series: [],
    latestValue: null,
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  });
});

describe('SloBudgetPanel', () => {
  it('mounts with a representative props fixture', () => {
    render(
      <SloBudgetPanel
        slo={baseSlo()}
        objective={objective}
        liveStatus={liveStatus}
        prometheusConnectionId="prom-1"
        timeRange={{ from: 'now-1h', to: 'now' }}
        refreshTrigger={0}
      />
    );
    expect(document.body).toBeTruthy();
  });

  it('handles a breached liveStatus without throwing', () => {
    render(
      <SloBudgetPanel
        slo={baseSlo()}
        objective={objective}
        liveStatus={{
          ...liveStatus,
          objectives: [
            {
              objectiveName: 'o',
              currentValue: 0.85,
              currentValueUnit: 'ratio',
              attainment: 0.85,
              errorBudgetRemaining: -0.5,
              state: 'breached',
            },
          ],
          state: 'breached',
        }}
        prometheusConnectionId="prom-1"
        timeRange={{ from: 'now-1h', to: 'now' }}
        refreshTrigger={0}
      />
    );
    expect(document.body).toBeTruthy();
  });
});

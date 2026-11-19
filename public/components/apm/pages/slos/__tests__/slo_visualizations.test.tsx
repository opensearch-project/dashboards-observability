/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen } from '@testing-library/react';

const mockChartData = jest.fn();
jest.mock('../../../shared/hooks/use_promql_chart_data', () => ({
  usePromQLChartData: (...args: unknown[]) => mockChartData(...args),
  isResolutionExceededError: () => false,
  PromQLError: class extends Error {},
  RESOLUTION_EXCEEDED_CODE: 'RESOLUTION_EXCEEDED',
}));
jest.mock('../slo_budget_remaining_chart', () => ({
  SloBudgetRemainingChart: () => <div data-test-subj="budget-remaining-stub" />,
}));
jest.mock('../slo_burn_rate_chart', () => ({
  SloBurnRateChart: () => <div data-test-subj="burn-rate-stub" />,
}));

const mockUseApmConfig = jest.fn();
jest.mock('../../../config/apm_config_context', () => ({
  useApmConfig: () => mockUseApmConfig(),
}));
const mockUseDatasources = jest.fn();
jest.mock('../../../../alerting/hooks/use_datasources', () => ({
  useDatasources: () => mockUseDatasources(),
}));

import { SloVisualizations } from '../slo_visualizations';
import type { SloDocument, SloLiveStatus } from '../../../../../../common/slo/slo_types';

function baseSlo(): SloDocument & { liveStatus: SloLiveStatus } {
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
    liveStatus: {
      sloId: 'slo-1',
      objectives: [
        {
          objectiveName: 'o',
          currentValue: 0.99,
          currentValueUnit: 'ratio',
          attainment: 0.99,
          errorBudgetRemaining: 0.5,
          state: 'ok',
        },
      ],
      state: 'ok',
      firingCount: 0,
      ruleCount: 0,
      computedAt: '2026-04-01T00:00:00Z',
    },
  };
}

beforeEach(() => {
  mockChartData.mockReset();
  mockChartData.mockReturnValue({
    series: [],
    latestValue: null,
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  });
  mockUseApmConfig.mockReset();
  mockUseDatasources.mockReset();
  mockUseDatasources.mockReturnValue({ datasources: [], isLoading: false, error: null });
});

const promDatasourceRow = (id: string, connectionId: string) => ({
  id,
  name: connectionId,
  type: 'prometheus' as const,
  url: id,
  enabled: true,
  directQueryName: connectionId,
});

/** Every connection id the charts asked the PromQL hook for. */
const queriedConnections = () =>
  new Set(
    mockChartData.mock.calls.map(
      ([args]) => (args as { prometheusConnectionId?: string }).prometheusConnectionId
    )
  );

describe('SloVisualizations', () => {
  it('renders a warning when no Prometheus connection is configured', () => {
    mockUseApmConfig.mockReturnValue({ config: {} });
    render(
      <SloVisualizations
        slo={baseSlo()}
        timeRange={{ from: 'now-1h', to: 'now' }}
        refreshTrigger={0}
      />
    );
    expect(screen.getByText(/No Prometheus data source for this SLO/)).toBeInTheDocument();
  });

  it('renders the chart subtree when a Prometheus connection is configured', () => {
    mockUseApmConfig.mockReturnValue({
      config: { prometheusDataSource: { name: 'prom-1' } },
    });
    render(
      <SloVisualizations
        slo={baseSlo()}
        timeRange={{ from: 'now-1h', to: 'now' }}
        refreshTrigger={0}
      />
    );
    expect(screen.getByTestId('budget-remaining-stub')).toBeInTheDocument();
    expect(screen.getByTestId('burn-rate-stub')).toBeInTheDocument();
  });

  it('renders the multi-objective selector when there are 2+ objectives', () => {
    mockUseApmConfig.mockReturnValue({
      config: { prometheusDataSource: { name: 'prom-1' } },
    });
    const slo = baseSlo();
    slo.spec.objectives = [
      { name: 'a', target: 0.99 },
      { name: 'b', target: 0.95 },
    ];
    render(
      <SloVisualizations slo={slo} timeRange={{ from: 'now-1h', to: 'now' }} refreshTrigger={0} />
    );
    expect(screen.getByTestId('slosObjectiveSelector')).toBeInTheDocument();
  });

  it('renders the "cannot build a chart" callout when SLI is missing the metric', () => {
    mockUseApmConfig.mockReturnValue({
      config: { prometheusDataSource: { name: 'prom-1' } },
    });
    const slo = baseSlo();
    if (slo.spec.sli.type === 'single' && slo.spec.sli.definition.backend === 'prometheus') {
      // @ts-expect-error simulate the missing-metric branch
      slo.spec.sli.definition = {
        backend: 'prometheus',
        type: 'availability',
        calcMethod: 'events',
      };
    }
    render(
      <SloVisualizations slo={slo} timeRange={{ from: 'now-1h', to: 'now' }} refreshTrigger={0} />
    );
    expect(screen.getByText(/Cannot build a chart for this SLI/)).toBeInTheDocument();
  });

  it("charts the SLO's own datasource when APM has no Prometheus source", () => {
    mockUseApmConfig.mockReturnValue({ config: null, loading: false });
    mockUseDatasources.mockReturnValue({
      datasources: [promDatasourceRow('so-prom', 'checkout_prom')],
      isLoading: false,
      error: null,
    });
    const slo = baseSlo();
    slo.spec.datasourceId = 'checkout_prom';
    render(
      <SloVisualizations slo={slo} timeRange={{ from: 'now-1h', to: 'now' }} refreshTrigger={0} />
    );
    expect(screen.queryByText(/No Prometheus data source for this SLO/)).toBeNull();
    expect(screen.getByTestId('budget-remaining-stub')).toBeInTheDocument();
    expect(mockChartData).toHaveBeenCalled();
    expect(queriedConnections()).toEqual(new Set(['checkout_prom']));
  });

  it("prefers the SLO's own datasource over a different APM source", () => {
    mockUseApmConfig.mockReturnValue({
      config: { prometheusDataSource: { name: 'apm-prom' } },
      loading: false,
    });
    mockUseDatasources.mockReturnValue({
      datasources: [
        promDatasourceRow('so-prom', 'checkout_prom'),
        promDatasourceRow('so-apm', 'apm-prom'),
      ],
      isLoading: false,
      error: null,
    });
    const slo = baseSlo();
    slo.spec.datasourceId = 'checkout_prom';
    render(
      <SloVisualizations slo={slo} timeRange={{ from: 'now-1h', to: 'now' }} refreshTrigger={0} />
    );
    expect(queriedConnections()).toEqual(new Set(['checkout_prom']));
  });

  it('falls back to the APM source when the SLO datasource is not listed', () => {
    mockUseApmConfig.mockReturnValue({
      config: { prometheusDataSource: { name: 'apm-prom' } },
      loading: false,
    });
    render(
      <SloVisualizations
        slo={baseSlo()}
        timeRange={{ from: 'now-1h', to: 'now' }}
        refreshTrigger={0}
      />
    );
    expect(queriedConnections()).toEqual(new Set(['apm-prom']));
    expect(screen.getByTestId('slosVisualizationsApmFallback')).toHaveTextContent(
      "Charts use the APM settings' Prometheus data source (apm-prom); this SLO's data source (ds-1) wasn't found."
    );
  });

  it('shows no fallback note when the charts use the SLO datasource', () => {
    mockUseApmConfig.mockReturnValue({
      config: { prometheusDataSource: { name: 'apm-prom' } },
      loading: false,
    });
    mockUseDatasources.mockReturnValue({
      datasources: [promDatasourceRow('so-prom', 'checkout_prom')],
      isLoading: false,
      error: null,
    });
    const slo = baseSlo();
    slo.spec.datasourceId = 'checkout_prom';
    render(
      <SloVisualizations slo={slo} timeRange={{ from: 'now-1h', to: 'now' }} refreshTrigger={0} />
    );
    expect(screen.queryByTestId('slosVisualizationsApmFallback')).toBeNull();
  });

  it('trims the SLO datasource id in the fallback note, and skips it for a blank id', () => {
    mockUseApmConfig.mockReturnValue({
      config: { prometheusDataSource: { name: 'apm-prom' } },
      loading: false,
    });
    const slo = baseSlo();
    slo.spec.datasourceId = '  gone  ';
    const { unmount } = render(
      <SloVisualizations slo={slo} timeRange={{ from: 'now-1h', to: 'now' }} refreshTrigger={0} />
    );
    expect(screen.getByTestId('slosVisualizationsApmFallback')).toHaveTextContent(
      "this SLO's data source (gone) wasn't found."
    );
    unmount();
    slo.spec.datasourceId = '   ';
    render(
      <SloVisualizations slo={slo} timeRange={{ from: 'now-1h', to: 'now' }} refreshTrigger={0} />
    );
    expect(screen.queryByTestId('slosVisualizationsApmFallback')).toBeNull();
  });

  it('shows no fallback note when the APM source is the SLO datasource by name', () => {
    mockUseApmConfig.mockReturnValue({
      config: { prometheusDataSource: { name: 'checkout_prom' } },
      loading: false,
    });
    const slo = baseSlo();
    slo.spec.datasourceId = 'checkout_prom';
    render(
      <SloVisualizations slo={slo} timeRange={{ from: 'now-1h', to: 'now' }} refreshTrigger={0} />
    );
    expect(queriedConnections()).toEqual(new Set(['checkout_prom']));
    expect(screen.queryByTestId('slosVisualizationsApmFallback')).toBeNull();
  });

  it('waits for the datasource list instead of charting the APM source early', () => {
    mockUseApmConfig.mockReturnValue({
      config: { prometheusDataSource: { name: 'apm-prom' } },
      loading: false,
    });
    mockUseDatasources.mockReturnValue({ datasources: [], isLoading: true, error: null });
    render(
      <SloVisualizations
        slo={baseSlo()}
        timeRange={{ from: 'now-1h', to: 'now' }}
        refreshTrigger={0}
      />
    );
    expect(screen.getByTestId('slosVisualizationsConnectionLoading')).toHaveAttribute(
      'aria-label',
      'Loading the SLO data source'
    );
    expect(screen.queryByText(/No Prometheus data source for this SLO/)).toBeNull();
    expect(mockChartData).not.toHaveBeenCalled();
  });
});

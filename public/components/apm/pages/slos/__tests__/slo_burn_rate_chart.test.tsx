/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import type { SloDocument } from '../../../../../../common/slo/slo_types';
import { buildBurnRateOption, SloBurnRateChart } from '../slo_burn_rate_chart';

jest.mock('../../../../alerting/echarts_render', () => ({
  EchartsRender: () => null,
}));
jest.mock('echarts', () => ({
  init: jest.fn(() => ({
    setOption: jest.fn(),
    dispose: jest.fn(),
    resize: jest.fn(),
  })),
  graphic: { LinearGradient: jest.fn() },
}));

const mockUsePromQLChartData = jest.fn();
jest.mock('../../../shared/hooks/use_promql_chart_data', () => ({
  usePromQLChartData: (p: unknown) => mockUsePromQLChartData(p),
}));

jest.mock('@osd/ui-shared-deps/theme', () => ({
  euiThemeVars: {
    euiColorSuccess: '#00BFB3',
    euiColorDanger: '#BD271E',
    euiColorWarning: '#F5A700',
    euiColorLightShade: '#D3DAE6',
    euiColorDarkShade: '#69707D',
    euiColorLightestShade: '#F5F7FA',
  },
}));

function baseSlo(): SloDocument {
  return {
    id: 'slo-1',
    spec: {
      datasourceId: 'ds-2',
      name: 'api-availability',
      enabled: true,
      mode: 'active',
      service: 'api',
      owner: { teams: ['sre'] },
      sli: {
        type: 'single',
        definition: {
          backend: 'prometheus',
          type: 'availability',
          calcMethod: 'events',
          metric: 'http_requests_total',
        },
        dimensions: [{ name: 'service', value: 'api' }],
      },
      objectives: [{ name: 'obj-1', target: 0.99 }],
      budgetWarningThresholds: [],
      window: { type: 'rolling', duration: '28d' },
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
          {
            shortWindow: '30m',
            longWindow: '6h',
            burnRateMultiplier: 6,
            severity: 'ticket',
            createAlarm: true,
            forDuration: '15m',
          },
        ],
      },
      alarms: {
        sliHealth: { enabled: false },
        attainmentBreach: { enabled: false },
        budgetWarning: { enabled: true },
        noData: { enabled: false, forDuration: '15m' },
        resolved: { enabled: false },
      },
      exclusionWindows: [],
      labels: {},
      annotations: {},
    },
    status: {
      version: 1,
      createdAt: '2026-01-01T00:00:00Z',
      createdBy: 'me',
      updatedAt: '2026-01-01T00:00:00Z',
      updatedBy: 'me',
      provisioning: {
        backend: 'prometheus',
        alertGroupName: 'rg',
        rulerNamespace: 'ns',
      },
    },
  };
}

const baseProps = {
  prometheusConnectionId: 'prom-1',
  timeRange: { from: 'now-6h', to: 'now' },
  refreshTrigger: 0,
};

describe('buildBurnRateOption', () => {
  it('renders one series per tier with its threshold markLine labeled by severity', () => {
    const opt = buildBurnRateOption({
      tiers: [
        {
          label: 'Page · Quick',
          severity: 'page',
          multiplier: 14,
          color: '#A00',
          data: [[1, 5]],
        },
        {
          label: 'Ticket · Slow',
          severity: 'ticket',
          multiplier: 3,
          color: '#0A0',
          data: [[1, 2]],
        },
      ],
    });
    const seriesList = opt.series as Array<Record<string, unknown>>;
    expect(seriesList).toHaveLength(2);

    const firstMark = seriesList[0].markLine as {
      data: Array<{ yAxis: number }>;
      label: { formatter: string };
    };
    expect(firstMark.data[0].yAxis).toBe(14);
    expect(firstMark.label.formatter).toContain('page');
    expect(firstMark.label.formatter).toContain('14x');

    const secondMark = seriesList[1].markLine as {
      data: Array<{ yAxis: number }>;
      label: { formatter: string };
    };
    expect(secondMark.data[0].yAxis).toBe(3);
    expect(secondMark.label.formatter).toContain('ticket');
  });

  it('uses a log10 yAxis snapped to the next decade above the highest threshold or sample', () => {
    const opt = buildBurnRateOption({
      tiers: [
        {
          label: 'Page · Quick',
          severity: 'page',
          multiplier: 20,
          color: '#A00',
          data: [[1, 5]],
        },
        {
          label: 'Ticket · Slow',
          severity: 'ticket',
          multiplier: 1,
          color: '#0A0',
          data: [[1, 2]],
        },
      ],
    });
    const yAxis = opt.yAxis as {
      type: string;
      logBase: number;
      min: number;
      max: number;
    };
    // Log axis so the 1x / 3x / 14.4x / 20x tiers stay visually separated
    // instead of being crushed near zero by a linear scale dominated by the
    // largest tier.
    expect(yAxis.type).toBe('log');
    expect(yAxis.logBase).toBe(10);
    // Display floor of 0.1x — log axes can't represent zero and burn rates
    // below 0.1x are operationally "quiet".
    expect(yAxis.min).toBe(0.1);
    // 20x threshold is the highest anchor; axis must clear it so the
    // markLine label doesn't render on top of the grid border. Snaps up to
    // the next power of 10 above 20 * 1.25 = 25, i.e. 100.
    expect(yAxis.max).toBe(100);
  });

  it('snaps yAxis to the next decade above the highest sampled value when samples exceed thresholds', () => {
    const opt = buildBurnRateOption({
      tiers: [
        {
          label: 'Page · Quick',
          severity: 'page',
          multiplier: 14,
          color: '#A00',
          // Brief full-breach spike — recording-rule rate can briefly exceed
          // 1/errorBudget so the series outruns the threshold markLine.
          data: [[1, 50]],
        },
      ],
    });
    const yAxis = opt.yAxis as { max: number };
    // 50 * 1.25 = 62.5, next power of 10 is 100.
    expect(yAxis.max).toBe(100);
  });

  it('falls back to a non-zero yAxis max when there is no data and no tiers', () => {
    const opt = buildBurnRateOption({ tiers: [] });
    const yAxis = opt.yAxis as { min: number; max: number };
    expect(yAxis.max).toBeGreaterThan(0);
  });

  it('floors sub-0.1 and zero sample points at the axis floor so the log scale renders them', () => {
    const opt = buildBurnRateOption({
      tiers: [
        {
          label: 'Page · Quick',
          severity: 'page',
          multiplier: 14,
          color: '#A00',
          // Mix: a real signal, a genuine zero, and a sub-floor value. On a
          // log axis only the first would render natively — the other two
          // need to be lifted to Y_AXIS_FLOOR (0.1) or they break the line.
          data: [
            [1, 2],
            [2, 0],
            [3, 0.05],
          ],
        },
      ],
    });
    const seriesList = opt.series as Array<{ data: Array<[number, number, number]> }>;
    expect(seriesList[0].data).toEqual([
      [1, 2, 2],
      [2, 0.1, 0],
      [3, 0.1, 0.05],
    ]);
  });
});

describe('SloBurnRateChart', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the empty-tiers callout when the SLO has no burn-rate config', () => {
    mockUsePromQLChartData.mockReturnValue({
      series: [],
      latestValue: null,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });
    const slo = baseSlo();
    slo.spec.alerting.burnRates = [];
    render(<SloBurnRateChart slo={slo} objective={slo.spec.objectives[0]} {...baseProps} />);
    expect(screen.getByTestId('slosBurnRateEmptyTiers')).toBeInTheDocument();
  });

  it('renders the missing-metric callout when every tier AND the probe return zero samples', () => {
    mockUsePromQLChartData.mockReturnValue({
      series: [],
      latestValue: null,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });
    const slo = baseSlo();
    render(<SloBurnRateChart slo={slo} objective={slo.spec.objectives[0]} {...baseProps} />);
    expect(screen.getByTestId('slosBurnRateMissingMetric')).toBeInTheDocument();
  });

  it('renders the empty-window callout when the probe sees samples but the tiers do not', () => {
    // Return stable refs to avoid TierFetcher's onChange-driven loop: every
    // call returns the same frozen `emptyResult` for tier fetches, and the
    // probe (identified by its `count(...)` query prefix) gets a pre-frozen
    // `probeResult`. Stable references prevent useMemo from re-running.
    const emptyResult = Object.freeze({
      series: [] as never[],
      latestValue: null,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });
    const probeResult = Object.freeze({
      series: [{ name: 'probe', data: [{ timestamp: 1, value: 1 }], color: '#000' }],
      latestValue: 1,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });
    mockUsePromQLChartData.mockImplementation((p: { promqlQuery: string }) =>
      p.promqlQuery.startsWith('count(') ? probeResult : emptyResult
    );
    const slo = baseSlo();
    render(<SloBurnRateChart slo={slo} objective={slo.spec.objectives[0]} {...baseProps} />);
    expect(screen.getByTestId('slosBurnRateEmpty')).toBeInTheDocument();
  });
});

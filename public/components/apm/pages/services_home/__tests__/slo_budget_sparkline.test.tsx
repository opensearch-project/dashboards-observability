/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for the aggregate error-ratio sparkline on Services Home. Mocks
 * `usePromQLChartData` so the render paths (loading / empty / error / data)
 * are driven by the hook's return shape without touching a real Prometheus.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { buildAggregateErrorRatioQuery, SloBudgetSparkline } from '../slo_budget_sparkline';
import type { UsePromQLChartDataResult } from '../../../shared/hooks/use_promql_chart_data';

// Stub the PromQL hook so the component's branches are directly selectable
// from the test harness. Variable name must be `mock`-prefixed to satisfy
// jest's hoist-safety guard (module factories can't reference out-of-scope
// vars unless named `mock*`).
const mockHookState: { current: UsePromQLChartDataResult } = {
  current: {
    series: [],
    latestValue: null,
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  },
};

jest.mock('../../../shared/hooks/use_promql_chart_data', () => ({
  usePromQLChartData: () => mockHookState.current,
}));

// Avoid pulling in real echarts (jsdom-incompatible canvas) from the
// shared EchartsRender. Render a sentinel div so the test can assert on
// presence.
jest.mock('../../../../alerting/echarts_render', () => ({
  EchartsRender: ({ height }: { height: number }) => (
    <div data-test-subj="mockEchartsRender" style={{ height }} />
  ),
}));

function setHook(next: Partial<UsePromQLChartDataResult>): void {
  mockHookState.current = {
    series: [],
    latestValue: null,
    isLoading: false,
    error: null,
    refetch: jest.fn(),
    ...next,
  };
}

describe('buildAggregateErrorRatioQuery', () => {
  it('returns null on empty services list (nothing to plot)', () => {
    expect(buildAggregateErrorRatioQuery([])).toBeNull();
  });

  it('builds an avg-by PromQL expression pinned to the 3d recording rules', () => {
    // The query is datasource-wide by design (phase-3 dedup strips identity
    // labels); the services arg only gates whether we render at all.
    const q = buildAggregateErrorRatioQuery(['cart', 'frontend'])!;
    expect(q).toContain('avg by ()');
    expect(q).toContain('__name__=~"slo:sli_error:ratio_rate_3d:.+"');
    // Should NOT try to filter by service — no such label on recording rules.
    expect(q).not.toContain('slo_service=');
  });
});

describe('SloBudgetSparkline', () => {
  beforeEach(() => {
    setHook({});
  });

  it('renders nothing when services are empty (no query to build)', () => {
    const { container } = render(
      <SloBudgetSparkline services={[]} prometheusConnectionId="ds-prom" />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when datasource id is empty', () => {
    const { container } = render(
      <SloBudgetSparkline services={['cart']} prometheusConnectionId="" />
    );
    expect(container.firstChild).toBeNull();
  });

  it('reserves space and shows loading skeleton while the hook is pending', () => {
    setHook({ isLoading: true });
    render(<SloBudgetSparkline services={['cart']} prometheusConnectionId="ds-prom" />);
    expect(screen.getByTestId('sloBudgetSparkline')).toBeInTheDocument();
    expect(screen.getByTestId('sloBudgetSparklineLoading')).toBeInTheDocument();
  });

  it('silently omits on fetch error — no layout shift, no callout', () => {
    setHook({ error: new Error('boom') });
    const { container } = render(
      <SloBudgetSparkline services={['cart']} prometheusConnectionId="ds-prom" />
    );
    expect(container.firstChild).toBeNull();
  });

  it('silently omits when the query succeeds but returns zero points', () => {
    setHook({ series: [{ name: '', data: [], color: '' }] });
    const { container } = render(
      <SloBudgetSparkline services={['cart']} prometheusConnectionId="ds-prom" />
    );
    expect(container.firstChild).toBeNull();
    // Caption should not render when the sparkline itself is absent —
    // otherwise it's a floating orphan.
    expect(screen.queryByTestId('sloBudgetSparklineScopeCaption')).not.toBeInTheDocument();
  });

  it('renders the label, chart, and scope caption when data is present', () => {
    setHook({
      series: [
        {
          name: '',
          color: '',
          data: [
            { timestamp: 1000, value: 0.01 },
            { timestamp: 2000, value: 0.02 },
          ],
        },
      ],
    });
    render(<SloBudgetSparkline services={['cart']} prometheusConnectionId="ds-prom" />);
    expect(screen.getByText('Aggregate error ratio (7d)')).toBeInTheDocument();
    expect(screen.getByTestId('mockEchartsRender')).toBeInTheDocument();
    expect(screen.getByTestId('sloBudgetSparklineScopeCaption')).toHaveTextContent(
      '7d error-ratio trend across all services in this datasource'
    );
  });
});

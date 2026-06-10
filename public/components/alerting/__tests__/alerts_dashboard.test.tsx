/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, fireEvent, screen, within } from '@testing-library/react';

jest.mock('echarts', () => ({
  init: jest.fn(() => ({
    setOption: jest.fn(),
    resize: jest.fn(),
    dispose: jest.fn(),
  })),
  graphic: { LinearGradient: jest.fn() },
}));

global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  disconnect: jest.fn(),
  unobserve: jest.fn(),
}));

// Spy on AlertTimeline so we can assert the resolved startMs/endMs values
// flow through as numeric props (rather than the picker's date-math strings).
const mockTimeline = jest.fn();
jest.mock('../alerts_charts', () => ({
  AlertTimeline: (props: { alerts: unknown[]; startMs: number; endMs: number }) => {
    mockTimeline(props);
    return <div data-test-subj="alertTimelineStub" />;
  },
}));

import { AlertsDashboard } from '../alerts_dashboard';
import type { UnifiedAlertSummary, Datasource } from '../../../../common/types/alerting';

const sampleAlert: UnifiedAlertSummary = {
  id: 'a-1',
  datasourceId: 'ds-1',
  datasourceType: 'opensearch',
  name: 'HighCPU',
  state: 'active',
  severity: 'critical',
  startTime: new Date().toISOString(),
  lastUpdated: new Date().toISOString(),
  labels: {},
  annotations: {},
};

function buildAnomaly(overrides: Partial<UnifiedAlertSummary> = {}): UnifiedAlertSummary {
  return {
    id: 'ad-1',
    datasourceId: 'ds-1',
    datasourceType: 'opensearch',
    findingType: 'anomaly',
    name: 'test - DestCityName=London',
    state: 'active',
    severity: 'high',
    message: 'Anomaly grade 0.88, score 1.23 (test=90)',
    startTime: '2026-06-04T22:03:00.000Z',
    lastUpdated: '2026-06-04T22:04:00.000Z',
    labels: {
      detector_id: 'detector-1',
      detector_name: 'test',
      entity: 'DestCityName=London',
    },
    annotations: {
      anomaly_grade: '0.88',
      confidence: '0.95',
      feature_data: 'test=90',
    },
    ...overrides,
  };
}

const sampleDs: Datasource = {
  id: 'ds-1',
  name: 'Local',
  type: 'opensearch',
  url: '',
  enabled: true,
};

const HOUR_MS = 60 * 60 * 1000;
const NOW = Date.now();

const baseProps = {
  alerts: [] as UnifiedAlertSummary[],
  datasources: [sampleDs],
  loading: false,
  onViewDetail: jest.fn(),
  onAcknowledge: jest.fn(),
  selectedDsIds: ['ds-1'],
  onDatasourceChange: jest.fn(),
  maxDatasources: 5,
  onDatasourceCapReached: jest.fn(),
  rulesTotal: 1,
  defaultDatasources: [],
  onGoToRules: jest.fn(),
  startMs: NOW - HOUR_MS,
  endMs: NOW,
  pickerStart: 'now-24h',
  pickerEnd: 'now',
  onTimeChange: jest.fn(),
  onRefresh: jest.fn(),
};

beforeEach(() => {
  mockTimeline.mockClear();
});

describe('AlertsDashboard', () => {
  it('renders "no alerts in range" empty state when rules exist but no alerts', () => {
    const { getByText } = render(<AlertsDashboard {...baseProps} />);
    expect(getByText('No alerts in the selected time range')).toBeInTheDocument();
  });

  it('renders "no datasource" empty state when selection is empty', () => {
    const { getByText } = render(<AlertsDashboard {...baseProps} selectedDsIds={[]} />);
    expect(getByText('No datasource selected')).toBeInTheDocument();
  });

  it('renders "no rules or detectors" empty state when rulesTotal is 0', () => {
    const { getByText } = render(<AlertsDashboard {...baseProps} rulesTotal={0} />);
    expect(getByText('No rules or detectors have been created')).toBeInTheDocument();
  });

  it('renders alert table when alerts provided', () => {
    const { getByText } = render(<AlertsDashboard {...baseProps} alerts={[sampleAlert]} />);
    expect(getByText('HighCPU')).toBeInTheDocument();
  });

  it('groups anomalies by detector and entity in the alerts table', () => {
    const onViewDetail = jest.fn();
    render(
      <AlertsDashboard
        {...baseProps}
        onViewDetail={onViewDetail}
        alerts={[
          buildAnomaly({
            id: 'ad-older',
            startTime: '2026-06-04T21:03:00.000Z',
            lastUpdated: '2026-06-04T21:04:00.000Z',
            annotations: {
              anomaly_grade: '1',
              confidence: '0.42',
              feature_data: 'test=45',
            },
          }),
          buildAnomaly({
            id: 'ad-latest',
            startTime: '2026-06-04T22:03:00.000Z',
            lastUpdated: '2026-06-04T22:13:00.000Z',
          }),
        ]}
      />
    );

    expect(screen.getByText('test - DestCityName: London')).toBeInTheDocument();
    expect(screen.getByText('2 occurrences')).toBeInTheDocument();
    expect(screen.getAllByText('anomaly').length).toBeGreaterThan(0);
    expect(screen.getByText('1 row')).toBeInTheDocument();
    expect(screen.getByText('2 alerts grouped')).toBeInTheDocument();

    fireEvent.click(screen.getByText('test - DestCityName: London'));
    expect(screen.getByText('Occurrence 2 of 2')).toBeInTheDocument();
    expect(screen.getByText('Occurrence 1 of 2')).toBeInTheDocument();
    expect(screen.queryByText('Latest')).not.toBeInTheDocument();
    expect(screen.getAllByText('10m').length).toBeGreaterThan(0);
    expect(onViewDetail).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Occurrence 1 of 2'));
    expect(onViewDetail).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'ad-older' }));
  });

  it('shows anomalies as anomaly in the State facet instead of active', () => {
    render(<AlertsDashboard {...baseProps} alerts={[sampleAlert, buildAnomaly()]} />);

    const stateFacet = within(screen.getByTestId('facetGroup-state'));
    expect(stateFacet.getByText('active')).toBeInTheDocument();
    expect(stateFacet.getByText('anomaly')).toBeInTheDocument();
    expect(stateFacet.getAllByText('(1)')).toHaveLength(2);

    fireEvent.click(stateFacet.getByLabelText(/anomaly/));

    expect(screen.queryByText('HighCPU')).not.toBeInTheDocument();
    expect(screen.getByText('test - DestCityName=London')).toBeInTheDocument();
    expect(screen.getByText('1 filter')).toBeInTheDocument();
  });

  it('renders timeline title without the (24h) suffix', () => {
    const { getByText, queryByText } = render(
      <AlertsDashboard {...baseProps} alerts={[sampleAlert]} />
    );
    expect(getByText('Alerts timeline')).toBeInTheDocument();
    expect(queryByText('Alerts timeline (24h)')).not.toBeInTheDocument();
  });

  it('forwards numeric startMs/endMs to AlertTimeline (not the date-math strings)', () => {
    render(<AlertsDashboard {...baseProps} alerts={[sampleAlert]} />);
    expect(mockTimeline).toHaveBeenCalled();
    const lastCall = mockTimeline.mock.calls[mockTimeline.mock.calls.length - 1][0];
    expect(lastCall.startMs).toBe(NOW - HOUR_MS);
    expect(lastCall.endMs).toBe(NOW);
  });

  it('renders the truncated callout when `truncated` is true', () => {
    const { getByTestId } = render(
      <AlertsDashboard {...baseProps} alerts={[sampleAlert]} truncated />
    );
    expect(getByTestId('alertsTruncatedCallout')).toBeInTheDocument();
  });

  it('does not render the truncated callout when `truncated` is false/undefined', () => {
    const { queryByTestId } = render(<AlertsDashboard {...baseProps} alerts={[sampleAlert]} />);
    expect(queryByTestId('alertsTruncatedCallout')).not.toBeInTheDocument();
  });

  it('anchors alertManagerDatePicker on a real DOM element (regression: EuiSuperDatePicker drops data-test-subj)', () => {
    // EuiSuperDatePicker doesn't forward arbitrary DOM attributes to its
    // rendered control, so a `data-test-subj` prop on the picker itself is
    // silently discarded. The wrapper div lives one level above the picker
    // so Cypress / functional selectors resolve regardless of EUI's prop
    // forwarding behavior.
    const { container } = render(<AlertsDashboard {...baseProps} alerts={[sampleAlert]} />);
    const anchor = container.querySelector('[data-test-subj="alertManagerDatePicker"]');
    expect(anchor).not.toBeNull();
    expect(anchor!.tagName).toBe('DIV');
    // The picker control itself should be a descendant of the anchor.
    expect(anchor!.querySelector('.euiSuperDatePicker')).not.toBeNull();
  });

  it('renders the fallback callout listing each fallback datasource', () => {
    const { getByTestId, getByText } = render(
      <AlertsDashboard
        {...baseProps}
        alerts={[sampleAlert]}
        fallbackHints={[
          { datasourceName: 'prom-prod', fallback: 'prometheus-alerts-current-only' },
        ]}
      />
    );
    expect(getByTestId('alertsFallbackCallout')).toBeInTheDocument();
    expect(getByText('prom-prod')).toBeInTheDocument();
  });

  it('does not render the fallback callout when `fallbackHints` is empty', () => {
    const { queryByTestId } = render(
      <AlertsDashboard {...baseProps} alerts={[sampleAlert]} fallbackHints={[]} />
    );
    expect(queryByTestId('alertsFallbackCallout')).not.toBeInTheDocument();
  });

  // Regression: deselecting all datasources must wipe both the dependent
  // facet selections AND the search box. The Rules tab does this in
  // monitors_table/index.tsx#clearAllFilters; the cascade-clear behavior
  // should match across tabs.
  it('clears the search box when all datasources are deselected', () => {
    const onDatasourceChange = jest.fn();
    render(
      <AlertsDashboard
        {...baseProps}
        alerts={[sampleAlert]}
        onDatasourceChange={onDatasourceChange}
      />
    );

    const searchInput = screen.getByLabelText('Search alerts') as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: 'HighCPU' } });
    expect(searchInput.value).toBe('HighCPU');

    // Uncheck the only selected datasource — drives onChange([]) which
    // routes through clearDependentFilters in the dashboard.
    fireEvent.click(screen.getByLabelText(/Local/));

    expect(onDatasourceChange).toHaveBeenCalledWith([]);
    expect(searchInput.value).toBe('');
  });
});

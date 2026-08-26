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
    alertKind: 'anomaly',
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

const samplePrometheusDs: Datasource = {
  id: 'prometheus-1',
  name: 'Prometheus',
  type: 'prometheus',
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
  onCreateLogsRule: jest.fn(),
  onCreateMetricsRule: jest.fn(),
  onCreateAnomalyDetection: jest.fn(),
  onCreateForecasting: jest.fn(),
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
    expect(
      getByText('No alerts or anomalies were detected in the selected time range.')
    ).toBeInTheDocument();
  });

  it('renders "no datasource" empty state when selection is empty', () => {
    const { getByText } = render(<AlertsDashboard {...baseProps} selectedDsIds={[]} />);
    expect(
      getByText('Define rules, detect anomalies, and forecast from one place')
    ).toBeInTheDocument();
    expect(getByText('Alerting')).toBeInTheDocument();
    expect(getByText('Anomaly detection')).toBeInTheDocument();
    expect(getByText('Forecasting')).toBeInTheDocument();
    expect(
      getByText('Select a datasource to view alerts and detected anomalies.')
    ).toBeInTheDocument();
  });

  it('offers logs and metrics creation from the Alerting capability card', () => {
    const onCreateLogsRule = jest.fn();
    const onCreateMetricsRule = jest.fn();
    const onCreateAnomalyDetection = jest.fn();
    const onCreateForecasting = jest.fn();
    const { getByText } = render(
      <AlertsDashboard
        {...baseProps}
        datasources={[sampleDs, samplePrometheusDs]}
        selectedDsIds={[]}
        onCreateLogsRule={onCreateLogsRule}
        onCreateMetricsRule={onCreateMetricsRule}
        onCreateAnomalyDetection={onCreateAnomalyDetection}
        onCreateForecasting={onCreateForecasting}
      />
    );

    fireEvent.click(getByText('Alerting'));
    expect(screen.getByTestId('alertsEmptyAlertingRuleTypeModal')).toBeInTheDocument();
    expect(document.querySelectorAll('.euiOverlayMask, .ouiOverlayMask')).toHaveLength(1);
    fireEvent.click(screen.getByTestId('alertsEmptyCreateLogsRule'));
    expect(onCreateLogsRule).toHaveBeenCalledTimes(1);

    fireEvent.click(getByText('Alerting'));
    fireEvent.click(screen.getByTestId('alertsEmptyCreateMetricsRule'));
    expect(onCreateMetricsRule).toHaveBeenCalledTimes(1);

    fireEvent.click(getByText('Anomaly detection'));
    expect(onCreateAnomalyDetection).toHaveBeenCalledTimes(1);

    fireEvent.click(getByText('Forecasting'));
    expect(onCreateForecasting).toHaveBeenCalledTimes(1);
  });

  it('disables Metrics creation when no Prometheus datasource is available', () => {
    const onCreateMetricsRule = jest.fn();
    render(
      <AlertsDashboard
        {...baseProps}
        selectedDsIds={[]}
        onCreateMetricsRule={onCreateMetricsRule}
      />
    );

    fireEvent.click(screen.getByText('Alerting'));

    const metricsCard = screen.getByTestId('alertsEmptyCreateMetricsRule');
    expect(metricsCard).toHaveClass('euiCard-isDisabled');
    expect(
      screen.getByText('A Prometheus datasource is required to create a metrics alert rule.')
    ).toBeInTheDocument();

    fireEvent.click(metricsCard);
    expect(onCreateMetricsRule).not.toHaveBeenCalled();
  });

  it('disables AD and Forecasting cards when no standard OpenSearch datasource is available', () => {
    const onCreateAnomalyDetection = jest.fn();
    const onCreateForecasting = jest.fn();
    const unavailableDatasources: Datasource[] = [
      {
        id: 'aoss-1',
        name: 'OpenSearch Serverless',
        type: 'opensearch',
        url: '',
        enabled: true,
        engineType: 'OpenSearch Serverless',
      },
      {
        id: 'prometheus-1',
        name: 'Prometheus',
        type: 'prometheus',
        url: '',
        enabled: true,
      },
    ];

    render(
      <AlertsDashboard
        {...baseProps}
        datasources={unavailableDatasources}
        selectedDsIds={[]}
        onCreateAnomalyDetection={onCreateAnomalyDetection}
        onCreateForecasting={onCreateForecasting}
      />
    );

    const anomalyCard = screen.getByTestId('alertsEmptyCreateAnomalyDetection');
    const forecastingCard = screen.getByTestId('alertsEmptyCreateForecasting');
    expect(anomalyCard).toHaveClass('euiCard-isDisabled');
    expect(forecastingCard).toHaveClass('euiCard-isDisabled');
    expect(
      screen.getByText('An OpenSearch datasource is required to create an anomaly detection rule.')
    ).toBeInTheDocument();
    expect(
      screen.getByText('An OpenSearch datasource is required to create a forecasting rule.')
    ).toBeInTheDocument();

    fireEvent.click(anomalyCard);
    fireEvent.click(forecastingCard);
    expect(onCreateAnomalyDetection).not.toHaveBeenCalled();
    expect(onCreateForecasting).not.toHaveBeenCalled();
  });

  it('renders "no rules or detectors" empty state when rulesTotal is 0', () => {
    const { getByText } = render(<AlertsDashboard {...baseProps} rulesTotal={0} />);
    expect(
      getByText('Define rules, detect anomalies, and forecast from one place')
    ).toBeInTheDocument();
    expect(
      getByText(
        'Create an alerting, anomaly detection, or forecasting rule for the selected datasource.'
      )
    ).toBeInTheDocument();
    expect(
      getByText(
        'Create a rule to get started. Triggered alerts and detected anomalies will appear here.'
      )
    ).toBeInTheDocument();
    expect(getByText('Go to Rules')).toBeInTheDocument();
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

  it('filters by alert type and hides noisy anomaly label keys', () => {
    render(
      <AlertsDashboard
        {...baseProps}
        alerts={[
          sampleAlert,
          buildAnomaly({
            labels: {
              detector_id: 'detector-1',
              detector_name: 'test',
              entity: 'DestCityName=London',
              anomaly_result_id: 'result-1',
              source: 'anomaly_detection',
            },
          }),
        ]}
      />
    );

    const typeFacet = within(screen.getByTestId('facetGroup-type'));
    expect(typeFacet.getByText('alert')).toBeInTheDocument();
    expect(typeFacet.getByText('anomaly')).toBeInTheDocument();

    expect(screen.queryByText('anomaly_result_id')).not.toBeInTheDocument();
    expect(screen.queryByText('detector_id')).not.toBeInTheDocument();
    expect(screen.queryByText('source')).not.toBeInTheDocument();

    fireEvent.click(typeFacet.getByLabelText(/anomaly/));

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

  // The former inline "truncated" and "fallback" EuiCallOuts have been
  // migrated to page-level toasts (see useAlertingPageToasts). They are
  // no longer part of AlertsDashboard's render output — the corresponding
  // callout render tests were removed.

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

  // Fallback callout render tests removed — see comment above.

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

  // B1 / A11Y1 + CLAR2: severity must be conveyed by a labeled indicator
  // (translated text), not a bare color dot. Reverting to the dot removes the
  // human-readable "Critical" text and this fails.
  it('renders severity as a labeled badge, not a bare color dot', () => {
    render(<AlertsDashboard {...baseProps} alerts={[sampleAlert]} />);
    const badge = screen.getByTestId('alertSeverityBadge');
    expect(badge).toHaveTextContent('Critical');
    // The raw lowercase wire enum must not leak into the table cell.
    expect(badge).not.toHaveTextContent('critical');
  });

  // CLAR2: the State column routes the raw enum through getStateLabel, so it
  // reads "Active" rather than the lowercase wire value `active`.
  it('renders the alert state as a human label in the table', () => {
    render(<AlertsDashboard {...baseProps} alerts={[sampleAlert]} />);
    // The facet still lists the raw `active` option; the table cell shows "Active".
    const table = within(screen.getByRole('table'));
    expect(table.getByText('Active')).toBeInTheDocument();
  });

  // CLAR4: a single empty placeholder (EMPTY_VALUE = '—') everywhere. The old
  // Started-cell glyph was '---'; reintroducing it fails this test.
  it('uses a single unified empty placeholder and never the legacy --- glyph', () => {
    const emptyAlert: UnifiedAlertSummary = {
      ...sampleAlert,
      id: 'empty-1',
      name: 'EmptyFields',
      message: undefined,
      startTime: '',
      lastUpdated: '',
    };
    render(<AlertsDashboard {...baseProps} alerts={[emptyAlert]} />);
    const table = within(screen.getByRole('table'));
    // Message, Started, and Duration cells all collapse to the em dash.
    expect(table.getAllByText('—').length).toBeGreaterThan(0);
    // The legacy triple-hyphen glyph must be gone.
    expect(table.queryByText('---')).toBeNull();
  });

  // A11Y4: the grouped-anomaly expand toggle exposes its state via
  // aria-expanded, and flips it on toggle.
  it('sets aria-expanded on the anomaly occurrences toggle in both states', () => {
    render(
      <AlertsDashboard
        {...baseProps}
        alerts={[
          buildAnomaly({ id: 'ad-a', startTime: '2026-06-04T21:03:00.000Z' }),
          buildAnomaly({ id: 'ad-b', startTime: '2026-06-04T22:03:00.000Z' }),
        ]}
      />
    );
    const toggle = screen.getByLabelText('Show or hide grouped anomaly occurrences');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(screen.getByLabelText('Show or hide grouped anomaly occurrences')).toHaveAttribute(
      'aria-expanded',
      'true'
    );
  });

  // OBS1: a deep link (`#/alerts?q=...`) seeds the search box on first render,
  // and the user can still type over it afterwards.
  it('seeds the search box from initialSearchQuery without blocking later input', () => {
    render(<AlertsDashboard {...baseProps} alerts={[sampleAlert]} initialSearchQuery="HighCPU" />);
    const searchInput = screen.getByLabelText('Search alerts') as HTMLInputElement;
    expect(searchInput.value).toBe('HighCPU');
    // Seeded query actually filters the table down to the match.
    expect(screen.getByText('HighCPU')).toBeInTheDocument();
    // Subsequent typing is honored — the seed does not re-apply and overwrite it.
    fireEvent.change(searchInput, { target: { value: 'something-else' } });
    expect(searchInput.value).toBe('something-else');
  });
});

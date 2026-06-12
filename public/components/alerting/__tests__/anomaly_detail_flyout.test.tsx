/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { AnomalyDetailFlyout } from '../anomaly_detail_flyout';
import type { Datasource, UnifiedAlertSummary } from '../../../../common/types/alerting';

jest.mock('plotly.js-dist', () => ({}));

jest.mock('react-plotly.js/factory', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  return () => (props: { layout?: { height?: number | string } }) =>
    react.createElement(
      'div',
      { 'data-test-subj': 'mockPlotlyChart' },
      `plotly ${props.layout?.height || ''}`
    );
});

jest.mock('@elastic/charts', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  return {
    Axis: () => react.createElement('div', { 'data-test-subj': 'mockElasticAxis' }),
    Chart: ({ children }: { children?: React.ReactNode }) =>
      react.createElement('div', { 'data-test-subj': 'mockElasticChart' }, children),
    LineSeries: () => react.createElement('div', { 'data-test-subj': 'mockElasticLineSeries' }),
    RectAnnotation: () =>
      react.createElement('div', { 'data-test-subj': 'mockElasticRectAnnotation' }),
    Settings: () => react.createElement('div', { 'data-test-subj': 'mockElasticSettings' }),
    niceTimeFormatter: () => () => '',
    Position: { Right: 'right' },
    ScaleType: { Linear: 'linear', Time: 'time' },
  };
});

const datasource: Datasource = {
  id: 'local',
  name: 'local_cluster',
  type: 'opensearch',
  url: 'https://localhost:9200',
  enabled: true,
};

function buildAnomaly(overrides: Partial<UnifiedAlertSummary> = {}): UnifiedAlertSummary {
  return {
    id: 'anomaly-1',
    name: 'test - DestCityName=Seoul',
    monitorId: 'detector-1',
    datasourceId: 'local',
    datasourceType: 'opensearch',
    severity: 'critical',
    state: 'active',
    message: 'Anomaly grade 1.00, score 7.81',
    startTime: '2026-06-04T20:00:00.000Z',
    lastUpdated: '2026-06-04T20:01:00.000Z',
    alertKind: 'anomaly',
    labels: {
      detector_id: 'detector-1',
      detector_name: 'test',
      entity: 'DestCityName=Seoul',
    },
    annotations: {
      anomaly_grade: '1',
      anomaly_score: '7.81',
      confidence: '0.92',
      feature_data: 'test=180',
    },
    ...overrides,
  };
}

describe('AnomalyDetailFlyout', () => {
  it('exports the flyout component', () => {
    expect(AnomalyDetailFlyout).toEqual(expect.any(Function));
  });

  it('renders high-cardinality anomaly context', () => {
    render(
      <AnomalyDetailFlyout
        anomaly={buildAnomaly()}
        datasources={[datasource]}
        allAlerts={[
          buildAnomaly(),
          buildAnomaly({
            id: 'anomaly-2',
            name: 'test - DestCityName=Osaka',
            labels: {
              detector_id: 'detector-1',
              detector_name: 'test',
              entity: 'DestCityName=Osaka',
            },
          }),
          buildAnomaly({
            id: 'anomaly-3',
            startTime: '2026-06-04T20:10:00.000Z',
            lastUpdated: '2026-06-04T20:11:00.000Z',
          }),
        ]}
        onClose={jest.fn()}
      />
    );

    expect(screen.getByText('Anomaly overview')).toBeInTheDocument();
    expect(
      screen.getByText('Other detector anomalies are muted; the selected anomaly is highlighted.')
    ).toBeInTheDocument();
    expect(screen.getByText('Feature breakdown')).toBeInTheDocument();
    expect(screen.getByText('Selected occurrence')).toBeInTheDocument();
    expect(screen.getByText('1 of 2')).toBeInTheDocument();
    expect(screen.getAllByTestId('mockPlotlyChart')).toHaveLength(1);
    expect(screen.getAllByTestId('mockElasticChart')).toHaveLength(2);
  });

  it('renders single-stream anomalies without the heatmap context', () => {
    render(
      <AnomalyDetailFlyout
        anomaly={buildAnomaly({
          name: 'sample-host-health-detector',
          labels: {
            detector_id: 'detector-2',
            detector_name: 'sample-host-health-detector',
          },
        })}
        datasources={[datasource]}
        allAlerts={[]}
        onClose={jest.fn()}
      />
    );

    expect(screen.getByText('sample-host-health-detector - Single stream')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Single-stream detector view for anomaly grade and confidence around the selected anomaly.'
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Other detector anomalies are muted; the selected anomaly is highlighted.')
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('mockPlotlyChart')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('mockElasticChart')).toHaveLength(2);
  });
});

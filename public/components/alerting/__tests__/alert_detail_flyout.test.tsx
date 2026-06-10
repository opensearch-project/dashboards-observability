/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, fireEvent, render } from '@testing-library/react';

// Flyout doesn't use echarts directly, but some transitive imports from
// shared_constants / child components can reach it — stub for safety.
jest.mock('echarts', () => ({
  init: jest.fn(() => ({
    setOption: jest.fn(),
    resize: jest.fn(),
    dispose: jest.fn(),
  })),
}));

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

global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  disconnect: jest.fn(),
  unobserve: jest.fn(),
}));

// AlertDetailFlyout instantiates AlertingOpenSearchService internally via
// `useMemo(() => new AlertingOpenSearchService(), [])`. The flyout no
// longer fetches detail eagerly — `getAlertDetail` only fires when the
// Raw Alert Data accordion expands. Mock both methods so the
// constructor returns a stubbed instance and any lazy fetch resolves
// without hitting the real HTTP transport.
const mockGetAlertDetail = jest.fn().mockResolvedValue(null);
jest.mock('../query_services/alerting_opensearch_service', () => ({
  AlertingOpenSearchService: jest.fn().mockImplementation(() => ({
    getAlertDetail: mockGetAlertDetail,
  })),
}));

import { AlertDetailFlyout } from '../alert_detail_flyout';
import type { Datasource, UnifiedAlertSummary } from '../../../../common/types/alerting';

const baseAlert: UnifiedAlertSummary = {
  id: 'alert-42',
  datasourceId: 'ds-prom',
  datasourceType: 'opensearch',
  name: 'HighErrorRate',
  state: 'active',
  severity: 'critical',
  message: 'Error rate above threshold',
  startTime: new Date(Date.now() - 5 * 60_000).toISOString(),
  lastUpdated: new Date().toISOString(),
  labels: { team: 'infra', service: 'api-gateway' },
  annotations: { summary: 'Error rate above threshold' },
};

const datasources: Datasource[] = [
  {
    id: 'ds-prom',
    name: 'my-prom',
    type: 'prometheus',
    url: 'http://prom',
    enabled: true,
  },
];

describe('AlertDetailFlyout', () => {
  it('smoke renders with the alert name, severity, and datasource label', () => {
    const { getByText, getAllByText } = render(
      <AlertDetailFlyout
        alert={baseAlert}
        datasources={datasources}
        onClose={jest.fn()}
        onAcknowledge={jest.fn()}
      />
    );
    expect(getByText('HighErrorRate')).toBeInTheDocument();
    expect(getByText('OpenSearch')).toBeInTheDocument();
    // Message appears both in the header and as the `summary` annotation below.
    expect(getAllByText('Error rate above threshold').length).toBeGreaterThan(0);
  });

  it('invokes onClose when the footer close button is clicked', () => {
    const onClose = jest.fn();
    const { getByText } = render(
      <AlertDetailFlyout
        alert={baseAlert}
        datasources={datasources}
        onClose={onClose}
        onAcknowledge={jest.fn()}
      />
    );
    fireEvent.click(getByText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('invokes onAcknowledge for an active OpenSearch alert when the Acknowledge button is clicked', () => {
    const onAcknowledge = jest.fn();
    const { getByText } = render(
      <AlertDetailFlyout
        alert={baseAlert}
        datasources={datasources}
        onClose={jest.fn()}
        onAcknowledge={onAcknowledge}
      />
    );
    fireEvent.click(getByText('Acknowledge'));
    expect(onAcknowledge).toHaveBeenCalledWith('alert-42');
  });

  it('renders associated anomaly detail content when a detector alert is linked to an anomaly', () => {
    const relatedAnomaly: UnifiedAlertSummary = {
      id: 'anomaly-42',
      datasourceId: 'ds-prom',
      datasourceType: 'opensearch',
      alertKind: 'anomaly',
      name: 'test - DestCityName=Zurich',
      state: 'active',
      severity: 'critical',
      message: 'Anomaly grade 1.00, score 7.81 (test=180)',
      startTime: '2026-06-04T20:00:00.000Z',
      lastUpdated: '2026-06-04T20:01:00.000Z',
      labels: {
        detector_id: 'detector-1',
        detector_name: 'test',
        entity: 'DestCityName=Zurich',
      },
      annotations: {
        anomaly_grade: '1',
        anomaly_score: '7.81',
        confidence: '0.92',
        feature_data: 'test=180',
      },
    };
    const { getByText, getAllByTestId } = render(
      <AlertDetailFlyout
        alert={{ ...baseAlert, relatedAnomaly }}
        datasources={datasources}
        onClose={jest.fn()}
        onAcknowledge={jest.fn()}
      />
    );

    expect(getByText('Associated anomaly')).toBeInTheDocument();
    expect(getByText('Detector result context')).toBeInTheDocument();
    expect(
      getByText('Other detector anomalies are muted; the selected anomaly is highlighted.')
    ).toBeInTheDocument();
    expect(getByText('Feature breakdown')).toBeInTheDocument();
    expect(getAllByTestId('mockPlotlyChart')).toHaveLength(1);
    expect(getAllByTestId('mockElasticChart')).toHaveLength(2);
  });

  it('disables the Acknowledge button for Prometheus alerts', () => {
    const onAcknowledge = jest.fn();
    const promAlert = { ...baseAlert, datasourceType: 'prometheus' as const };
    const { getByText } = render(
      <AlertDetailFlyout
        alert={promAlert}
        datasources={datasources}
        onClose={jest.fn()}
        onAcknowledge={onAcknowledge}
      />
    );
    const btn = getByText('Acknowledge').closest('button');
    expect(btn).not.toBeNull();
    expect(btn?.disabled).toBe(true);
    expect(btn && btn.disabled).toBe(true);
    fireEvent.click(getByText('Acknowledge'));
    expect(onAcknowledge).not.toHaveBeenCalled();
  });

  describe('lazy detail fetch', () => {
    beforeEach(() => {
      mockGetAlertDetail.mockClear();
    });

    it('does not call getAlertDetail when the flyout opens', () => {
      render(
        <AlertDetailFlyout
          alert={baseAlert}
          datasources={datasources}
          onClose={jest.fn()}
          onAcknowledge={jest.fn()}
        />
      );
      expect(mockGetAlertDetail).not.toHaveBeenCalled();
    });

    it('calls getAlertDetail with monitorId when the Raw Alert Data accordion expands', () => {
      const alertWithMonitor: UnifiedAlertSummary = { ...baseAlert, monitorId: 'mon-7' };
      const { getByText } = render(
        <AlertDetailFlyout
          alert={alertWithMonitor}
          datasources={datasources}
          onClose={jest.fn()}
          onAcknowledge={jest.fn()}
        />
      );
      // Accordion buttons toggle on click; clicking the label expands it.
      fireEvent.click(getByText('Raw Alert Data'));
      expect(mockGetAlertDetail).toHaveBeenCalledTimes(1);
      expect(mockGetAlertDetail).toHaveBeenCalledWith('ds-prom', 'alert-42', 'mon-7');
    });

    it('does not refetch when the Raw Alert Data accordion is collapsed and re-expanded', async () => {
      const rawDetail = {
        ...baseAlert,
        monitorId: 'mon-7',
        raw: { id: 'alert-42', state: 'ACTIVE' },
      };
      mockGetAlertDetail.mockResolvedValueOnce(rawDetail);
      const alertWithMonitor: UnifiedAlertSummary = { ...baseAlert, monitorId: 'mon-7' };
      const { getByText } = render(
        <AlertDetailFlyout
          alert={alertWithMonitor}
          datasources={datasources}
          onClose={jest.fn()}
          onAcknowledge={jest.fn()}
        />
      );
      // Expand → fetch fires once and resolves.
      fireEvent.click(getByText('Raw Alert Data'));
      await act(async () => {
        await Promise.resolve();
      });
      // Collapse, then re-expand. The cached detail must short-circuit
      // the second invocation; otherwise the upstream HTTP call repeats
      // on every accordion toggle (stale-closure regression).
      fireEvent.click(getByText('Raw Alert Data'));
      fireEvent.click(getByText('Raw Alert Data'));
      expect(mockGetAlertDetail).toHaveBeenCalledTimes(1);
    });

    it('does not refetch when the upstream resolved with null on first expand', async () => {
      // The lazy fetch caches the "we already asked" decision separately
      // from the response. If `getAlertDetail` resolves null (alert no
      // longer present, transient 404) we must still short-circuit the
      // next accordion toggle — otherwise every collapse/re-expand cycle
      // hammers the upstream.
      mockGetAlertDetail.mockResolvedValueOnce(null);
      const alertWithMonitor: UnifiedAlertSummary = { ...baseAlert, monitorId: 'mon-7' };
      const { getByText } = render(
        <AlertDetailFlyout
          alert={alertWithMonitor}
          datasources={datasources}
          onClose={jest.fn()}
          onAcknowledge={jest.fn()}
        />
      );
      fireEvent.click(getByText('Raw Alert Data'));
      await act(async () => {
        await Promise.resolve();
      });
      fireEvent.click(getByText('Raw Alert Data'));
      fireEvent.click(getByText('Raw Alert Data'));
      expect(mockGetAlertDetail).toHaveBeenCalledTimes(1);
    });

    it('refetches when the alert identity changes within the same flyout instance', async () => {
      const rawA = { ...baseAlert, raw: { id: 'alert-42', state: 'ACTIVE' } };
      mockGetAlertDetail.mockResolvedValueOnce(rawA);
      const { getByText, rerender } = render(
        <AlertDetailFlyout
          alert={{ ...baseAlert, monitorId: 'mon-A' }}
          datasources={datasources}
          onClose={jest.fn()}
          onAcknowledge={jest.fn()}
        />
      );
      fireEvent.click(getByText('Raw Alert Data'));
      await act(async () => {
        await Promise.resolve();
      });
      expect(mockGetAlertDetail).toHaveBeenCalledTimes(1);
      expect(mockGetAlertDetail).toHaveBeenLastCalledWith('ds-prom', 'alert-42', 'mon-A');

      // Swap to a different alert without unmounting. The cache must
      // reset so the next expand re-fires for the new id. The accordion
      // is currently expanded from the first click, so toggle once to
      // collapse and once to re-expand.
      const alertB: UnifiedAlertSummary = {
        ...baseAlert,
        id: 'alert-99',
        monitorId: 'mon-B',
      };
      mockGetAlertDetail.mockResolvedValueOnce({ ...alertB, raw: { id: 'alert-99' } });
      rerender(
        <AlertDetailFlyout
          alert={alertB}
          datasources={datasources}
          onClose={jest.fn()}
          onAcknowledge={jest.fn()}
        />
      );
      fireEvent.click(getByText('Raw Alert Data')); // collapse
      fireEvent.click(getByText('Raw Alert Data')); // re-expand on alert B
      await act(async () => {
        await Promise.resolve();
      });
      expect(mockGetAlertDetail).toHaveBeenCalledTimes(2);
      expect(mockGetAlertDetail).toHaveBeenLastCalledWith('ds-prom', 'alert-99', 'mon-B');
    });

    it('discards an in-flight A response when alert identity swaps to B mid-fetch', async () => {
      // Race: user expands the Raw Alert Data accordion on alert A; A's
      // fetch is in flight; parent swaps `selectedAlert` to B without
      // unmounting; A's response resolves *after* the swap. The stale
      // response must NOT write A's payload into B's `detailData`, and
      // must NOT pin `detailFetched=true` for B (otherwise B's accordion
      // re-expand would short-circuit the cache and never fetch B).
      let resolveA: (value: unknown) => void = () => undefined;
      const aPromise = new Promise((r) => {
        resolveA = r;
      });
      mockGetAlertDetail.mockReturnValueOnce(aPromise);

      const alertA: UnifiedAlertSummary = { ...baseAlert, monitorId: 'mon-A' };
      const { getByText, rerender } = render(
        <AlertDetailFlyout
          alert={alertA}
          datasources={datasources}
          onClose={jest.fn()}
          onAcknowledge={jest.fn()}
        />
      );
      fireEvent.click(getByText('Raw Alert Data')); // expand on A — request fires for A, hangs
      expect(mockGetAlertDetail).toHaveBeenCalledTimes(1);

      // Parent swaps to B before A's request resolves. The reset effect
      // updates `alertIdRef` synchronously so A's late `.then()`/`.finally()`
      // can detect they're stale.
      const alertB: UnifiedAlertSummary = {
        ...baseAlert,
        id: 'alert-99',
        monitorId: 'mon-B',
      };
      rerender(
        <AlertDetailFlyout
          alert={alertB}
          datasources={datasources}
          onClose={jest.fn()}
          onAcknowledge={jest.fn()}
        />
      );

      // Now A's response lands. Its `setDetailData`/`setDetailFetched`
      // writes must be no-ops because the captured identity no longer
      // matches the live alert.
      resolveA({ ...alertA, raw: { id: 'alert-42' } });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      // B's accordion is currently expanded from the first click. Toggle
      // collapse + re-expand; B's fetch must fire, proving the stale A
      // response did not pin `detailFetched=true` for B.
      mockGetAlertDetail.mockResolvedValueOnce({ ...alertB, raw: { id: 'alert-99' } });
      fireEvent.click(getByText('Raw Alert Data')); // collapse
      fireEvent.click(getByText('Raw Alert Data')); // re-expand on B
      await act(async () => {
        await Promise.resolve();
      });
      expect(mockGetAlertDetail).toHaveBeenCalledTimes(2);
      expect(mockGetAlertDetail).toHaveBeenLastCalledWith('ds-prom', 'alert-99', 'mon-B');
    });

    it('does not call getAlertDetail for Prometheus alerts when the Raw Alert Data accordion expands', () => {
      const promAlert: UnifiedAlertSummary = { ...baseAlert, datasourceType: 'prometheus' };
      const { getByText } = render(
        <AlertDetailFlyout
          alert={promAlert}
          datasources={datasources}
          onClose={jest.fn()}
          onAcknowledge={jest.fn()}
        />
      );
      fireEvent.click(getByText('Raw Alert Data'));
      expect(mockGetAlertDetail).not.toHaveBeenCalled();
    });
  });

  describe('removed mock sections', () => {
    it('does not render AI Analysis, Suggested Actions, Suppression Status, or Notification Routing accordions', () => {
      const { queryByText } = render(
        <AlertDetailFlyout
          alert={baseAlert}
          datasources={datasources}
          onClose={jest.fn()}
          onAcknowledge={jest.fn()}
        />
      );
      expect(queryByText('AI Analysis')).toBeNull();
      expect(queryByText('Suggested Actions')).toBeNull();
      expect(queryByText('Suppression Status')).toBeNull();
      expect(queryByText('Notification Routing')).toBeNull();
    });
  });
});

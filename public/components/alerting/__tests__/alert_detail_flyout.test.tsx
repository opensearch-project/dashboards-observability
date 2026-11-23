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

// Stub the shared core refs so the cross-app SLO deep-link can assert on
// `navigateToApp` without a real Core start contract.
jest.mock('../../../framework/core_refs', () => ({
  coreRefs: {
    application: { navigateToApp: jest.fn() },
  },
}));

import { AlertDetailFlyout } from '../alert_detail_flyout';
import { coreRefs } from '../../../framework/core_refs';
import { observabilityApmSloID } from '../../../../common/constants/apm';
import type { Datasource, UnifiedAlertSummary } from '../../../../common/types/alerting';

const navigateToApp = coreRefs.application!.navigateToApp as jest.Mock;

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
    const { getByText, getAllByText, getByTestId } = render(
      <AlertDetailFlyout
        alert={baseAlert}
        datasources={datasources}
        onClose={jest.fn()}
        onAcknowledge={jest.fn()}
      />
    );
    expect(getByText('HighErrorRate')).toBeInTheDocument();
    // The header row names the data source once, as the Data source filter does;
    // the Backend row in "More details" reads "OpenSearch", not `opensearch`.
    expect(getByTestId('alertDetailDatasource')).toHaveTextContent('my-prom');
    expect(getAllByText('OpenSearch')).toHaveLength(1);
    // Message appears both in the header and as the `summary` annotation below.
    expect(getAllByText('Error rate above threshold').length).toBeGreaterThan(0);
  });

  it('shows Duration: start to now while firing, start to resolution once resolved', () => {
    const start = Date.now() - 3 * 3600_000 - 10 * 60_000; // 3h 10m ago
    const { getByText, queryByText, rerender } = render(
      <AlertDetailFlyout
        alert={{ ...baseAlert, startTime: new Date(start).toISOString() }}
        datasources={datasources}
        onClose={jest.fn()}
        onAcknowledge={jest.fn()}
      />
    );
    expect(getByText('3h 10m')).toBeInTheDocument();
    rerender(
      <AlertDetailFlyout
        alert={{
          ...baseAlert,
          state: 'resolved',
          startTime: new Date(start).toISOString(),
          lastUpdated: new Date(start + 45 * 60_000).toISOString(), // resolved after 45m
        }}
        datasources={datasources}
        onClose={jest.fn()}
        onAcknowledge={jest.fn()}
      />
    );
    expect(getByText('45m')).toBeInTheDocument();
    // Alarm-backed rows set the same timestamp for start and update: no end to
    // measure to, so no "0m".
    rerender(
      <AlertDetailFlyout
        alert={{
          ...baseAlert,
          state: 'resolved',
          startTime: new Date(start).toISOString(),
          lastUpdated: new Date(start).toISOString(),
        }}
        datasources={datasources}
        onClose={jest.fn()}
        onAcknowledge={jest.fn()}
      />
    );
    expect(queryByText('0m')).not.toBeInTheDocument();
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

  it('hides the Acknowledge button for Prometheus alerts', () => {
    const onAcknowledge = jest.fn();
    const promAlert = { ...baseAlert, datasourceType: 'prometheus' as const };
    const { queryByText } = render(
      <AlertDetailFlyout
        alert={promAlert}
        datasources={datasources}
        onClose={jest.fn()}
        onAcknowledge={onAcknowledge}
      />
    );
    // Prometheus alerts use Alertmanager silences, not OS acknowledge
    expect(queryByText('Acknowledge')).toBeNull();
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

  describe('alerts whose rule was deleted', () => {
    const osAlert: UnifiedAlertSummary = {
      ...baseAlert,
      monitorId: 'mon-1',
      labels: { monitor_id: 'mon-1', monitor_name: 'Checkout errors', trigger_name: 'Too many' },
    };
    const renderFlyout = (
      alert: UnifiedAlertSummary,
      sourceRuleStatus?: 'exists' | 'missing' | 'unknown'
    ) =>
      render(
        <AlertDetailFlyout
          alert={alert}
          datasources={datasources}
          sourceRuleStatus={sourceRuleStatus}
          onClose={jest.fn()}
          onAcknowledge={jest.fn()}
        />
      );

    it('says the monitor no longer exists and drops the Open rule link', () => {
      const { getByTestId, queryByTestId, queryByText } = renderFlyout(
        { ...osAlert, state: 'deleted' },
        'missing'
      );
      expect(getByTestId('alertDetailRuleDeletedCallout')).toHaveTextContent(
        'The monitor for this alert no longer exists'
      );
      expect(getByTestId('alertDetailRuleDeletedCallout')).toHaveTextContent('Checkout errors');
      expect(queryByTestId('alertDetailSourceRuleLink')).toBeNull();
      expect(getByTestId('alertDetailSourceRuleDeleted')).toHaveTextContent(
        'Checkout errors (deleted)'
      );
      // A deleted-rule alert can't be acknowledged.
      expect(queryByText('Acknowledge')).toBeNull();
    });

    it('flags an active alert whose monitor is missing from the rules list', () => {
      const { getByTestId, queryByTestId, queryByText } = renderFlyout(osAlert, 'missing');
      expect(getByTestId('alertDetailRuleDeletedCallout')).toBeInTheDocument();
      expect(queryByTestId('alertDetailSourceRuleLink')).toBeNull();
      // The callout says it can't be acknowledged, so no Acknowledge button.
      expect(queryByText('Acknowledge')).toBeNull();
    });

    it('keeps the Rule link when only the trigger was deleted', () => {
      const { getByTestId } = renderFlyout({ ...osAlert, state: 'deleted' }, 'exists');
      expect(getByTestId('alertDetailRuleDeletedCallout')).toHaveTextContent(
        'The trigger for this alert was deleted'
      );
      expect(getByTestId('alertDetailRuleDeletedCallout')).toHaveTextContent('Too many');
      expect(getByTestId('alertDetailSourceRuleLink')).toBeInTheDocument();
    });

    it('explains a deleted state even when the rules list is unavailable', () => {
      const { getByTestId } = renderFlyout({ ...osAlert, state: 'deleted' });
      expect(getByTestId('alertDetailRuleDeletedCallout')).toHaveTextContent(
        'The rule for this alert was deleted'
      );
      expect(getByTestId('alertDetailSourceRuleLink')).toBeInTheDocument();
    });

    it('shows no notice for a live alert whose rule exists', () => {
      const { queryByTestId } = renderFlyout(osAlert, 'exists');
      expect(queryByTestId('alertDetailRuleDeletedCallout')).toBeNull();
    });
  });

  describe('source deep-link (OBS1)', () => {
    beforeEach(() => {
      navigateToApp.mockClear();
    });

    it('links an SLO burn-rate alert to its rule and to the SLO detail page in the SLO app', () => {
      const onClose = jest.fn();
      const sloAlert: UnifiedAlertSummary = {
        ...baseAlert,
        datasourceType: 'prometheus',
        labels: { slo_id: 'slo/api ok', slo_name: 'API availability', alertname: 'BurnRate' },
      };
      const { getByText, getByTestId, queryByText } = render(
        <AlertDetailFlyout
          alert={sloAlert}
          datasources={datasources}
          onClose={onClose}
          onAcknowledge={jest.fn()}
        />
      );
      // a "Rule" row and an "SLO" row, each with the name as the link. No
      // "Open SLO" / "Open rule" button.
      expect(getByText('Rule')).toBeInTheDocument();
      expect(getByText('SLO')).toBeInTheDocument();
      expect(getByTestId('alertDetailSourceRuleLink')).toHaveTextContent('BurnRate');
      expect(getByTestId('alertDetailSloLink')).toHaveTextContent('API availability');
      expect(queryByText('Open SLO')).toBeNull();
      expect(queryByText('Open rule')).toBeNull();
      fireEvent.click(getByTestId('alertDetailSloLink'));
      expect(onClose).toHaveBeenCalledTimes(1);
      // Cross-app navigation to the SLO detail route, with the id encoded.
      expect(navigateToApp).toHaveBeenCalledWith(observabilityApmSloID, {
        path: `#/slos/${encodeURIComponent('slo/api ok')}`,
      });
    });

    it('keeps the header tags reachable when the alert name is long with no spaces', () => {
      // Generated SLO rule names have no spaces; the title must wrap anywhere, and the tag row
      // must wrap, so the status, severity and data source stay inside the flyout (#57).
      const longName =
        'SLO_BurnRate_PageQuick_checkout_availability_availability_124e5ec2_0123456789abcdef';
      const sloAlert: UnifiedAlertSummary = {
        ...baseAlert,
        name: longName,
        datasourceType: 'prometheus',
        labels: { slo_id: 'slo-1', slo_name: 'Checkout availability', alertname: longName },
      };
      const { getByTestId, getByRole } = render(
        <AlertDetailFlyout
          alert={sloAlert}
          datasources={datasources}
          onClose={jest.fn()}
          onAcknowledge={jest.fn()}
        />
      );
      const title = getByRole('heading', { name: longName });
      expect(title).toHaveStyle({ overflowWrap: 'anywhere' });
      const row = getByTestId('alertDetailHeaderRow');
      expect(row).toHaveClass('euiFlexGroup--wrap');
      // The tags have their own row under the title, so its length can't push them out of view.
      expect(row).not.toContainElement(title);
      expect(row).toContainElement(getByTestId('alertDetailStatus'));
      expect(row).toContainElement(getByTestId('alertDetailSeverity'));
      expect(row).toContainElement(getByTestId('alertDetailDatasource'));
    });

    it('names the SLO in the SLO row and the monitor in the Rule row', () => {
      // An SLO alert that also carries a monitor_name names the SLO in the "SLO" row and the
      // monitor in the "Rule" row; neither borrows the other's name.
      const sloAlert: UnifiedAlertSummary = {
        ...baseAlert,
        datasourceType: 'prometheus',
        labels: {
          slo_id: 'slo-1',
          slo_name: 'API availability',
          monitor_name: 'High latency',
          alertname: 'BurnRate',
        },
      };
      const { getByText, getByTestId } = render(
        <AlertDetailFlyout
          alert={sloAlert}
          datasources={datasources}
          onClose={jest.fn()}
          onAcknowledge={jest.fn()}
        />
      );
      expect(getByText('SLO')).toBeInTheDocument();
      expect(getByTestId('alertDetailSloLink')).toHaveTextContent('API availability');
      expect(getByTestId('alertDetailSloLink')).not.toHaveTextContent('High latency');
      expect(getByTestId('alertDetailSourceRuleLink')).toHaveTextContent('High latency');
    });

    it('does not cross apps for a monitor rule deep-link', () => {
      const monitorAlert: UnifiedAlertSummary = {
        ...baseAlert,
        datasourceType: 'opensearch',
        labels: { monitor_id: 'mon-7', monitor_name: 'High latency' },
      };
      const { getByText, getByTestId } = render(
        <AlertDetailFlyout
          alert={monitorAlert}
          datasources={datasources}
          onClose={jest.fn()}
          onAcknowledge={jest.fn()}
        />
      );
      expect(getByText('Rule')).toBeInTheDocument();
      expect(getByTestId('alertDetailSourceRuleLink')).toHaveTextContent('High latency');
      fireEvent.click(getByTestId('alertDetailSourceRuleLink'));
      // Rule deep-links stay inside the alerting app (hash-only), so
      // navigateToApp must not fire.
      expect(navigateToApp).not.toHaveBeenCalled();
    });

    it('falls back to the source id, never the action label, when no name label exists', () => {
      const namelessAlert: UnifiedAlertSummary = {
        ...baseAlert,
        datasourceType: 'opensearch',
        labels: { monitor_id: 'mon-7' },
      };
      const { getByTestId } = render(
        <AlertDetailFlyout
          alert={namelessAlert}
          datasources={datasources}
          onClose={jest.fn()}
          onAcknowledge={jest.fn()}
        />
      );
      const sourceRow = getByTestId('alertDetailSourceRuleLink');
      expect(sourceRow).toHaveTextContent('mon-7');
      expect(sourceRow).not.toHaveTextContent('Open rule');
    });
  });

  describe('header and body', () => {
    it('shows one tag row: native status (breach as the red tag), severity, data source', () => {
      const { getByTestId } = render(
        <AlertDetailFlyout
          alert={{ ...baseAlert, datasourceType: 'prometheus' }}
          datasources={datasources}
          onClose={jest.fn()}
          onAcknowledge={jest.fn()}
        />
      );
      const row = getByTestId('alertDetailHeaderRow');
      const status = getByTestId('alertDetailStatus');
      expect(status).toHaveTextContent('Firing');
      expect(status).toHaveAttribute('data-breached', 'true');
      expect(getByTestId('alertDetailSeverity')).toHaveAttribute('data-severity', 'critical');
      expect(getByTestId('alertDetailDatasource')).toHaveTextContent('my-prom');
      // Table order: Status, Severity, Data source.
      const order = Array.from(row.querySelectorAll('[data-test-subj]')).map((el) =>
        el.getAttribute('data-test-subj')
      );
      expect(order.indexOf('alertDetailStatus')).toBeLessThan(order.indexOf('alertDetailSeverity'));
      expect(order.indexOf('alertDetailSeverity')).toBeLessThan(
        order.indexOf('alertDetailDatasource')
      );
    });

    it('shows a resolved Prometheus alert as a gray "Inactive", not a breach', () => {
      const { getByTestId } = render(
        <AlertDetailFlyout
          alert={{ ...baseAlert, datasourceType: 'prometheus', state: 'resolved' }}
          datasources={datasources}
          onClose={jest.fn()}
          onAcknowledge={jest.fn()}
        />
      );
      expect(getByTestId('alertDetailStatus')).toHaveTextContent('Inactive');
      expect(getByTestId('alertDetailStatus')).not.toHaveAttribute('data-breached');
    });

    it('drops the source-type chip and the "Open rule" button', () => {
      const { queryByTestId, queryByText } = render(
        <AlertDetailFlyout
          alert={{ ...baseAlert, labels: { monitor_id: 'mon-1', monitor_name: 'Errors' } }}
          datasources={datasources}
          onClose={jest.fn()}
          onAcknowledge={jest.fn()}
        />
      );
      expect(queryByTestId('alertDetailOpenSource')).toBeNull();
      expect(queryByText('Open rule')).toBeNull();
      // "OpenSearch" is only the Backend value in "More details", not a header chip.
      expect(queryByTestId('alertDetailHeaderRow')).not.toHaveTextContent('OpenSearch');
    });

    it('lists Started, Rule, SLO and Account in the body; the rest in a collapsed More details', () => {
      const { getByTestId } = render(
        <AlertDetailFlyout
          alert={{
            ...baseAlert,
            labels: {
              monitor_id: 'mon-1',
              monitor_name: 'Errors',
              slo_id: 'slo-1',
              slo_name: 'Checkout availability',
            },
            cloudWatch: {
              state: 'ALARM',
              alarmType: 'metric',
              accountId: '123456789012',
              region: 'us-east-1',
            },
          }}
          datasources={datasources}
          onClose={jest.fn()}
          onAcknowledge={jest.fn()}
        />
      );
      const summary = getByTestId('alertDetailSummary');
      const titles = Array.from(summary.querySelectorAll('.euiDescriptionList__title')).map(
        (el) => el.textContent
      );
      expect(titles).toEqual(['Started', 'Rule', 'SLO', 'Account']);
      expect(summary).toHaveTextContent('123456789012');
      const more = getByTestId('alertDetailMoreDetails');
      expect(more).toHaveTextContent('More details');
      expect(more.querySelector('.euiAccordion-isOpen')).toBeNull();
      expect(more).not.toHaveClass('euiAccordion-isOpen');
      const moreTitles = Array.from(more.querySelectorAll('.euiDescriptionList__title')).map(
        (el) => el.textContent
      );
      expect(moreTitles).toEqual([
        'Alert ID',
        'Backend',
        'Last Updated',
        'Duration',
        'Data source ID',
      ]);
      expect(more).toHaveTextContent('ds-prom');
    });

    it('shows no SLO or Account row for a plain alert', () => {
      const { getByTestId, queryByTestId } = render(
        <AlertDetailFlyout
          alert={{ ...baseAlert, labels: { monitor_id: 'mon-1', monitor_name: 'Errors' } }}
          datasources={datasources}
          onClose={jest.fn()}
          onAcknowledge={jest.fn()}
        />
      );
      const titles = Array.from(
        getByTestId('alertDetailSummary').querySelectorAll('.euiDescriptionList__title')
      ).map((el) => el.textContent);
      expect(titles).toEqual(['Started', 'Rule']);
      expect(queryByTestId('alertDetailSloLink')).toBeNull();
    });
  });

  describe('detail-list formatting parity with the alerts table', () => {
    it('shows Status and Severity once, in the header, in words instead of raw enums', () => {
      const { getAllByText, queryByText } = render(
        <AlertDetailFlyout
          alert={baseAlert}
          datasources={datasources}
          onClose={jest.fn()}
          onAcknowledge={jest.fn()}
        />
      );
      // The alerts table renders "Active"/"Critical"; the flyout shows the same words. The
      // header row carries Status, Severity and Data source, so the body has no State,
      // Severity or Datasource rows repeating them, and no raw enum survives anywhere.
      expect(getAllByText('Active')).toHaveLength(1);
      expect(getAllByText('Critical')).toHaveLength(1);
      expect(queryByText('active')).toBeNull();
      expect(queryByText('critical')).toBeNull();
      expect(queryByText('State')).toBeNull();
      expect(queryByText('Severity')).toBeNull();
      expect(queryByText('Datasource')).toBeNull();
    });

    it('names the timezone on the Started and Last Updated timestamps', () => {
      const { getAllByText } = render(
        <AlertDetailFlyout
          alert={{ ...baseAlert, startTime: '2026-06-04T20:00:00.000Z' }}
          datasources={datasources}
          onClose={jest.fn()}
          onAcknowledge={jest.fn()}
        />
      );
      // `toLocaleString()` never says which zone it rendered in. Assert the
      // zone-labelled shape rather than a fixed string, so the test doesn't
      // depend on the machine's timezone. Both Started and Last Updated match.
      expect(getAllByText(/^\w{3} \d{1,2}, 20\d{2} @ \d{2}:\d{2}:\d{2} \S+$/)).toHaveLength(2);
    });

    it('renders the shared em-dash placeholder when a timestamp is missing', () => {
      const { getAllByText } = render(
        <AlertDetailFlyout
          alert={{ ...baseAlert, lastUpdated: '' }}
          datasources={datasources}
          onClose={jest.fn()}
          onAcknowledge={jest.fn()}
        />
      );
      // Not "Invalid date", and not the flyout's old "Not available" wording —
      // the same glyph the table uses for an empty cell.
      expect(getAllByText('—').length).toBeGreaterThan(0);
    });
  });

  describe('annotation runbook links (SRE2)', () => {
    it('renders a runbook URL annotation as a clickable external link', () => {
      const alertWithRunbook: UnifiedAlertSummary = {
        ...baseAlert,
        annotations: { runbook: 'https://runbooks.example/api' },
      };
      const { getByText } = render(
        <AlertDetailFlyout
          alert={alertWithRunbook}
          datasources={datasources}
          onClose={jest.fn()}
          onAcknowledge={jest.fn()}
        />
      );
      const link = getByText('https://runbooks.example/api');
      expect(link.tagName).toBe('A');
      expect(link).toHaveAttribute('href', 'https://runbooks.example/api');
      expect(link).toHaveAttribute('target', '_blank');
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

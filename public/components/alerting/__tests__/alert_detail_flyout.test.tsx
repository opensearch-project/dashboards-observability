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

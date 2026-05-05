/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render } from '@testing-library/react';

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

// Post-Phase 4: AlertDetailFlyout instantiates AlertingOpenSearchService
// internally via `useMemo(() => new AlertingOpenSearchService(), [])` and
// calls `getAlertDetail(dsId, alertId)` on mount. Mock the class so the
// constructor returns a stubbed instance with `getAlertDetail` resolving to
// `null` — the flyout falls back to the alert summary in that case, which
// is exactly what these render tests exercise.
jest.mock('../query_services/alerting_opensearch_service', () => ({
  AlertingOpenSearchService: jest.fn().mockImplementation(() => ({
    getAlertDetail: jest.fn().mockResolvedValue(null),
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

  describe('runbook URL sanitization', () => {
    it('does not render the runbook as a link when the URL uses a javascript: protocol', () => {
      const alertWithBadUrl: UnifiedAlertSummary = {
        ...baseAlert,
        annotations: {
          ...baseAlert.annotations,
          // eslint-disable-next-line no-script-url
          runbook_url: 'javascript:alert(document.cookie)',
        },
      };
      const { getByText } = render(
        <AlertDetailFlyout
          alert={alertWithBadUrl}
          datasources={datasources}
          onClose={jest.fn()}
          onAcknowledge={jest.fn()}
        />
      );
      const runbookTitle = getByText('Check related runbook');
      expect(runbookTitle.closest('a')).toBeNull();
    });

    it('renders the runbook as an external link with rel="noopener noreferrer" for an https URL', () => {
      const alertWithGoodUrl: UnifiedAlertSummary = {
        ...baseAlert,
        annotations: {
          ...baseAlert.annotations,
          runbook_url: 'https://runbooks.example.com/high-error-rate',
        },
      };
      const { getByText } = render(
        <AlertDetailFlyout
          alert={alertWithGoodUrl}
          datasources={datasources}
          onClose={jest.fn()}
          onAcknowledge={jest.fn()}
        />
      );
      const runbookTitle = getByText('Check related runbook');
      const anchor = runbookTitle.closest('a');
      expect(anchor).not.toBeNull();
      expect(anchor?.getAttribute('href')).toBe('https://runbooks.example.com/high-error-rate');
      expect(anchor?.getAttribute('rel')).toBe('noopener noreferrer');
      expect(anchor?.getAttribute('target')).toBe('_blank');
    });

    it('does not render the runbook as a link when no URL is configured', () => {
      const { getByText } = render(
        <AlertDetailFlyout
          alert={baseAlert}
          datasources={datasources}
          onClose={jest.fn()}
          onAcknowledge={jest.fn()}
        />
      );
      const runbookTitle = getByText('Check related runbook');
      expect(runbookTitle.closest('a')).toBeNull();
    });
  });
});

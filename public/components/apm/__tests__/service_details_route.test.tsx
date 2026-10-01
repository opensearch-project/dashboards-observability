/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen } from '@testing-library/react';

const mockResolved = jest.fn();
jest.mock('../shared/hooks/use_resolved_node_type', () => ({
  useResolvedNodeType: (...args: unknown[]) => mockResolved(...args),
}));
const mockDependencyDetails = jest.fn();
jest.mock('../pages/service_details/dependency_details', () => ({
  DependencyDetails: (props: Record<string, unknown>) => {
    mockDependencyDetails(props);
    return <div data-test-subj="dependency-details" />;
  },
}));
jest.mock('../pages/service_details', () => ({
  ServiceDetails: () => <div data-test-subj="service-details" />,
}));
jest.mock('../config/apm_config_context', () => ({ useApmConfig: jest.fn() }));
// Heavy page modules services.tsx imports; not under test here.
jest.mock('../config/apm_settings_modal', () => ({ ApmSettingsModal: () => null }));
jest.mock('../setup_wizard/apm_setup_wizard_modal', () => ({ ApmSetupWizardModal: () => null }));
jest.mock('../common/apm_empty_state', () => ({ ApmEmptyState: () => null }));
jest.mock('../pages/services_home', () => ({ ServicesHome: () => null }));
jest.mock('../../../plugin_helpers/plugin_headerControl', () => ({
  HeaderControlledComponentsWrapper: () => null,
}));

import { ServiceDetailsRoute } from '../services';

const timeRange = { from: 'now-15m', to: 'now' };

const renderRoute = (hintedNodeType?: string, onTimeChange = jest.fn()) =>
  render(
    <ServiceDetailsRoute
      serviceName="kafka:orders"
      environment="generic:default"
      hintedNodeType={hintedNodeType}
      timeRange={timeRange}
      onTimeChange={onTimeChange}
      onRefresh={jest.fn()}
      refreshTrigger={0}
    />
  );

describe('ServiceDetailsRoute', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.history.replaceState(null, '', '/app/apm#/service-details/kafka%3Aorders/x');
  });

  it('waits for the node type instead of guessing from the URL', () => {
    mockResolved.mockReturnValue({ nodeType: 'database', resolving: true });
    renderRoute('database');
    expect(screen.getByTestId('serviceDetailsResolvingType')).toBeInTheDocument();
    expect(screen.queryByTestId('dependency-details')).toBeNull();
    expect(screen.queryByTestId('service-details')).toBeNull();
  });

  it('opens the service view for a service despite a dependency nodeType in the URL', () => {
    mockResolved.mockReturnValue({ nodeType: 'service', resolving: false });
    renderRoute('database');
    expect(screen.getByTestId('service-details')).toBeInTheDocument();
  });

  it('opens the dependency view for a dependency reached without nodeType', () => {
    mockResolved.mockReturnValue({ nodeType: 'messaging', resolving: false });
    renderRoute(undefined);
    expect(screen.getByTestId('dependency-details')).toBeInTheDocument();
    expect(mockResolved).toHaveBeenCalledWith('kafka:orders', 'generic:default', undefined);
    expect(mockDependencyDetails.mock.calls[0][0].nodeType).toBe('messaging');
  });

  it('applies a shared link time range and writes a brushed range to the URL', () => {
    mockResolved.mockReturnValue({ nodeType: 'messaging', resolving: false });
    window.history.replaceState(
      null,
      '',
      '/app/apm#/service-details/kafka%3Aorders/x?nodeType=messaging&from=now-1h&to=now'
    );
    const onTimeChange = jest.fn();
    const { rerender } = renderRoute('messaging', onTimeChange);
    expect(onTimeChange).toHaveBeenCalledWith({ from: 'now-1h', to: 'now' });

    const brush = mockDependencyDetails.mock.calls[0][0].onTimeRangeChange;
    brush('2026-10-01T08:00:00.000Z', '2026-10-01T08:05:00.000Z');
    expect(onTimeChange).toHaveBeenLastCalledWith({
      from: '2026-10-01T08:00:00.000Z',
      to: '2026-10-01T08:05:00.000Z',
    });
    const params = new URLSearchParams(window.location.hash.split('?')[1]);
    expect(params.get('from')).toBe('2026-10-01T08:00:00.000Z');
    expect(params.get('nodeType')).toBe('messaging');

    // A stable handler: re-rendering does not hand the charts a new callback.
    rerender(
      <ServiceDetailsRoute
        serviceName="kafka:orders"
        environment="generic:default"
        hintedNodeType="messaging"
        timeRange={timeRange}
        onTimeChange={onTimeChange}
        onRefresh={jest.fn()}
        refreshTrigger={0}
      />
    );
    const calls = mockDependencyDetails.mock.calls;
    expect(calls[calls.length - 1][0].onTimeRangeChange).toBe(brush);
  });
});

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, act } from '@testing-library/react';
import { ServiceDetails } from '../service_details';

jest.mock('../../../config/apm_config_context', () => ({
  useApmConfig: () => ({
    config: { prometheusDataSource: { name: 'prom' }, serviceMapDataset: { id: 'ds' } },
    loading: false,
    error: null,
  }),
}));
jest.mock('../service_overview', () => ({ ServiceOverview: () => <div /> }));
jest.mock('../service_operations', () => ({ ServiceOperations: () => <div /> }));
jest.mock('../service_dependencies', () => ({ ServiceDependencies: () => <div /> }));
jest.mock('../service_slo_tab', () => ({ ServiceSloTab: () => <div />, SloTabLabel: () => null }));
jest.mock('../../slos/slo_api_client', () => ({ SloApiClient: jest.fn() }));
jest.mock('../../slos/slo_health_summary', () => ({
  useServiceSloHealth: () => ({
    bySvc: new Map(),
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  }),
  toSloHealthAccessError: () => undefined,
}));
jest.mock('../../../../../framework/core_refs', () => ({ coreRefs: {} }));

const setHash = (hash: string) => window.history.replaceState(null, '', hash);
const hashParams = () => new URLSearchParams(window.location.hash.split('?')[1] ?? '');

describe('ServiceDetails time range URL sync', () => {
  const baseProps = {
    serviceName: 'checkout',
    environment: 'prod',
    onRefresh: jest.fn(),
    refreshTrigger: 0,
  };

  it('applies from/to from the URL on mount without overwriting the deep link', () => {
    setHash('#/service-details/checkout/prod?tab=overview&from=now-1h&to=now');
    const onTimeChange = jest.fn();
    render(
      <ServiceDetails
        {...baseProps}
        timeRange={{ from: 'now-15m', to: 'now' }}
        onTimeChange={onTimeChange}
      />
    );
    expect(onTimeChange).toHaveBeenCalledWith({ from: 'now-1h', to: 'now' });
    expect(hashParams().get('from')).toBe('now-1h');
  });

  it('re-reads from/to when only the URL hash changes after mount', () => {
    setHash('#/service-details/checkout/prod?tab=overview&from=now-15m&to=now');
    const onTimeChange = jest.fn();
    render(
      <ServiceDetails
        {...baseProps}
        timeRange={{ from: 'now-15m', to: 'now' }}
        onTimeChange={onTimeChange}
      />
    );
    onTimeChange.mockClear();

    act(() => {
      setHash(
        '#/service-details/checkout/prod?tab=overview&from=2026-09-29T20:00:00.000Z&to=2026-09-29T21:00:00.000Z'
      );
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    expect(onTimeChange).toHaveBeenCalledWith({
      from: '2026-09-29T20:00:00.000Z',
      to: '2026-09-29T21:00:00.000Z',
    });
  });

  it('does not call onTimeChange on a hash change that leaves from/to unchanged', () => {
    setHash('#/service-details/checkout/prod?tab=overview&from=now-15m&to=now');
    const onTimeChange = jest.fn();
    render(
      <ServiceDetails
        {...baseProps}
        timeRange={{ from: 'now-15m', to: 'now' }}
        onTimeChange={onTimeChange}
      />
    );
    onTimeChange.mockClear();

    act(() => {
      setHash('#/service-details/checkout/prod?tab=operations&from=now-15m&to=now');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    expect(onTimeChange).not.toHaveBeenCalled();
  });

  it('writes a picker time change to the URL and keeps other params', () => {
    setHash('#/service-details/checkout/prod?tab=overview&from=now-15m&to=now&lang=java');
    const { rerender } = render(
      <ServiceDetails
        {...baseProps}
        timeRange={{ from: 'now-15m', to: 'now' }}
        onTimeChange={jest.fn()}
      />
    );

    rerender(
      <ServiceDetails
        {...baseProps}
        timeRange={{ from: 'now-7d', to: 'now' }}
        onTimeChange={jest.fn()}
      />
    );

    const params = hashParams();
    expect(params.get('from')).toBe('now-7d');
    expect(params.get('to')).toBe('now');
    expect(params.get('lang')).toBe('java');
    expect(params.get('tab')).toBe('overview');
  });
});

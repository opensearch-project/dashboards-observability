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

  it('backfills from/to on a hash change that pushed a URL with no range', () => {
    setHash('#/service-details/checkout/prod?tab=overview&from=now%2Fd&to=now%2Fd');
    render(
      <ServiceDetails
        {...baseProps}
        timeRange={{ from: 'now/d', to: 'now/d' }}
        onTimeChange={jest.fn()}
      />
    );

    // An in-page dependency link pushes a URL with no from/to (the range is unchanged,
    // so the time-range sync effect never re-runs).
    act(() => {
      setHash('#/service-details/checkout/prod?tab=dependencies&dependency=svc-009-feed');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    const params = hashParams();
    expect(params.get('from')).toBe('now/d');
    expect(params.get('to')).toBe('now/d');
    // The navigation target must survive the backfill.
    expect(params.get('tab')).toBe('dependencies');
    expect(params.get('dependency')).toBe('svc-009-feed');
  });

  it('backfills from/to on mount when the entry URL has no range', () => {
    setHash('#/service-details/checkout/prod?tab=overview');
    const onTimeChange = jest.fn();
    render(
      <ServiceDetails
        {...baseProps}
        timeRange={{ from: 'now-15m', to: 'now' }}
        onTimeChange={onTimeChange}
      />
    );

    const params = hashParams();
    expect(params.get('from')).toBe('now-15m');
    expect(params.get('to')).toBe('now');
    expect(params.get('tab')).toBe('overview');
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

  describe('navigating away by a hash link (no rewrite back to this service)', () => {
    it('leaves the Services breadcrumb URL alone', () => {
      setHash('#/service-details/checkout/prod?tab=overview&from=now-15m&to=now');
      render(
        <ServiceDetails
          {...baseProps}
          timeRange={{ from: 'now-15m', to: 'now' }}
          onTimeChange={jest.fn()}
        />
      );

      act(() => {
        setHash('#/services');
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      });

      expect(window.location.hash).toBe('#/services');
    });

    it('leaves another service’s URL alone, then backfills it for the new service', () => {
      setHash('#/service-details/checkout/prod?tab=overview&from=now-15m&to=now');
      const onTimeChange = jest.fn();
      const { rerender } = render(
        <ServiceDetails
          {...baseProps}
          timeRange={{ from: 'now-15m', to: 'now' }}
          onTimeChange={onTimeChange}
        />
      );

      // The hashchange fires while this instance still renders `checkout`.
      act(() => {
        setHash('#/service-details/payments/prod?tab=dependencies&dependency=db');
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      });
      expect(window.location.hash).toBe(
        '#/service-details/payments/prod?tab=dependencies&dependency=db'
      );

      // The router then re-renders the page for `payments`, which backfills its own URL.
      rerender(
        <ServiceDetails
          {...baseProps}
          serviceName="payments"
          timeRange={{ from: 'now-15m', to: 'now' }}
          onTimeChange={onTimeChange}
        />
      );
      const [path] = window.location.hash.split('?');
      expect(path).toBe('#/service-details/payments/prod');
      const params = hashParams();
      expect(params.get('from')).toBe('now-15m');
      expect(params.get('to')).toBe('now');
      expect(params.get('tab')).toBe('dependencies');
      expect(params.get('dependency')).toBe('db');
    });
  });

  it('round-trips a relative-future range (now+1h) through the URL', () => {
    setHash('#/service-details/checkout/prod?tab=overview&from=now-15m&to=now');
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
        timeRange={{ from: 'now', to: 'now+1h' }}
        onTimeChange={jest.fn()}
      />
    );
    expect(window.location.hash).toContain('to=now%2B1h');
    expect(hashParams().get('to')).toBe('now+1h');

    // And a deep link carrying it is applied on mount.
    const onTimeChange = jest.fn();
    render(
      <ServiceDetails
        {...baseProps}
        serviceName="checkout"
        timeRange={{ from: 'now-15m', to: 'now' }}
        onTimeChange={onTimeChange}
      />
    );
    expect(onTimeChange).toHaveBeenCalledWith({ from: 'now', to: 'now+1h' });
  });
});

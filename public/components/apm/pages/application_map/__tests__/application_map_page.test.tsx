/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, act } from '@testing-library/react';
import { ApplicationMapPage } from '../application_map_page';
import { TimeRange } from '../../../common/types/service_types';

// Expose the page's time range setter so tests can simulate a picker change.
let mockSetPageTimeRange: (range: TimeRange) => void = () => {};
let mockCurrentRange: TimeRange | undefined;
const mockLatestTimeRange = () => mockCurrentRange;
const mockOverview = jest.fn();
const mockSlices = jest.fn();
const mockNeighborhood = jest.fn();
jest.mock('../../../shared/hooks/use_service_map_slices', () => ({
  // A small map (the default in these tests) loads its whole topology via useServiceMap.
  useServiceMapOverview: (params: unknown) =>
    mockOverview(params) ?? {
      ready: true,
      nodes: [],
      availableGroupByAttributes: {},
      isLoading: false,
      error: null,
    },
  useServiceMapSlices: (params: unknown) =>
    mockSlices(params) ?? { active: null, activeStatus: null, status: new Map() },
  useFocusNeighborhood: (params: unknown) =>
    mockNeighborhood(params) ?? {
      neighborhood: null,
      isLoading: false,
      truncated: false,
      error: null,
    },
}));
jest.mock('../../../shared/hooks/use_persistent_time_range', () => ({
  usePersistentTimeRange: (fallback: TimeRange) => {
    const [range, setRange] = jest.requireActual('react').useState(fallback);
    mockSetPageTimeRange = setRange;
    mockCurrentRange = range;
    return [range, setRange];
  },
}));

// Config stays "loading" so the page renders its spinner; all hooks still run.
jest.mock('../../../config/apm_config_context', () => ({
  useApmConfig: () => ({ config: null, loading: true, error: null, refresh: jest.fn() }),
}));
jest.mock('../../../shared/hooks/use_service_map', () => ({
  useServiceMap: jest.fn(() => ({
    nodes: [],
    edges: [],
    isLoading: false,
    error: null,
    availableGroupByAttributes: [],
    truncated: false,
  })),
}));
jest.mock('../../../shared/hooks/use_service_map_metrics', () => ({
  useServiceMapMetrics: () => ({
    metricsMap: new Map(),
    pendingNodeIds: new Set(),
    failedNodeIds: new Set(),
    retryFailed: jest.fn(),
    isLoading: false,
    refetch: jest.fn(),
  }),
}));
jest.mock('../../../shared/hooks/use_selected_edge_metrics', () => ({
  useSelectedEdgeMetrics: () => ({ metrics: null, isLoading: false }),
}));
jest.mock('../../../shared/hooks/use_group_metrics', () => ({
  useGroupMetrics: () => ({ metrics: null, isLoading: false }),
}));
jest.mock('../../../../../../../../src/plugins/opensearch_dashboards_utils/public', () => ({
  useOpenOnUrlMarker: jest.fn(),
}));

// Presentational children are irrelevant here (and pull in image assets).
jest.mock('../../../common/apm_empty_state', () => ({ ApmEmptyState: () => null }));
jest.mock('../../../config/apm_settings_modal', () => ({ ApmSettingsModal: () => null }));
jest.mock('../../../shared/components/service_map', () => ({
  ServiceMapSidebar: () => null,
  ServiceMapGraph: () => null,
  ServiceDetailsPanel: () => null,
  EdgeMetricsFlyout: () => null,
}));
jest.mock('../../../shared/components/service_correlations_flyout', () => ({
  ServiceCorrelationsFlyout: () => null,
}));

const hashParams = () => new URLSearchParams(window.location.hash.split('?')[1] ?? '');

describe('ApplicationMapPage time range URL sync', () => {
  const props = {
    chrome: { setBreadcrumbs: jest.fn() } as unknown as any,
    notifications: { toasts: { addDanger: jest.fn() } } as unknown as any,
  };

  it('writes a picked time range to the URL and keeps other params', () => {
    window.history.replaceState(null, '', '#/application-map?service=checkout&from=now-15m&to=now');
    render(<ApplicationMapPage {...props} />);

    act(() => mockSetPageTimeRange({ from: 'now-24h', to: 'now' }));

    expect(window.location.hash.startsWith('#/application-map?')).toBe(true);
    const params = hashParams();
    expect(params.get('from')).toBe('now-24h');
    expect(params.get('to')).toBe('now');
    expect(params.get('service')).toBe('checkout');
  });

  it('adds from/to to a URL that had none', () => {
    window.history.replaceState(null, '', '#/application-map');
    render(<ApplicationMapPage {...props} />);

    act(() => mockSetPageTimeRange({ from: 'now-1h', to: 'now' }));

    const params = hashParams();
    expect(params.get('from')).toBe('now-1h');
    expect(params.get('to')).toBe('now');
  });

  it('backfills from/to on mount when the URL has no range', () => {
    window.history.replaceState(null, '', '#/application-map?service=checkout');
    render(<ApplicationMapPage {...props} />);

    const params = hashParams();
    // The map's default/persisted range, written so the link is shareable.
    expect(params.get('from')).toBeTruthy();
    expect(params.get('to')).toBeTruthy();
    expect(params.get('service')).toBe('checkout');
  });

  it('keeps the deep-linked range in the URL on mount', () => {
    window.history.replaceState(null, '', '#/application-map?from=now-7d&to=now');
    render(<ApplicationMapPage {...props} />);

    const params = hashParams();
    expect(params.get('from')).toBe('now-7d');
    expect(params.get('to')).toBe('now');
  });

  it.each([
    ['Today quick select', { from: 'now/d', to: 'now/d' }],
    ['This week quick select', { from: 'now/w', to: 'now/w' }],
    ['absolute ISO', { from: '2026-09-29T20:00:00.000Z', to: '2026-09-29T21:00:00.000Z' }],
    ['relative future', { from: 'now', to: 'now+1h' }],
  ])('writes a %s range that reads back on reload', (_label, range) => {
    window.history.replaceState(null, '', '#/application-map?from=now-15m&to=now');
    const first = render(<ApplicationMapPage {...props} />);
    act(() => mockSetPageTimeRange(range));
    const written = window.location.hash;
    first.unmount();

    // Reload: a fresh mount must read the written range back and leave the URL as is.
    window.history.replaceState(null, '', written);
    render(<ApplicationMapPage {...props} />);
    expect(mockLatestTimeRange()).toEqual(range);
    expect(window.location.hash).toBe(written);
  });

  it('backfills a deep-linked range the mount reader rejects', () => {
    window.history.replaceState(null, '', '#/application-map?from=%3Cscript%3E&to=now');
    render(<ApplicationMapPage {...props} />);
    const params = hashParams();
    expect(params.get('from')).not.toBe('<script>');
    expect(params.get('from')).toBeTruthy();
  });
});

describe('ApplicationMapPage large-map mode', () => {
  const props = {
    chrome: { setBreadcrumbs: jest.fn() } as unknown as any,
    notifications: { toasts: { addDanger: jest.fn() } } as unknown as any,
  };
  const { useServiceMap } = jest.requireMock('../../../shared/hooks/use_service_map');
  const overviewWith = (count: number, extra: Record<string, unknown> = {}) => ({
    ready: true,
    nodes: Array.from({ length: count }, (_, i) => ({
      NodeId: `n${i}`,
      Name: `svc-${i}`,
      KeyAttributes: { Name: `svc-${i}`, Environment: `env-${i % 3}`, Type: 'Service' },
    })),
    availableGroupByAttributes: {},
    isLoading: false,
    error: null,
    ...extra,
  });
  const lastEnabled = () =>
    useServiceMap.mock.calls[useServiceMap.mock.calls.length - 1][0].enabled;
  const lastSlices = () => mockSlices.mock.calls[mockSlices.mock.calls.length - 1][0];

  beforeEach(() => {
    jest.clearAllMocks();
    window.history.replaceState(null, '', '#/application-map?from=now-15m&to=now');
  });
  afterEach(() => mockOverview.mockReset());

  it('loads the whole topology for a small map', () => {
    mockOverview.mockReturnValue(overviewWith(10));
    render(<ApplicationMapPage {...props} />);
    expect(lastEnabled()).toBe(true);
    expect(lastSlices().enabled).toBe(false);
  });

  it('skips the whole topology for a map over the render cap and prefetches its environments', () => {
    mockOverview.mockReturnValue(overviewWith(600));
    render(<ApplicationMapPage {...props} />);
    expect(useServiceMap.mock.calls.every((c: any[]) => c[0].enabled === false)).toBe(true);
    expect(lastSlices().enabled).toBe(true);
    expect(lastSlices().active).toBeNull();
  });

  it('decides nothing until the overview has loaded, and falls back to the whole map on error', () => {
    mockOverview.mockReturnValue(overviewWith(600, { isLoading: true }));
    const { rerender } = render(<ApplicationMapPage {...props} />);
    expect(lastEnabled()).toBe(false);

    mockOverview.mockReturnValue(overviewWith(600, { error: new Error('boom') }));
    rerender(<ApplicationMapPage {...props} />);
    expect(lastEnabled()).toBe(true);
  });
});

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
jest.mock('../../../shared/hooks/use_persistent_time_range', () => ({
  usePersistentTimeRange: (fallback: TimeRange) => {
    const [range, setRange] = jest.requireActual('react').useState(fallback);
    mockSetPageTimeRange = setRange;
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
  useServiceMapMetrics: () => ({ metrics: new Map(), isLoading: false, refetch: jest.fn() }),
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
});

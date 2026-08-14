/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Landing-time datasource scope behavior of the SLO listing:
 *   - auto-select the top-N (by SLO count) datasources on first landing,
 *   - honor an explicit URL datasource filter (no auto-select), and
 *   - restore a remembered per-tab selection from sessionStorage.
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route } from 'react-router-dom';
import type { Datasource } from '../../../../../../common/types/alerting';
import type { SloApiClient } from '../slo_api_client';
import type { SloListFilters, SloSummary } from '../../../../../../common/slo/slo_types';
import { datasourceScopeCacheKey } from '../slo_datasource_scope_cache';

jest.mock('../../../shared/utils/navigation_utils', () => ({
  navigateToServicesList: jest.fn(),
  navigateToSloSuggest: jest.fn(),
}));
// The toolbar Suggest button + onboarding empty state call useServices; this
// suite doesn't exercise them, so stub an empty result so they render without a
// live PPL backend (an unmocked useServices returns undefined and throws).
jest.mock('../../../shared/hooks/use_services', () => ({
  useServices: jest.fn(() => ({
    data: [],
    isLoading: false,
    error: null,
    availableGroupByAttributes: {},
    refetch: jest.fn(),
  })),
}));
jest.mock('../../../../../plugin_helpers/plugin_headerControl', () => ({
  HeaderControlledComponentsWrapper: ({ components }: { components: React.ReactNode[] }) => (
    <div data-test-subj="header-wrapper">{components}</div>
  ),
}));
jest.mock('../slo_overview_panel', () => ({
  SloOverviewPanel: () => <div data-test-subj="slosOverviewStub" />,
}));

// Controllable Prometheus datasource catalog.
const mockUsePrometheusDatasources = jest.fn();
jest.mock('../use_prometheus_datasources', () => ({
  usePrometheusDatasources: () => mockUsePrometheusDatasources(),
}));

import { SloListingPage } from '../slo_listing_page';

function ds(id: string, name: string): Datasource {
  return { id, name, type: 'prometheus' } as Datasource;
}

function makeSummary(overrides: Partial<SloSummary> = {}): SloSummary {
  return {
    id: 'slo-1',
    datasourceId: 'prom-a',
    datasourceType: 'prometheus',
    name: 'api-availability',
    enabled: true,
    mode: 'active',
    service: 'payments-api',
    owner: { teams: ['sre'] },
    tier: 'tier-1',
    sliNodeType: 'single',
    sliBackend: 'prometheus',
    sliLeafType: 'availability',
    objectiveCount: 1,
    worstTarget: 0.999,
    window: { type: 'rolling', duration: '28d' },
    labels: {},
    status: {
      sloId: 'slo-1',
      objectives: [],
      state: 'ok',
      firingCount: 0,
      ruleCount: 0,
      computedAt: new Date(0).toISOString(),
    },
    ...overrides,
  };
}

// SLO counts per datasource name — drives ranking. `zero` has none.
const TOTALS: Record<string, number> = {
  a: 1,
  b: 2,
  c: 3,
  d: 4,
  e: 5,
  f: 6,
  zero: 0,
};

function makeListImpl(): jest.Mock {
  return jest.fn(async (filters: SloListFilters = {}) => {
    const isCountProbe = filters.pageSize === 1 && filters.datasourceId?.length === 1;
    if (isCountProbe) {
      return {
        results: [],
        total: TOTALS[filters.datasourceId![0]] ?? 0,
        pageSize: 1,
        hasMore: false,
        nextCursor: null,
        prevCursor: null,
      };
    }
    return {
      results: [makeSummary()],
      total: 1,
      pageSize: 20,
      hasMore: false,
      nextCursor: null,
      prevCursor: null,
    };
  });
}

function renderPage(list: jest.Mock, initialSearch = '') {
  const apiClient = { list } as unknown as SloApiClient;
  const chrome = { setBreadcrumbs: jest.fn() } as unknown as Parameters<
    typeof SloListingPage
  >[0]['chrome'];
  const notifications = {
    toasts: { addDanger: jest.fn(), addWarning: jest.fn(), addSuccess: jest.fn() },
  } as unknown as Parameters<typeof SloListingPage>[0]['notifications'];
  const http = { get: jest.fn().mockResolvedValue({ datasources: [] }) } as unknown as Parameters<
    typeof SloListingPage
  >[0]['http'];
  return render(
    <MemoryRouter initialEntries={[`/slos${initialSearch}`]}>
      <Route path="/slos">
        <SloListingPage
          apiClient={apiClient}
          http={http}
          chrome={chrome}
          notifications={notifications}
          parentBreadcrumb={{ text: 'APM', href: '#/' }}
        />
      </Route>
    </MemoryRouter>
  );
}

/** The datasourceId of the last non-probe (main) list call. */
function lastMainLoadDatasourceIds(list: jest.Mock): string[] | undefined {
  for (let i = list.mock.calls.length - 1; i >= 0; i--) {
    const f = (list.mock.calls[i][0] ?? {}) as SloListFilters;
    if (f.pageSize !== 1) return f.datasourceId;
  }
  return undefined;
}

describe('SloListingPage — datasource scope on landing', () => {
  afterEach(() => {
    window.sessionStorage.clear();
    mockUsePrometheusDatasources.mockReset();
  });

  it('auto-selects the top-5 datasources by SLO count (excluding zero-count and the lowest)', async () => {
    mockUsePrometheusDatasources.mockReturnValue({
      datasources: [
        ds('id-a', 'a'),
        ds('id-b', 'b'),
        ds('id-c', 'c'),
        ds('id-d', 'd'),
        ds('id-e', 'e'),
        ds('id-f', 'f'),
        ds('id-zero', 'zero'),
      ],
      loading: false,
      error: null,
    });
    const list = makeListImpl();
    renderPage(list);

    // The main load eventually runs scoped to the 5 highest-count datasources.
    await waitFor(() => {
      const dsIds = lastMainLoadDatasourceIds(list);
      expect(dsIds && [...dsIds].sort()).toEqual(['b', 'c', 'd', 'e', 'f']);
    });
    // Persisted for the tab.
    expect(window.sessionStorage.getItem(datasourceScopeCacheKey('default'))).not.toBeNull();
  });

  it('honors an explicit URL datasource filter and does not auto-select', async () => {
    mockUsePrometheusDatasources.mockReturnValue({
      datasources: [ds('id-a', 'a'), ds('id-b', 'b'), ds('id-f', 'f')],
      loading: false,
      error: null,
    });
    const list = makeListImpl();
    renderPage(list, '?datasourceId=a');

    await waitFor(() => expect(list).toHaveBeenCalled());
    // No count probes fired (auto-select skipped) and the load stays scoped to the URL value.
    expect(list.mock.calls.every(([f]) => (f as SloListFilters)?.pageSize !== 1)).toBe(true);
    expect(lastMainLoadDatasourceIds(list)).toEqual(['a']);
  });

  it('heals a legacy URL datasource id to the connection name for the query', async () => {
    mockUsePrometheusDatasources.mockReturnValue({
      datasources: [ds('id-a', 'a'), ds('id-b', 'b')],
      loading: false,
      error: null,
    });
    const list = makeListImpl();
    // Legacy bookmarked link carries the data-connection saved-object id.
    renderPage(list, '?datasourceId=id-a');

    // The listing heals it to the connection name so the server query resolves.
    await waitFor(() => expect(lastMainLoadDatasourceIds(list)).toEqual(['a']));
    // No count probes — this is the URL-wins path, not auto-select.
    expect(list.mock.calls.every(([f]) => (f as SloListFilters)?.pageSize !== 1)).toBe(true);
  });

  it('restores a remembered per-tab selection without re-ranking', async () => {
    window.sessionStorage.setItem(
      datasourceScopeCacheKey('default'),
      JSON.stringify({ kind: 'scope', ids: ['e'] })
    );
    mockUsePrometheusDatasources.mockReturnValue({
      datasources: [ds('id-a', 'a'), ds('id-e', 'e'), ds('id-f', 'f')],
      loading: false,
      error: null,
    });
    const list = makeListImpl();
    renderPage(list);

    await waitFor(() => expect(lastMainLoadDatasourceIds(list)).toEqual(['e']));
    // Cache hit → no count probes.
    expect(list.mock.calls.every(([f]) => (f as SloListFilters)?.pageSize !== 1)).toBe(true);
  });

  it('restores a remembered "show all" (no re-ranking, no scope)', async () => {
    window.sessionStorage.setItem(
      datasourceScopeCacheKey('default'),
      JSON.stringify({ kind: 'all' })
    );
    mockUsePrometheusDatasources.mockReturnValue({
      datasources: [ds('id-a', 'a'), ds('id-e', 'e'), ds('id-f', 'f')],
      loading: false,
      error: null,
    });
    const list = makeListImpl();
    renderPage(list);

    await waitFor(() => expect(list).toHaveBeenCalled());
    // 'all' → no datasource scope on the load, and no count probes.
    expect(list.mock.calls.every(([f]) => (f as SloListFilters)?.pageSize !== 1)).toBe(true);
    expect(lastMainLoadDatasourceIds(list)).toBeUndefined();
  });

  it('restores a remembered explicit-empty scope and shows nothing (no server call)', async () => {
    window.sessionStorage.setItem(
      datasourceScopeCacheKey('default'),
      JSON.stringify({ kind: 'scope', ids: [] })
    );
    mockUsePrometheusDatasources.mockReturnValue({
      datasources: [ds('id-a', 'a'), ds('id-e', 'e')],
      loading: false,
      error: null,
    });
    const list = makeListImpl();
    renderPage(list);

    // Empty scope resolves to the tailored "no datasources selected" empty
    // state, and the resolve is a cache hit → no ranking count probes fire.
    await waitFor(() => expect(screen.getByText('No datasources selected')).toBeInTheDocument());
    expect(list.mock.calls.every(([f]) => (f as SloListFilters)?.pageSize !== 1)).toBe(true);
    // No main load is ever issued *with* an empty datasource scope — that state
    // short-circuits client-side instead of querying the server.
    const scopedEmptyLoads = list.mock.calls.filter(
      ([f]) =>
        Array.isArray((f as SloListFilters)?.datasourceId) &&
        (f as SloListFilters).datasourceId!.length === 0
    );
    expect(scopedEmptyLoads.length).toBe(0);
  });

  it('"Show all datasources" recovers from the empty-scope state', async () => {
    window.sessionStorage.setItem(
      datasourceScopeCacheKey('default'),
      JSON.stringify({ kind: 'scope', ids: [] })
    );
    mockUsePrometheusDatasources.mockReturnValue({
      datasources: [ds('id-a', 'a'), ds('id-e', 'e')],
      loading: false,
      error: null,
    });
    const list = makeListImpl();
    renderPage(list);

    const button = await screen.findByTestId('slosEmptyNoDatasourceShowAll');
    fireEvent.click(button);

    // Recovery *checks* the datasource boxes (scopes to all available), so the
    // empty state clears and the load runs scoped to those datasources — the
    // checked state matches what's shown.
    await waitFor(() =>
      expect(screen.queryByTestId('slosEmptyNoDatasource')).not.toBeInTheDocument()
    );
    const dsIds = lastMainLoadDatasourceIds(list);
    expect(dsIds && [...dsIds].sort()).toEqual(['a', 'e']);
  });

  it('labels the recovery button with the cap count when more than 5 datasources exist', async () => {
    window.sessionStorage.setItem(
      datasourceScopeCacheKey('default'),
      JSON.stringify({ kind: 'scope', ids: [] })
    );
    mockUsePrometheusDatasources.mockReturnValue({
      datasources: [
        ds('id-a', 'a'),
        ds('id-b', 'b'),
        ds('id-c', 'c'),
        ds('id-d', 'd'),
        ds('id-e', 'e'),
        ds('id-f', 'f'),
      ],
      loading: false,
      error: null,
    });
    const list = makeListImpl();
    renderPage(list);

    const button = await screen.findByTestId('slosEmptyNoDatasourceShowAll');
    // 6 datasources, cap 5 → the label reflects the cap rather than "all".
    expect(button).toHaveTextContent('Show 5 datasources');
  });

  it('auto-selects the sole datasource when it has SLOs', async () => {
    mockUsePrometheusDatasources.mockReturnValue({
      datasources: [ds('id-a', 'a')],
      loading: false,
      error: null,
    });
    const list = makeListImpl(); // 'a' has 1 SLO
    renderPage(list);

    await waitFor(() => expect(lastMainLoadDatasourceIds(list)).toEqual(['a']));
  });

  it('does not select a sole datasource that has no SLOs', async () => {
    mockUsePrometheusDatasources.mockReturnValue({
      datasources: [ds('id-zero', 'zero')],
      loading: false,
      error: null,
    });
    const list = makeListImpl(); // 'zero' has 0 SLOs
    renderPage(list);

    await waitFor(() => expect(list).toHaveBeenCalled());
    // Probed (count query) but not selected — zero-count datasources are excluded.
    expect(lastMainLoadDatasourceIds(list)).toBeUndefined();
  });
});

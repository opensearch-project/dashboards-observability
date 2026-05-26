/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route } from 'react-router-dom';
import { SloListingPage } from '../slo_listing_page';
import type { SloApiClient } from '../slo_api_client';
import type { SloListFilters, SloSummary } from '../../../../../../common/slo/slo_types';
import { navigateToServicesList } from '../../../shared/utils/navigation_utils';

jest.mock('../../../shared/utils/navigation_utils', () => ({
  navigateToServicesList: jest.fn(),
}));

// Overview panel + header wrapper reach into chrome/portals that aren't
// wired in this jsdom setup. Inline them so the rest of the page mounts.
jest.mock('../../../../../plugin_helpers/plugin_headerControl', () => ({
  HeaderControlledComponentsWrapper: ({ components }: { components: React.ReactNode[] }) => (
    <div data-test-subj="header-wrapper">{components}</div>
  ),
}));
jest.mock('../slo_overview_panel', () => ({
  SloOverviewPanel: () => <div data-test-subj="slosOverviewStub" />,
}));

function makeSummary(overrides: Partial<SloSummary> = {}): SloSummary {
  return {
    id: 'slo-1',
    datasourceId: 'ds-1',
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

function renderPage(listImpl: SloApiClient['list'], initialSearch = '') {
  const apiClient = ({ list: listImpl } as unknown) as SloApiClient;
  const chrome = ({ setBreadcrumbs: jest.fn() } as unknown) as Parameters<
    typeof SloListingPage
  >[0]['chrome'];
  const notifications = ({
    toasts: { addDanger: jest.fn(), addWarning: jest.fn(), addSuccess: jest.fn() },
  } as unknown) as Parameters<typeof SloListingPage>[0]['notifications'];
  // The listing page fires one GET to /api/alerting/datasources on mount.
  // Resolve it to an empty list so the facet renders the "no datasources
  // registered" text and the rest of the page doesn't wait on a real fetch.
  const http = ({
    get: jest.fn().mockResolvedValue({ datasources: [] }),
  } as unknown) as Parameters<typeof SloListingPage>[0]['http'];
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

describe('SloListingPage — filter integration', () => {
  beforeEach(() => {
    (navigateToServicesList as jest.Mock).mockReset();
  });

  it('shows the "no SLOs yet" empty state when list returns zero unfiltered', async () => {
    const list = jest.fn().mockResolvedValue({
      results: [],
      total: 0,
      pageSize: 20,
      hasMore: false,
      nextCursor: null,
      prevCursor: null,
    });
    await act(async () => {
      renderPage(list);
    });
    expect(await screen.findByTestId('slosEmptyNoSlos')).toBeInTheDocument();
    expect(screen.queryByTestId('slosEmptyFilteredZero')).not.toBeInTheDocument();
    // Empty state pitches Services as the primary discovery path (M4: the
    // listing page no longer hosts a Suggest SLOs button).
    expect(screen.queryByTestId('slosSuggestEmpty')).not.toBeInTheDocument();
    const servicesCta = screen.getByTestId('slosEmptyGoToServices');
    expect(servicesCta).toHaveTextContent('Go to Services');
    expect(screen.getByTestId('slosCreateEmpty')).toHaveTextContent('Create manually');
  });

  it('cross-navigates to Services Home when the empty-state CTA is clicked', async () => {
    const list = jest.fn().mockResolvedValue({
      results: [],
      total: 0,
      pageSize: 20,
      hasMore: false,
      nextCursor: null,
      prevCursor: null,
    });
    await act(async () => {
      renderPage(list);
    });
    await act(async () => {
      fireEvent.click(await screen.findByTestId('slosEmptyGoToServices'));
    });
    expect(navigateToServicesList).toHaveBeenCalledTimes(1);
  });

  it('does not render a header-toolbar Suggest SLOs button (M4)', async () => {
    const list = jest.fn().mockResolvedValue({
      results: [makeSummary()],
      total: 1,
      pageSize: 20,
      hasMore: false,
      nextCursor: null,
      prevCursor: null,
    });
    await act(async () => {
      renderPage(list);
    });
    await screen.findByTestId('slosTable');
    expect(screen.queryByTestId('slosSuggest')).not.toBeInTheDocument();
  });

  it('shows the "no matches" empty state with Clear-filters CTA when filtered to zero', async () => {
    const list = jest
      .fn<ReturnType<SloApiClient['list']>, Parameters<SloApiClient['list']>>()
      .mockImplementation(async (filters?: SloListFilters) => {
        if (!filters || !filters.search) {
          return {
            results: [makeSummary({ id: 'a' }), makeSummary({ id: 'b', name: 'b' })],
            total: 2,
            pageSize: 20,
            hasMore: false,
            nextCursor: null,
            prevCursor: null,
          };
        }
        return {
          results: [],
          total: 0,
          pageSize: 20,
          hasMore: false,
          nextCursor: null,
          prevCursor: null,
        };
      });

    await act(async () => {
      renderPage(list);
    });

    await screen.findByTestId('slosTable');

    await act(async () => {
      fireEvent.change(screen.getByTestId('slosListingFilterSearch'), {
        target: { value: 'no-such-thing' },
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('slosEmptyFilteredZero')).toBeInTheDocument();
    });
    expect(screen.getByTestId('slosEmptyFilteredClear')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId('slosEmptyFilteredClear'));
    });
    await waitFor(() => {
      expect(list).toHaveBeenCalledWith(
        expect.not.objectContaining({ search: 'no-such-thing' }),
        null
      );
    });
  });

  it('passes server-side filter args — not client-side filtering — to apiClient.list', async () => {
    const list = jest
      .fn<ReturnType<SloApiClient['list']>, Parameters<SloApiClient['list']>>()
      .mockResolvedValue({
        results: [makeSummary({ id: 'a', status: { ...makeSummary().status, state: 'breached' } })],
        total: 1,
        pageSize: 20,
        hasMore: false,
        nextCursor: null,
        prevCursor: null,
      });

    await act(async () => {
      renderPage(list, '?state=breached');
    });

    await waitFor(() => {
      expect(list).toHaveBeenCalledWith(
        expect.objectContaining({ state: ['breached'], pageSize: 20 }),
        null
      );
    });
  });

  it('hydrates filter state from the URL so a pasted link renders active badges', async () => {
    const list = jest
      .fn<ReturnType<SloApiClient['list']>, Parameters<SloApiClient['list']>>()
      .mockResolvedValue({
        results: [makeSummary()],
        total: 1,
        pageSize: 20,
        hasMore: false,
        nextCursor: null,
        prevCursor: null,
      });

    await act(async () => {
      renderPage(list, '?state=breached,warning&tier=tier-1');
    });

    await screen.findByTestId('slosTable');
    expect(screen.getByTestId('activeFilterBadges')).toBeInTheDocument();
    expect(screen.getByTestId('filterBadge-state')).toHaveTextContent('State: Breached, Warning');
    expect(screen.getByTestId('filterBadge-tier')).toHaveTextContent('Tier: tier-1');
  });
});

describe('SloListingPage — Rules column badge', () => {
  function renderWithSummaries(results: SloSummary[]) {
    const list = jest
      .fn<ReturnType<SloApiClient['list']>, Parameters<SloApiClient['list']>>()
      .mockResolvedValue({
        results,
        total: results.length,
        pageSize: 20,
        hasMore: false,
        nextCursor: null,
        prevCursor: null,
      });
    return renderPage(list);
  }

  it('renders a red "Missing" badge for rules_missing rows', async () => {
    const summary = makeSummary({
      id: 'slo-missing',
      status: { ...makeSummary().status, sloId: 'slo-missing', state: 'rules_missing' },
    });
    await act(async () => {
      renderWithSummaries([summary]);
    });
    const badge = await screen.findByTestId('slosRulesBadge-slo-missing');
    expect(badge).toHaveTextContent('Missing');
    expect(badge).toHaveAttribute('data-test-rule-state', 'missing');
  });

  it('renders "Disabled" badge for disabled rows', async () => {
    const summary = makeSummary({
      id: 'slo-disabled',
      enabled: false,
      status: { ...makeSummary().status, sloId: 'slo-disabled', state: 'disabled' },
    });
    await act(async () => {
      renderWithSummaries([summary]);
    });
    const badge = await screen.findByTestId('slosRulesBadge-slo-disabled');
    expect(badge).toHaveTextContent('Disabled');
    expect(badge).toHaveAttribute('data-test-rule-state', 'disabled');
  });

  it('renders "Active" badge for ok rows', async () => {
    const summary = makeSummary({
      id: 'slo-healthy',
      status: { ...makeSummary().status, sloId: 'slo-healthy', state: 'ok' },
    });
    await act(async () => {
      renderWithSummaries([summary]);
    });
    const badge = await screen.findByTestId('slosRulesBadge-slo-healthy');
    expect(badge).toHaveTextContent('Active');
    expect(badge).toHaveAttribute('data-test-rule-state', 'healthy');
  });

  it('renders "No data" badge for no_data rows', async () => {
    const summary = makeSummary({
      id: 'slo-nodata',
      status: { ...makeSummary().status, sloId: 'slo-nodata', state: 'no_data' },
    });
    await act(async () => {
      renderWithSummaries([summary]);
    });
    const badge = await screen.findByTestId('slosRulesBadge-slo-nodata');
    expect(badge).toHaveTextContent('No data');
    expect(badge).toHaveAttribute('data-test-rule-state', 'no-data');
  });

  it('places the Rules column between Traits and Health', async () => {
    const summary = makeSummary({
      id: 'slo-columns',
      status: { ...makeSummary().status, sloId: 'slo-columns', state: 'ok' },
    });
    await act(async () => {
      renderWithSummaries([summary]);
    });
    await screen.findByTestId('slosTable');
    // EuiInMemoryTable renders the <th> row; we pull text content in order
    // and assert the three columns we care about come in Traits → Rules → Health.
    const headerCells = Array.from(document.querySelectorAll('table thead th'));
    const labels = headerCells
      .map((th) => th.textContent?.trim() ?? '')
      .filter((t) => t === 'Traits' || t === 'Rules' || t === 'Health');
    expect(labels).toEqual(['Traits', 'Rules', 'Health']);
  });
});

describe('SloListingPage — default sort (P1 #7)', () => {
  function reportingSummary(id: string, remaining: number, name: string): SloSummary {
    // A row with one objective whose remaining budget is `remaining`, so the
    // component's `worstBudgetRemaining` resolves to that number. Using `ok`
    // as the state keeps the health cell in its reporting branch.
    return {
      id,
      datasourceId: 'ds-1',
      datasourceType: 'prometheus',
      name,
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
        sloId: id,
        objectives: [
          {
            objectiveName: `${id}-obj`,
            currentValue: 0.99,
            currentValueUnit: 'ratio',
            attainment: 0.99,
            errorBudgetRemaining: remaining,
            state: 'ok',
          },
        ],
        state: 'ok',
        firingCount: 0,
        ruleCount: 1,
        computedAt: new Date(0).toISOString(),
      },
    };
  }

  it('renders the lowest-remaining-budget SLO first by default', async () => {
    const a = reportingSummary('a-slo', 0.1, 'a-slo');
    const b = reportingSummary('b-slo', 0.9, 'b-slo');
    const c = reportingSummary('c-slo', 0.05, 'c-slo');
    const list = jest.fn().mockResolvedValue({
      results: [a, b, c],
      total: 3,
      pageSize: 20,
      hasMore: false,
      nextCursor: null,
      prevCursor: null,
    });
    await act(async () => {
      renderPage(list);
    });
    await screen.findByTestId('slosTable');
    // Name-cell anchors inherit row order; grab them in DOM order and assert
    // the ids come out worst-first (C=0.05, A=0.10, B=0.90).
    const links = Array.from(
      document.querySelectorAll<HTMLAnchorElement>('[data-test-subj^="slosLink-"]')
    );
    const ids = links.map((el) => el.getAttribute('data-test-subj'));
    expect(ids).toEqual(['slosLink-c-slo', 'slosLink-a-slo', 'slosLink-b-slo']);
  });
});

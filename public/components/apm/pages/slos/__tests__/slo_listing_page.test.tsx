/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route } from 'react-router-dom';
import { SloListingPage } from '../slo_listing_page';
import type { SloApiClient } from '../slo_api_client';
import type { SloListFilters, SloSummary } from '../../../../../../common/slo/slo_types';
import {
  navigateToServicesList,
  navigateToSloSuggest,
} from '../../../shared/utils/navigation_utils';
import { useServices } from '../../../shared/hooks/use_services';

jest.mock('../../../shared/utils/navigation_utils', () => ({
  navigateToServicesList: jest.fn(),
  navigateToSloSuggest: jest.fn(),
}));

// The onboarding empty state discovers APM services to decide whether to pitch
// "Suggest SLOs" (services exist) or "Set up services" (none yet). Mock the hook
// so each test drives the branch it wants without a live PPL backend.
jest.mock('../../../shared/hooks/use_services', () => ({
  useServices: jest.fn(),
}));

const mockUseServices = useServices as jest.Mock;
const setDiscoveredServices = (names: string[]) =>
  mockUseServices.mockReturnValue({
    data: names.map((name) => ({ serviceName: name })),
    isLoading: false,
    error: null,
    availableGroupByAttributes: {},
    refetch: jest.fn(),
  });

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
  const apiClient = { list: listImpl } as unknown as SloApiClient;
  const chrome = { setBreadcrumbs: jest.fn() } as unknown as Parameters<
    typeof SloListingPage
  >[0]['chrome'];
  const notifications = {
    toasts: { addDanger: jest.fn(), addWarning: jest.fn(), addSuccess: jest.fn() },
  } as unknown as Parameters<typeof SloListingPage>[0]['notifications'];
  // The listing page fires one GET to /api/alerting/datasources on mount.
  // Resolve it to an empty list so the facet renders the "no datasources
  // registered" text and the rest of the page doesn't wait on a real fetch.
  const http = {
    get: jest.fn().mockResolvedValue({ datasources: [] }),
  } as unknown as Parameters<typeof SloListingPage>[0]['http'];
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
    (navigateToSloSuggest as jest.Mock).mockReset();
    // Default the onboarding empty state to the "services discovered" branch so
    // it leads with Suggest SLOs. Tests that need the "no services" branch
    // override this with setDiscoveredServices([]).
    setDiscoveredServices(['payments-api', 'checkout']);
  });

  it('leads with the "Suggest SLOs" onboarding when services are discovered', async () => {
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
    // Services exist → fastest path to a first SLO is the Suggest batch flow,
    // so it leads as the primary CTA with "Create manually" as the fallback.
    const suggestCta = screen.getByTestId('slosEmptySuggest');
    expect(suggestCta).toHaveTextContent('Suggest SLOs');
    expect(screen.getByTestId('slosCreateEmpty')).toHaveTextContent('Create manually');
    await act(async () => {
      fireEvent.click(suggestCta);
    });
    // The CTA must hand the discovered service names to the Suggest page as its
    // scope — otherwise it lands unscoped and drafts nothing, contradicting the
    // "we discovered services and can draft SLOs" onboarding copy.
    expect(navigateToSloSuggest).toHaveBeenCalledTimes(1);
    expect(navigateToSloSuggest).toHaveBeenCalledWith(['payments-api', 'checkout']);
  });

  it('guides the user to set up services when none are discovered', async () => {
    // No services → Suggest SLOs has nothing to draft against, so the empty
    // state steers the user to set up services first.
    setDiscoveredServices([]);
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
    const servicesCta = await screen.findByTestId('slosEmptyGoToServices');
    expect(servicesCta).toHaveTextContent('Set up services');
    expect(screen.getByTestId('slosCreateEmpty')).toHaveTextContent('Create manually');
    await act(async () => {
      fireEvent.click(servicesCta);
    });
    expect(navigateToServicesList).toHaveBeenCalledTimes(1);
  });

  it('surfaces an enabled Suggest SLOs toolbar button when SLOs and services exist', async () => {
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
    const suggest = screen.getByTestId('slosSuggest');
    expect(suggest).toHaveTextContent('Suggest SLOs');
    expect(suggest).not.toBeDisabled();
    await act(async () => {
      fireEvent.click(suggest);
    });
    expect(navigateToSloSuggest).toHaveBeenCalledTimes(1);
  });

  it('disables the Suggest SLOs toolbar button when no services are discovered', async () => {
    // SLOs can exist without APM services (e.g. custom PromQL SLOs); with no
    // services, Suggest has nothing to draft against, so the button is disabled.
    setDiscoveredServices([]);
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
    const suggest = screen.getByTestId('slosSuggest');
    expect(suggest).toBeDisabled();
    fireEvent.click(suggest);
    expect(navigateToSloSuggest).not.toHaveBeenCalled();
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

describe('SloListingPage — row order preserves the server order (M7)', () => {
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

  it('does NOT re-sort the page client-side by remaining budget', async () => {
    // Error-budget-remaining is a derived value the backend cannot sort on, so
    // re-ordering only the current page by it implied a global "worst first"
    // ordering the paginated list never had (a breached SLO on page 2 would
    // never surface on page 1). The page now renders rows in the order the
    // server returned them. Server order here is [a=0.1, b=0.9, c=0.05]; the
    // old behavior would have reordered to worst-first [c, a, b].
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
    const links = Array.from(
      document.querySelectorAll<HTMLAnchorElement>('[data-test-subj^="slosLink-"]')
    );
    const ids = links.map((el) => el.getAttribute('data-test-subj'));
    expect(ids).toEqual(['slosLink-a-slo', 'slosLink-b-slo', 'slosLink-c-slo']);
  });
});

describe('SloListingPage — health cell state label (M3/CLAR7)', () => {
  function renderOne(results: SloSummary[]) {
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

  it('renders a human, capitalized state label — never the raw enum', async () => {
    const breached = makeSummary({
      id: 'slo-breached',
      status: { ...makeSummary().status, sloId: 'slo-breached', state: 'breached' },
    });
    await act(async () => {
      renderOne([breached]);
    });
    const cell = await screen.findByTestId('slosHealthCell-slo-breached');
    expect(within(cell).getByText('Breached')).toBeInTheDocument();
    // The raw machine value must not leak into the cell.
    expect(within(cell).queryByText('breached')).not.toBeInTheDocument();
  });

  it('humanizes the multi-word source_idle state', async () => {
    const idle = makeSummary({
      id: 'slo-idle',
      status: { ...makeSummary().status, sloId: 'slo-idle', state: 'source_idle' },
    });
    await act(async () => {
      renderOne([idle]);
    });
    const cell = await screen.findByTestId('slosHealthCell-slo-idle');
    expect(within(cell).getByText('Source idle')).toBeInTheDocument();
    expect(within(cell).queryByText('source_idle')).not.toBeInTheDocument();
  });
});

describe('SloListingPage — fixed target precision (M4)', () => {
  function renderOne(results: SloSummary[]) {
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

  it('renders every target with the same (2-decimal) precision so columns line up', async () => {
    // Old behavior: 0.999 → "99.90%" (2dp) but 0.99 → "99.0%" (1dp), so the
    // decimals varied per row. Both must now render at 2 decimals.
    const high = makeSummary({ id: 'slo-high', worstTarget: 0.999 });
    const low = makeSummary({ id: 'slo-low', worstTarget: 0.99 });
    await act(async () => {
      renderOne([high, low]);
    });
    await screen.findByTestId('slosTable');
    expect(screen.getByText('1 • 99.90%')).toBeInTheDocument();
    expect(screen.getByText('1 • 99.00%')).toBeInTheDocument();
  });
});

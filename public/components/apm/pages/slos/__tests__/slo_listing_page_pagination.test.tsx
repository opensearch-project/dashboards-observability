/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Cursor-pagination integration for `SloListingPage`. Mocks the api
 * client; verifies that the prev/next/page-size controls drive the cursor
 * round-trip with the expected reset semantics on filter or page-size
 * change.
 */

import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route } from 'react-router-dom';
import { SloListingPage } from '../slo_listing_page';
import type { SloApiClient } from '../slo_api_client';
import type { SloSummary } from '../../../../../../common/slo/slo_types';

jest.mock('../../../shared/utils/navigation_utils', () => ({
  navigateToServicesList: jest.fn(),
}));
jest.mock('../../../../../plugin_helpers/plugin_headerControl', () => ({
  HeaderControlledComponentsWrapper: ({ components }: { components: React.ReactNode[] }) => (
    <div data-test-subj="header-wrapper">{components}</div>
  ),
}));
jest.mock('../slo_overview_panel', () => ({
  SloOverviewPanel: () => <div data-test-subj="slosOverviewStub" />,
}));

function summary(id: string): SloSummary {
  return {
    id,
    datasourceId: 'ds-1',
    datasourceType: 'prometheus',
    name: id,
    enabled: true,
    mode: 'active',
    service: 'svc',
    owner: { teams: ['t'] },
    sliNodeType: 'single',
    sliBackend: 'prometheus',
    sliLeafType: 'availability',
    objectiveCount: 1,
    worstTarget: 0.99,
    window: { type: 'rolling', duration: '28d' },
    labels: {},
    status: {
      sloId: id,
      objectives: [],
      state: 'ok',
      firingCount: 0,
      ruleCount: 1,
      computedAt: new Date(0).toISOString(),
    },
  };
}

function renderPage(list: SloApiClient['list'], initialSearch = '') {
  const apiClient = ({ list } as unknown) as SloApiClient;
  const chrome = ({ setBreadcrumbs: jest.fn() } as unknown) as Parameters<
    typeof SloListingPage
  >[0]['chrome'];
  const notifications = ({
    toasts: { addDanger: jest.fn(), addWarning: jest.fn(), addSuccess: jest.fn() },
  } as unknown) as Parameters<typeof SloListingPage>[0]['notifications'];
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

describe('SloListingPage — cursor pagination controls', () => {
  it('initial render: prev disabled, next enabled when hasMore', async () => {
    const list = jest.fn().mockResolvedValue({
      results: [summary('a'), summary('b')],
      total: 50,
      pageSize: 20,
      hasMore: true,
      nextCursor: 'next-1',
      prevCursor: null,
    });
    await act(async () => {
      renderPage(list);
    });
    await screen.findByTestId('slosTable');
    const prev = screen.getByTestId('slosPaginationPrev');
    const next = screen.getByTestId('slosPaginationNext');
    expect(prev).toBeDisabled();
    expect(next).not.toBeDisabled();
  });

  it('clicking next re-issues the request with the nextCursor', async () => {
    const list = jest
      .fn()
      .mockResolvedValueOnce({
        results: [summary('a')],
        total: 30,
        pageSize: 20,
        hasMore: true,
        nextCursor: 'cursor-2',
        prevCursor: null,
      })
      .mockResolvedValueOnce({
        results: [summary('b')],
        total: 30,
        pageSize: 20,
        hasMore: false,
        nextCursor: null,
        prevCursor: 'cursor-1',
      });
    await act(async () => {
      renderPage(list);
    });
    await screen.findByTestId('slosLink-a');
    await act(async () => {
      fireEvent.click(screen.getByTestId('slosPaginationNext'));
    });
    await waitFor(() => {
      expect(list).toHaveBeenCalledTimes(2);
    });
    expect(list.mock.calls[1][1]).toBe('cursor-2');
  });

  it('changing page size resets the cursor to null and re-requests', async () => {
    const list = jest.fn().mockResolvedValue({
      results: [summary('a')],
      total: 30,
      pageSize: 20,
      hasMore: true,
      nextCursor: 'cursor-2',
      prevCursor: null,
    });
    await act(async () => {
      renderPage(list);
    });
    await screen.findByTestId('slosTable');
    list.mockClear();
    await act(async () => {
      fireEvent.change(screen.getByTestId('slosPaginationPageSize'), { target: { value: '50' } });
    });
    await waitFor(() => {
      expect(list).toHaveBeenCalled();
    });
    const lastCall = list.mock.calls[list.mock.calls.length - 1];
    expect(lastCall[1]).toBeNull();
    expect(lastCall[0]).toEqual(expect.objectContaining({ pageSize: 50 }));
  });

  it('filter change resets the cursor', async () => {
    const list = jest
      .fn()
      .mockResolvedValueOnce({
        results: [summary('a')],
        total: 30,
        pageSize: 20,
        hasMore: true,
        nextCursor: 'cursor-2',
        prevCursor: null,
      })
      .mockResolvedValueOnce({
        results: [summary('b')],
        total: 30,
        pageSize: 20,
        hasMore: false,
        nextCursor: null,
        prevCursor: 'cursor-1',
      })
      .mockResolvedValue({
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
    await screen.findByTestId('slosLink-a');
    await act(async () => {
      fireEvent.click(screen.getByTestId('slosPaginationNext'));
    });
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));

    // Now change the search filter — cursor should reset to null.
    await act(async () => {
      fireEvent.change(screen.getByTestId('slosListingFilterSearch'), {
        target: { value: 'q' },
      });
    });
    await waitFor(() => expect(list).toHaveBeenCalledTimes(3));
    expect(list.mock.calls[2][1]).toBeNull();
  });

  it('hydrates the cursor from the URL on mount', async () => {
    const list = jest.fn().mockResolvedValue({
      results: [summary('a')],
      total: 30,
      pageSize: 20,
      hasMore: false,
      nextCursor: null,
      prevCursor: 'pre',
    });
    await act(async () => {
      renderPage(list, '?cursor=loaded-cursor');
    });
    await waitFor(() => expect(list).toHaveBeenCalled());
    expect(list.mock.calls[0][1]).toBe('loaded-cursor');
  });
});

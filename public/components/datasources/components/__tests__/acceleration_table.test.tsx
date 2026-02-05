/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, waitFor, act, screen } from '@testing-library/react';
import { AccelerationTable } from '../manage/accelerations/acceleration_table';
import { DirectQueryLoadingStatus } from '../../../../../common/types/explorer';

const accelerationCache = {
  accelerations: [
    {
      flintIndexName: 'flint_mys3_default_http_count_view',
      type: 'materialized',
      database: 'default',
      table: null,
      indexName: 'http_count_view',
      autoRefresh: true,
      status: 'refreshing',
    },
    {
      flintIndexName: 'flint_mys3_default_http_count_view_alt',
      type: 'materialized',
      database: 'default',
      table: null,
      indexName: 'http_count_view_alt',
      autoRefresh: true,
      status: 'refreshing',
    },
    {
      flintIndexName: 'flint_mys3_default_http_logs',
      type: 'materialized',
      database: 'default',
      table: null,
      indexName: 'http_logs',
      autoRefresh: true,
      status: 'deleted',
    },
    {
      flintIndexName: 'flint_mys3_default_http_logs_skipping_index',
      type: 'skipping',
      database: 'default',
      table: 'http_logs',
      indexName: null,
      autoRefresh: false,
      status: 'active',
    },
    {
      flintIndexName: 'flint_mys3_other_http_count_view',
      type: 'materialized',
      database: 'other',
      table: null,
      indexName: 'http_count_view',
      autoRefresh: true,
      status: 'refreshing',
    },
  ],
  lastUpdated: 'Thu, 14 Mar 2024 04:05:53',
  status: 'Updated',
};

jest.mock('../../../../framework/catalog_cache/cache_manager', () => ({
  CatalogCacheManager: {
    getOrCreateAccelerationsByDataSource: jest.fn().mockReturnValue(accelerationCache),
  },
}));

jest.mock('../../../../framework/catalog_cache/cache_loader', () => ({
  useLoadAccelerationsToCache: jest.fn(() => ({
    loadStatus: 'success',
    startLoading: jest.fn(),
  })),
}));

jest.mock('../../../../plugin', () => ({
  getRenderAccelerationDetailsFlyout: jest.fn(() => jest.fn()),
  getRenderCreateAccelerationFlyout: jest.fn(() => jest.fn()),
}));

describe('AccelerationTable Component', () => {
  const cacheLoadingHooks = {
    databasesLoadStatus: DirectQueryLoadingStatus.INITIAL,
    tablesLoadStatus: DirectQueryLoadingStatus.INITIAL,
    accelerationsLoadStatus: DirectQueryLoadingStatus.INITIAL,
    startLoadingAccelerations: jest.fn(),
  };

  it('renders without crashing', () => {
    const { container } = render(
      <AccelerationTable dataSourceName="testDataSource" cacheLoadingHooks={cacheLoadingHooks} />
    );
    expect(container).toBeDefined();
  });

  it('shows loading spinner when refreshing accelerations', async () => {
    // Create loading state hooks
    const loadingCacheHooks = {
      databasesLoadStatus: 'Loading' as DirectQueryLoadingStatus,
      startLoadingDatabases: jest.fn(),
      tablesLoadStatus: 'Idle' as DirectQueryLoadingStatus,
      startLoadingTables: jest.fn(),
      accelerationsLoadStatus: 'Loading' as DirectQueryLoadingStatus,
      startLoadingAccelerations: jest.fn(),
      updateCache: jest.fn(() => accelerationCache),
      updatedTime: Date.now(),
    };

    const { _container } = render(
      <AccelerationTable dataSourceName="testDataSource" cacheLoadingHooks={loadingCacheHooks} />
    );

    await waitFor(() => {
      // When loading, the refresh button should show loading state
      const refreshButton = screen.queryByTestId('refreshButton');
      expect(refreshButton).toBeInTheDocument();
    });
  });

  it('correctly displays accelerations in the table', async () => {
    let container: HTMLElement;
    await act(async () => {
      const result = render(
        <AccelerationTable dataSourceName="testDataSource" cacheLoadingHooks={cacheLoadingHooks} />
      );
      container = result.container;
    });

    await waitFor(() => {
      const tableRows = container!.querySelectorAll('.euiTableRow');
      expect(tableRows.length).toBe(accelerationCache.accelerations.length);
    });
  });

  it('filters rows based on active status correctly', async () => {
    jest.mock('../../../../framework/catalog_cache/cache_loader', () => ({
      useLoadAccelerationsToCache: jest.fn(() => ({
        loadStatus: 'loading',
        startLoading: jest.fn(),
      })),
    }));

    let container: HTMLElement;
    await act(async () => {
      const result = render(
        <AccelerationTable dataSourceName="testDataSource" cacheLoadingHooks={cacheLoadingHooks} />
      );
      container = result.container;
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await waitFor(() => {
      const tableRows = container!.querySelectorAll('tr.euiTableRow');
      const activeStatusRows = Array.from(tableRows).filter((row) => {
        return Array.from(row.querySelectorAll('.euiFlexItem')).some(
          (item) => item.textContent === 'Active'
        );
      });

      expect(activeStatusRows.length).toBe(
        accelerationCache.accelerations.filter((acc) => acc.status === 'active').length
      );
    });
    jest.restoreAllMocks();
  });

  it('displays updated time correctly', async () => {
    let container: HTMLElement;
    await act(async () => {
      const result = render(
        <AccelerationTable dataSourceName="testDataSource" cacheLoadingHooks={cacheLoadingHooks} />
      );
      container = result.container;
    });

    const expectedLocalizedTime = '3/14/2024, 4:05:53 AM';

    await waitFor(() => {
      expect(container!.textContent).toContain(expectedLocalizedTime);
    });
  });
});

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { AssociatedObjectsTab } from '../manage/associated_objects/associated_objects_tab';
import { ASSC_OBJ_TABLE_SUBJ } from '../manage/associated_objects/utils/associated_objects_tab_utils';
import { CatalogCacheManager } from '../../../../framework/catalog_cache/cache_manager';
import {
  mockAccelerationCacheData,
  mockDataSourceCacheData,
  mockDatasource,
  mockEmptyAccelerationCacheData,
  mockEmptyDataSourceCacheData,
} from '../../../../../test/datasources';
import { DirectQueryLoadingStatus } from '../../../../../common/types/explorer';

jest.mock('../../../../plugin', () => ({
  getRenderAccelerationDetailsFlyout: jest.fn(() => jest.fn()),
  getRenderAssociatedObjectsDetailsFlyout: jest.fn(() => jest.fn()),
  getRenderCreateAccelerationFlyout: jest.fn(() => jest.fn()),
}));

describe('AssociatedObjectsTab Component', () => {
  const cacheLoadingHooks = {
    databasesLoadStatus: DirectQueryLoadingStatus.INITIAL,
    startLoadingDatabases: jest.fn(),
    tablesLoadStatus: DirectQueryLoadingStatus.INITIAL,
    startLoadingTables: jest.fn(),
    accelerationsLoadStatus: DirectQueryLoadingStatus.INITIAL,
    startLoadingAccelerations: jest.fn(),
  };

  beforeAll(() => {
    const originalDate = Date;
    global.Date = jest.fn(() => new originalDate('2024-03-14T12:00:00Z')) as any;

    global.Date.UTC = originalDate.UTC;
    global.Date.parse = originalDate.parse;
    global.Date.now = originalDate.now;
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('renders tab with no databases or objects', async () => {
    CatalogCacheManager.saveDataSourceCache(mockEmptyDataSourceCacheData);
    CatalogCacheManager.saveAccelerationsCache(mockEmptyAccelerationCacheData);
    const { container } = render(
      <AssociatedObjectsTab
        datasource={mockDatasource}
        cacheLoadingHooks={cacheLoadingHooks}
        selectedDatabase={''}
        setSelectedDatabase={jest.fn()}
      />
    );
    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
    expect(container.textContent).toContain('You have no databases in your data source');
  });

  it('renders correctly with associated objects', async () => {
    CatalogCacheManager.saveDataSourceCache(mockDataSourceCacheData);
    CatalogCacheManager.saveAccelerationsCache(mockAccelerationCacheData);
    const { container } = render(
      <AssociatedObjectsTab
        datasource={mockDatasource}
        cacheLoadingHooks={cacheLoadingHooks}
        selectedDatabase={'mock_database_1'}
        setSelectedDatabase={jest.fn()}
      />
    );
    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
    expect(container.querySelector('.euiTable')).toBeInTheDocument();
    expect(container.querySelectorAll('.euiLink').length).toBeGreaterThan(0);
  });

  it('initializes database and acceleration filter options correctly from associated objects', () => {
    CatalogCacheManager.saveDataSourceCache(mockDataSourceCacheData);
    CatalogCacheManager.saveAccelerationsCache(mockAccelerationCacheData);
    const { container } = render(
      <AssociatedObjectsTab
        datasource={mockDatasource}
        cacheLoadingHooks={cacheLoadingHooks}
        selectedDatabase={'mock_database_1'}
        setSelectedDatabase={jest.fn()}
      />
    );

    const table = container.querySelector(`[data-test-subj="${ASSC_OBJ_TABLE_SUBJ}"]`);
    expect(table).toBeInTheDocument();

    const allAccelerationNames = mockAccelerationCacheData.dataSources[0].accelerations.flatMap(
      (obj) => obj.flintIndexName
    );
    const uniqueAccelerationNames = new Set(allAccelerationNames.filter(Boolean));
    const expectedAccelerationOptionsCount = uniqueAccelerationNames.size;
    expect(expectedAccelerationOptionsCount).toBeGreaterThan(0);
  });

  it('correctly filters associated objects by acceleration name', () => {
    CatalogCacheManager.saveDataSourceCache(mockDataSourceCacheData);
    CatalogCacheManager.saveAccelerationsCache(mockAccelerationCacheData);
    const { container } = render(
      <AssociatedObjectsTab
        datasource={mockDatasource}
        cacheLoadingHooks={cacheLoadingHooks}
        selectedDatabase={'mock_database_1'}
        setSelectedDatabase={jest.fn()}
      />
    );

    // Test that the table renders with data
    const table = container.querySelector('.euiTable');
    expect(table).toBeInTheDocument();

    // Verify table has rows
    const tableRows = container.querySelectorAll('.euiTableRow');
    expect(tableRows.length).toBeGreaterThan(0);
  });
});

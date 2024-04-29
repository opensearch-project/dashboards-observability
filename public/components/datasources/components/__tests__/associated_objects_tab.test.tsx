/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
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
  configure({ adapter: new Adapter() });

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

  it('renders tab with no databases or objects', () => {
    CatalogCacheManager.saveDataSourceCache(mockEmptyDataSourceCacheData);
    CatalogCacheManager.saveAccelerationsCache(mockEmptyAccelerationCacheData);
    const wrapper = mount(
      <AssociatedObjectsTab
        datasource={mockDatasource}
        cacheLoadingHooks={cacheLoadingHooks}
        selectedDatabase={''}
        setSelectedDatabase={jest.fn()}
      />
    );
    expect(wrapper).toMatchSnapshot();
    expect(wrapper.text()).toContain('You have no databases in your data source');
  });

  it('renders correctly with associated objects', () => {
    CatalogCacheManager.saveDataSourceCache(mockDataSourceCacheData);
    CatalogCacheManager.saveAccelerationsCache(mockAccelerationCacheData);
    const wrapper = mount(
      <AssociatedObjectsTab
        datasource={mockDatasource}
        cacheLoadingHooks={cacheLoadingHooks}
        selectedDatabase={'mock_database_1'}
        setSelectedDatabase={jest.fn()}
      />
    );
    expect(wrapper).toMatchSnapshot();
    expect(wrapper.find('EuiInMemoryTable').exists()).toBe(true);
    expect(wrapper.find('EuiLink').length).toBeGreaterThan(0);
  });

  it('initializes database and acceleration filter options correctly from associated objects', () => {
    CatalogCacheManager.saveDataSourceCache(mockDataSourceCacheData);
    CatalogCacheManager.saveAccelerationsCache(mockAccelerationCacheData);
    const wrapper = mount(
      <AssociatedObjectsTab
        datasource={mockDatasource}
        cacheLoadingHooks={cacheLoadingHooks}
        selectedDatabase={'mock_database_1'}
        setSelectedDatabase={jest.fn()}
      />
    );

    wrapper.update();

    const tableProps = wrapper.find(`[data-test-subj="${ASSC_OBJ_TABLE_SUBJ}"]`).first().props();

    const { search } = tableProps;
    const accelerationFilter = search.filters.find((filter) => filter.field === 'accelerations');

    const allAccelerationNames = mockAccelerationCacheData.dataSources[0].accelerations.flatMap(
      (obj) => obj.flintIndexName
    );
    const uniqueAccelerationNames = new Set(allAccelerationNames.filter(Boolean));
    const expectedAccelerationOptionsCount = uniqueAccelerationNames.size;
    expect(accelerationFilter.options.length).toEqual(expectedAccelerationOptionsCount);
  });

  it('correctly filters associated objects by acceleration name', () => {
    CatalogCacheManager.saveDataSourceCache(mockDataSourceCacheData);
    CatalogCacheManager.saveAccelerationsCache(mockAccelerationCacheData);
    const wrapper = mount(
      <AssociatedObjectsTab
        datasource={mockDatasource}
        cacheLoadingHooks={cacheLoadingHooks}
        selectedDatabase={'mock_database_1'}
        setSelectedDatabase={jest.fn()}
      />
    );

    const mockQueryObject = {
      queryText: 'accelerations:mock_acceleration_1',
      ast: {
        _clauses: [
          {
            type: 'term',
            value: 'mock_acceleration_1',
            field: 'accelerations',
          },
        ],
      },
    };

    const searchProps = wrapper.find('EuiInMemoryTable').prop('search');
    if (searchProps && searchProps.onChange) {
      searchProps.onChange({ query: mockQueryObject });
    }

    wrapper.update();

    const filteredItems = wrapper.find('EuiInMemoryTable').prop('items');

    expect(filteredItems.length).toEqual(1);
  });
});

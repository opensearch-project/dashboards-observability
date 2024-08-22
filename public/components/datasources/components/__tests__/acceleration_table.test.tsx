/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { mount, configure } from 'enzyme';
import { EuiLoadingSpinner } from '@elastic/eui';
import { AccelerationTable } from '../manage/accelerations/acceleration_table';
import { act } from 'react-dom/test-utils';
import Adapter from 'enzyme-adapter-react-16';
import { ACC_LOADING_MSG } from '../manage/accelerations/utils/acceleration_utils';
import { ReactWrapper } from 'enzyme';
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
  configure({ adapter: new Adapter() });

  const cacheLoadingHooks = {
    databasesLoadStatus: DirectQueryLoadingStatus.INITIAL,
    tablesLoadStatus: DirectQueryLoadingStatus.INITIAL,
    accelerationsLoadStatus: DirectQueryLoadingStatus.INITIAL,
    startLoadingAccelerations: jest.fn(),
  };

  it('renders without crashing', () => {
    const wrapper = mount(
      <AccelerationTable dataSourceName="testDataSource" cacheLoadingHooks={cacheLoadingHooks} />
    );
    expect(wrapper).toBeDefined();
  });

  it('shows loading spinner when refreshing accelerations', async () => {
    jest.mock('../../../../framework/catalog_cache/cache_loader', () => ({
      useLoadAccelerationsToCache: jest.fn(() => ({
        loadStatus: 'loading',
        startLoading: jest.fn(),
      })),
    }));

    let wrapper: ReactWrapper;
    await act(async () => {
      wrapper = mount(
        <AccelerationTable dataSourceName="testDataSource" cacheLoadingHooks={cacheLoadingHooks} />
      );
    });

    wrapper!.update();

    await act(async () => {
      wrapper!.find('[data-test-subj="refreshButton"]').simulate('click');
    });
    wrapper!.update();

    expect(wrapper!.find(EuiLoadingSpinner).exists()).toBe(true);
    expect(wrapper!.text()).toContain(ACC_LOADING_MSG);

    jest.restoreAllMocks();
  });

  it('correctly displays accelerations in the table', async () => {
    let wrapper: ReactWrapper;
    await act(async () => {
      wrapper = mount(
        <AccelerationTable dataSourceName="testDataSource" cacheLoadingHooks={cacheLoadingHooks} />
      );
    });
    wrapper!.update();

    const tableRows = wrapper!.find('EuiTableRow');
    expect(tableRows.length).toBe(accelerationCache.accelerations.length);
  });

  it('filters rows based on active status correctly', async () => {
    jest.mock('../../../../framework/catalog_cache/cache_loader', () => ({
      useLoadAccelerationsToCache: jest.fn(() => ({
        loadStatus: 'loading',
        startLoading: jest.fn(),
      })),
    }));

    let wrapper: ReactWrapper;
    await act(async () => {
      wrapper = mount(
        <AccelerationTable dataSourceName="testDataSource" cacheLoadingHooks={cacheLoadingHooks} />
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
      wrapper!.update();
    });

    const activeStatusRows = wrapper!.find('tr.euiTableRow').filterWhere((node) => {
      return node.find('.euiFlexItem').someWhere((subNode) => subNode.text() === 'Active');
    });

    expect(activeStatusRows.length).toBe(
      accelerationCache.accelerations.filter((acc) => acc.status === 'active').length
    );
    jest.restoreAllMocks();
  });

  it('displays updated time correctly', async () => {
    let wrapper: ReactWrapper;
    await act(async () => {
      wrapper = mount(
        <AccelerationTable dataSourceName="testDataSource" cacheLoadingHooks={cacheLoadingHooks} />
      );
    });
    wrapper!.update();

    const expectedLocalizedTime = '3/14/2024, 4:05:53 AM';

    expect(wrapper!.text()).toContain(expectedLocalizedTime);
  });
});

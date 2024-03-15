/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { mount, configure } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import { AccelerationDetailsFlyout } from '../manage/accelerations/acceleration_details_flyout';
import * as coreRefsModule from '../../../../framework/core_refs';
import { CachedAcceleration } from '../../../../../common/types/data_connections';

jest.mock('../../../../framework/core_refs', () => {
  const actualModule = jest.requireActual('../../../../framework/core_refs');
  return {
    coreRefs: {
      ...actualModule.coreRefs,
      dslService: {
        fetchFields: jest.fn().mockResolvedValue({ data: 'mockFieldData' }),
        fetchSettings: jest.fn().mockResolvedValue({ data: 'mockSettingsData' }),
        fetchIndices: jest.fn().mockResolvedValue({ data: 'mockIndexData' }),
      },
    },
  };
});

jest.mock('../../../../framework/core_refs', () => {
  return {
    coreRefs: {
      dslService: {
        fetchFields: jest.fn().mockResolvedValue({ data: 'mockFieldData' }),
        fetchSettings: jest.fn().mockResolvedValue({ data: 'mockSettingsData' }),
        fetchIndices: jest.fn().mockResolvedValue({
          status: 'fulfilled',
          action: 'getIndexInfo',
          data: [
            {
              health: 'yellow',
              status: 'open',
              index: 'flint_mys3_default_http_count_view',
              uuid: 'VImREbK4SMqJ-i6hSB84eQ',
              pri: '1',
              rep: '1',
              'docs.count': '0',
              'docs.deleted': '0',
              'store.size': '208b',
              'pri.store.size': '208b',
            },
          ],
        }),
      },
    },
  };
});

const mockAcceleration: CachedAcceleration = {
  flintIndexName: 'testIndex',
  type: 'materialized',
  database: 'mockDatabase',
  table: 'mockTable',
  indexName: 'mockIndex',
  autoRefresh: true,
  status: 'Updated',
};

configure({ adapter: new Adapter() });

describe('AccelerationDetailsFlyout Component Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches acceleration details on mount', async () => {
    mount(
      <AccelerationDetailsFlyout
        index="mockIndex"
        acceleration={mockAcceleration}
        dataSourceName="mockDataSource"
      />
    );

    expect(coreRefsModule.coreRefs.dslService!.fetchFields).toHaveBeenCalledWith('testIndex');
    expect(coreRefsModule.coreRefs.dslService!.fetchSettings).toHaveBeenCalledWith('testIndex');
    expect(coreRefsModule.coreRefs.dslService!.fetchIndices).toHaveBeenCalledWith('testIndex');
  });

  it('switches tabs correctly', async () => {
    const wrapper = mount(
      <AccelerationDetailsFlyout
        index="mockIndex"
        acceleration={mockAcceleration}
        dataSourceName="mockDataSource"
      />
    );
    await new Promise(setImmediate);
    wrapper.update();

    const schemaTabExists = wrapper.find('EuiTab').someWhere((node) => node.text() === 'Schema');
    expect(schemaTabExists).toBeTruthy();

    const schemaTab = wrapper.find('EuiTab').filterWhere((node) => node.text() === 'Schema');
    schemaTab.simulate('click');
    await new Promise(setImmediate);
    wrapper.update();

    expect(wrapper.find('AccelerationSchemaTab').exists()).toBe(true);

    // TODO: SQL DEFINATION TAB CHECK
  });
});

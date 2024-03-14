/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import React from 'react';
import { AssociatedObjectsTab } from '../manage/associated_objects/associated_objects_tab';
import {
  mockAssociatedObjects,
  ASSC_OBJ_TABLE_SUBJ,
} from '../manage/associated_objects/utils/associated_objects_tab_utils';

jest.mock('../../../../plugin', () => ({
  getRenderAccelerationDetailsFlyout: jest.fn(() => jest.fn()),
  getRenderAssociatedObjectsDetailsFlyout: jest.fn(() => jest.fn()),
}));

describe('AssociatedObjectsTab Component', () => {
  configure({ adapter: new Adapter() });

  beforeAll(() => {
    const originalDate = Date;
    global.Date = jest.fn(() => new originalDate('2024-03-06T07:02:37.000Z')) as any;

    global.Date.UTC = originalDate.UTC;
    global.Date.parse = originalDate.parse;
    global.Date.now = originalDate.now;
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('renders without crashing with no associated objects', () => {
    const wrapper = mount(<AssociatedObjectsTab associatedObjects={[]} />);
    expect(wrapper).toMatchSnapshot();
    expect(wrapper.text()).toContain('You have no associated objects');
  });

  it('renders correctly with associated objects', () => {
    const wrapper = mount(<AssociatedObjectsTab associatedObjects={mockAssociatedObjects} />);
    expect(wrapper).toMatchSnapshot();
    expect(wrapper.find('EuiInMemoryTable').exists()).toBe(true);
    expect(wrapper.find('EuiLink').length).toBeGreaterThan(0);
  });

  it('initializes database and acceleration filter options correctly from associated objects', () => {
    const wrapper = mount(<AssociatedObjectsTab associatedObjects={mockAssociatedObjects} />);

    wrapper.update();

    const tableProps = wrapper.find(`[data-test-subj="${ASSC_OBJ_TABLE_SUBJ}"]`).first().props();

    const { search } = tableProps;
    const databaseFilter = search.filters.find((filter) => filter.field === 'database');
    const accelerationFilter = search.filters.find((filter) => filter.field === 'accelerations');

    const expectedDatabaseOptionsCount = new Set(mockAssociatedObjects.map((obj) => obj.database))
      .size;
    expect(databaseFilter.options.length).toEqual(expectedDatabaseOptionsCount);

    const allAccelerationNames = mockAssociatedObjects.flatMap((obj) =>
      obj.accelerations.map((acceleration) => acceleration.name)
    );
    const uniqueAccelerationNames = new Set(allAccelerationNames.filter(Boolean));
    const expectedAccelerationOptionsCount = uniqueAccelerationNames.size;
    expect(accelerationFilter.options.length).toEqual(expectedAccelerationOptionsCount);
  });

  it('correctly filters associated objects by acceleration name', () => {
    const wrapper = mount(<AssociatedObjectsTab associatedObjects={mockAssociatedObjects} />);

    const mockQueryObject = {
      queryText: 'accelerations:skipping_index_2',
      ast: {
        _clauses: [
          {
            type: 'term',
            value: 'skipping_index_2',
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
    const expectedFilteredItems = mockAssociatedObjects.filter((obj) =>
      obj.accelerations.some((acc) => acc.name === 'skipping_index_2')
    );

    expect(filteredItems.length).toEqual(expectedFilteredItems.length);

    expectedFilteredItems.forEach((expectedItem) => {
      expect(filteredItems.some((item) => item.id === expectedItem.id)).toBeTruthy();
    });
  });
});

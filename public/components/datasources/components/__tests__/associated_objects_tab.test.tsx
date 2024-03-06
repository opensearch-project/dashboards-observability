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

  it('initializes with correct search filters based on associatedObjects prop', () => {
    const wrapper = mount(<AssociatedObjectsTab associatedObjects={mockAssociatedObjects} />);

    const searchConfig = wrapper
      .find(`[data-test-subj="${ASSC_OBJ_TABLE_SUBJ}"]`)
      .first()
      .prop('search');

    expect(searchConfig.filters).toBeDefined();
    expect(searchConfig.filters.length).toBeGreaterThan(0);

    const databaseFilterOption = searchConfig.filters.find((filter) => filter.field === 'database');
    expect(databaseFilterOption).toBeDefined();
    expect(databaseFilterOption.options.length).toEqual(
      new Set(mockAssociatedObjects.map((obj) => obj.database)).size
    );

    const accelerationFilterOption = searchConfig.filters.find(
      (filter) => filter.field === 'accelerations'
    );
    expect(accelerationFilterOption).toBeDefined();
    expect(accelerationFilterOption.options.length).toEqual(
      new Set(mockAssociatedObjects.flatMap((obj) => obj.accelerations).filter(Boolean)).size
    );
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

    const allAccelerations = mockAssociatedObjects.flatMap((obj) => obj.accelerations);
    const uniqueAccelerations = new Set(allAccelerations);
    const expectedAccelerationOptionsCount = Array.from(uniqueAccelerations).filter(Boolean).length;
    expect(accelerationFilter.options.length).toEqual(expectedAccelerationOptionsCount);
  });
});

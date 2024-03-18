/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { mount, configure } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import { AssociatedObjectsDetailsFlyout } from '../manage/associated_objects/associated_objects_details_flyout';
import * as plugin from '../../../../plugin';
import { act } from '@testing-library/react';
import { mockAssociatedObjects } from '../../../../../test/datasources';
import { getAccelerationName } from '../manage/accelerations/utils/acceleration_utils';

configure({ adapter: new Adapter() });

jest.mock('../../../../plugin', () => ({
  getRenderAccelerationDetailsFlyout: jest.fn(() => jest.fn()),
  getRenderAssociatedObjectsDetailsFlyout: jest.fn(() => jest.fn()),
  getRenderCreateAccelerationFlyout: jest.fn(() => jest.fn()),
}));

describe('AssociatedObjectsDetailsFlyout Integration Tests', () => {
  const mockTableDetail = mockAssociatedObjects[0];

  beforeEach(() => {
    plugin.getRenderAccelerationDetailsFlyout.mockClear();
  });

  it('renders acceleration details correctly and triggers flyout on click', () => {
    const wrapper = mount(
      <AssociatedObjectsDetailsFlyout tableDetail={mockTableDetail} datasourceName="flint_s3" />
    );
    expect(wrapper.find('EuiInMemoryTable').at(0).find('EuiLink').length).toBeGreaterThan(0);

    wrapper.find('EuiInMemoryTable').at(0).find('EuiLink').first().simulate('click');
    expect(plugin.getRenderAccelerationDetailsFlyout).toHaveBeenCalled();
  });

  it('displays no data message for accelerations but still renders schema table', () => {
    const mockDetailNoAccelerations = {
      ...mockTableDetail,
      accelerations: [],
      columns: [
        { fieldName: 'column1', dataType: 'string' },
        { fieldName: 'column2', dataType: 'number' },
      ],
    };

    const wrapper = mount(
      <AssociatedObjectsDetailsFlyout
        tableDetail={mockDetailNoAccelerations}
        datasourceName="flint_s3"
      />
    );

    expect(wrapper.text()).toContain('You have no accelerations');
    expect(wrapper.find('EuiInMemoryTable').exists()).toBe(true);
    expect(wrapper.text()).toContain('column1');
    expect(wrapper.text()).toContain('column2');
  });

  it('renders schema table correctly with column data', () => {
    const wrapper = mount(
      <AssociatedObjectsDetailsFlyout tableDetail={mockTableDetail} datasourceName="flint_s3" />
    );

    expect(wrapper.find('EuiInMemoryTable').at(1).exists()).toBe(true);
    expect(wrapper.find('EuiInMemoryTable').at(1).text()).toContain(
      mockTableDetail.columns[0].fieldName
    );
  });

  it('triggers details flyout on acceleration link click', async () => {
    const wrapper = mount(
      <AssociatedObjectsDetailsFlyout tableDetail={mockTableDetail} datasourceName="flint_s3" />
    );

    await act(async () => {
      // Wait a tick for async updates
      await new Promise((resolve) => setTimeout(resolve, 0));
      wrapper.update();
    });

    const accName = getAccelerationName(mockTableDetail.accelerations[0]);
    const accLink = wrapper
      .find('EuiLink')
      .findWhere((node) => node.text() === accName)
      .first();
    expect(accLink.exists()).toBe(true);

    accLink.simulate('click');
    expect(plugin.getRenderAccelerationDetailsFlyout).toHaveBeenCalled();
  });
});

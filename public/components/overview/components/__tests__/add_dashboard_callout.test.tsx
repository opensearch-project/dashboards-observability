/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AddDashboardCallout } from '../add_dashboard_callout';
import { configure, mount } from 'enzyme';
import { gettingStartedURL } from '../card_configs';
import Adapter from 'enzyme-adapter-react-16';

describe('Add dashboard callout', () => {
  configure({ adapter: new Adapter() });

  const mockShowFlyout = jest.fn();
  const mockNavigateToApp = jest.fn();
  const wrapper = mount(
    <AddDashboardCallout showFlyout={mockShowFlyout} navigateToApp={mockNavigateToApp} />
  );

  it('renders add dashboard callout', async () => {
    expect(wrapper).toMatchSnapshot();
  });

  it('navigates to correct page', async () => {
    wrapper.find('EuiLink').simulate('click');
    expect(mockNavigateToApp).toHaveBeenCalledWith(gettingStartedURL, '#/');
  });

  it('opens flyout', async () => {
    wrapper.find('EuiButton').simulate('click');
    expect(mockShowFlyout).toBeCalledTimes(1);
  });
});

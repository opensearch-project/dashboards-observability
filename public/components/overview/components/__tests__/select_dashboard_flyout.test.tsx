/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import React from 'react';
import { Props, SelectDashboardFlyout } from '../select_dashboard_flyout';

configure({ adapter: new Adapter() });

const mountSelectDashboardFlyout = (props: Partial<Props> = {}) => {
  const defaultProps: Props = {
    closeFlyout: jest.fn(),
    dashboardsSavedObjects: {},
    reloadPage: jest.fn(),
  };

  return mount(<SelectDashboardFlyout {...defaultProps} {...props} />);
};

describe('Select dashboard flyout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render', () => {
    const wrapper = mountSelectDashboardFlyout();
    expect(wrapper).toMatchSnapshot();
  });
});

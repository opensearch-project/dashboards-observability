/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import React from 'react';
import { DashboardControls } from '../dashboard_controls';

configure({ adapter: new Adapter() });

const mountDashboardControls = () => {
  return mount(<DashboardControls />);
};

jest.mock('../../../getting_started/components/utils', () => ({
  redirectToDashboards: jest.fn(),
}));

jest.mock('../../../../framework/core_refs', () => ({
  coreRefs: {
    contentManagement: {
      updatePageSection: jest.fn(),
    },
  },
}));

describe('Dashboard controls', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render', () => {
    const wrapper = mountDashboardControls();
    expect(wrapper).toMatchSnapshot();
  });
});

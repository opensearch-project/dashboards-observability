/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure, mount } from 'enzyme';
import { DashboardControls, Props } from '../dashboard_controls';
import React from 'react';
import Adapter from 'enzyme-adapter-react-16';
import { OnTimeChangeProps } from '@elastic/eui';
import { redirectToDashboards } from '../../../getting_started/components/utils';
import { coreRefs } from '../../../../framework/core_refs';

configure({ adapter: new Adapter() });

const mountDashboardControls = (props: Partial<Props> = {}) => {
  const defaultProps: Props = {
    dashboardTitle: '',
    dashboardId: '',
    startDate: '',
    endDate: '',
    setStartDate: (_: string) => {},
    setEndDate: (_: string) => {},
    showFlyout: () => {},
  };

  return mount(<DashboardControls {...defaultProps} {...props} />);
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

  it('should render with dashboard title', () => {
    const mockDashboardTitle = 'my_dashboard';
    const wrapper = mountDashboardControls({ dashboardTitle: mockDashboardTitle });
    const title = wrapper
      .find('h2')
      .filterWhere((node) => node.text() === mockDashboardTitle)
      .first();
    expect(title.exists()).toBe(true);
  });

  it('title should redirect to dashboard', () => {
    const mockDashboardId = '12345678';
    const wrapper = mountDashboardControls({ dashboardId: mockDashboardId });

    wrapper.find('EuiLink').simulate('click');
    expect(redirectToDashboards).toHaveBeenCalledWith('/view/' + mockDashboardId);
  });

  it('should render date picker with correct start and end dates', () => {
    const mockStartDate = '01/01/2000';
    const mockEndDate = '12/12/2024';

    const wrapper = mountDashboardControls({ startDate: mockStartDate, endDate: mockEndDate });

    const datePicker = wrapper.find('EuiSuperDatePicker');
    expect(datePicker.props().start).toBe(mockStartDate);
    expect(datePicker.props().end).toBe(mockEndDate);
  });

  describe('Date Picker', () => {
    it('should update date when selected', () => {
      const mockSetStartDate = jest.fn();
      const mockSetEndDate = jest.fn();
      const newStartDate = '02/05/2000';
      const newEndDate = '12/05/2024';

      const wrapper = mountDashboardControls({
        setStartDate: mockSetStartDate,
        setEndDate: mockSetEndDate,
      });
      const onTimeChange = wrapper.find('EuiSuperDatePicker').prop('onTimeChange') as (
        props: OnTimeChangeProps
      ) => void;

      onTimeChange({
        end: newEndDate,
        start: newStartDate,
        isInvalid: false,
        isQuickSelection: false,
      });

      expect(mockSetStartDate).toHaveBeenCalledWith(newStartDate);
      expect(mockSetEndDate).toHaveBeenCalledWith(newEndDate);
    });

    it('should update coreRefs when selected', () => {
      const newStartDate = '02/05/2000';
      const newEndDate = '12/05/2024';

      const wrapper = mountDashboardControls();
      const onTimeChange = wrapper.find('EuiSuperDatePicker').prop('onTimeChange') as (
        props: OnTimeChangeProps
      ) => void;

      onTimeChange({
        end: newEndDate,
        start: newStartDate,
        isInvalid: false,
        isQuickSelection: false,
      });

      const updatePageSectionCallback = (coreRefs?.contentManagement
        ?.updatePageSection as jest.Mock).mock.calls[0][1];
      const mockSection = {
        kind: 'dashboard',
        input: {
          timeRange: { to: '', from: '' },
        },
      };
      const result = updatePageSectionCallback(mockSection);

      expect(coreRefs?.contentManagement?.updatePageSection).toHaveBeenCalled();
      expect(result.input.timeRange).toEqual({
        to: newEndDate,
        from: newStartDate,
      });
    });
  });
});

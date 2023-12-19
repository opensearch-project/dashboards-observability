/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { waitFor } from '@testing-library/react';
import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import toJson from 'enzyme-to-json';
import React from 'react';
import { EmptyPanelView } from '../empty_panel';

describe('Empty panel view component', () => {
  configure({ adapter: new Adapter() });

  it('renders empty panel view with disabled popover', async () => {
    const addVizDisabled = true;
    const showFlyout = jest.fn();
    const wrapper = mount(
      <EmptyPanelView addVizDisabled={addVizDisabled} showFlyout={showFlyout} />
    );

    wrapper.update();
    await waitFor(() => {
      expect(
        toJson(wrapper, {
          mode: 'deep',
        })
      ).toMatchSnapshot();
    });
    expect(wrapper.find('EuiButton').prop('disabled')).toBe(true);
  });

  it('renders empty panel view with enabled popover', async () => {
    const addVizDisabled = false;
    const showFlyout = jest.fn();
    const wrapper = mount(
      <EmptyPanelView addVizDisabled={addVizDisabled} showFlyout={showFlyout} />
    );

    wrapper.update();
    await waitFor(() => {
      expect(
        toJson(wrapper, {
          mode: 'deep',
        })
      ).toMatchSnapshot();
    });
    expect(wrapper.find('EuiButton').prop('disabled')).toBe(false);
  });
});

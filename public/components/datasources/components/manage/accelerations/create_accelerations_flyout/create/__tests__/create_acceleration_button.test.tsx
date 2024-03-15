/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { waitFor } from '@testing-library/dom';
import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import toJson from 'enzyme-to-json';
import React from 'react';
import { materializedViewBuilderMock2 } from '../../../../../../../../../test/accelerations';
import { CreateAccelerationButton } from '../create_acceleration_button';

describe('Create acceleration button component', () => {
  configure({ adapter: new Adapter() });

  it('renders create acceleration button component with mv state', async () => {
    const accelerationFormData = materializedViewBuilderMock2;
    const setAccelerationFormData = jest.fn();
    const wrapper = mount(
      <CreateAccelerationButton
        accelerationFormData={accelerationFormData}
        setAccelerationFormData={setAccelerationFormData}
        resetFlyout={jest.fn()}
      />
    );
    wrapper.update();
    await waitFor(() => {
      expect(
        toJson(wrapper, {
          noKey: false,
          mode: 'deep',
        })
      ).toMatchSnapshot();
    });
  });
});

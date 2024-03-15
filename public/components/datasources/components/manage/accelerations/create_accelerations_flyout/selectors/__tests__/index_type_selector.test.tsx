/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { waitFor } from '@testing-library/dom';
import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import toJson from 'enzyme-to-json';
import React from 'react';
import { CreateAccelerationForm } from '../../../../../../../../../common/types/data_connections';
import { createAccelerationEmptyDataMock } from '../../../../../../../../../test/accelerations';
import { IndexTypeSelector } from '../index_type_selector';

describe('Index type selector components', () => {
  configure({ adapter: new Adapter() });

  it('renders type selector with default options', async () => {
    const accelerationFormData = createAccelerationEmptyDataMock;
    const setAccelerationFormData = jest.fn();
    const wrapper = mount(
      <IndexTypeSelector
        accelerationFormData={accelerationFormData}
        setAccelerationFormData={setAccelerationFormData}
        initiateColumnLoad={jest.fn()}
        loading={false}
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

  it('renders type selector with different options', async () => {
    const accelerationFormData: CreateAccelerationForm = {
      ...createAccelerationEmptyDataMock,
      accelerationIndexType: 'covering',
    };
    const setAccelerationFormData = jest.fn();
    const wrapper = mount(
      <IndexTypeSelector
        accelerationFormData={accelerationFormData}
        setAccelerationFormData={setAccelerationFormData}
        initiateColumnLoad={jest.fn()}
        loading={true}
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

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
import { IndexAdvancedSettings } from '../index_advanced_settings';

describe('Advanced Index settings acceleration components', () => {
  configure({ adapter: new Adapter() });

  it('renders acceleration index settings with default options', async () => {
    const accelerationFormData = createAccelerationEmptyDataMock;
    const setAccelerationFormData = jest.fn();
    const wrapper = mount(
      <IndexAdvancedSettings
        accelerationFormData={accelerationFormData}
        setAccelerationFormData={setAccelerationFormData}
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

  it('renders acceleration index settings with default options 2', async () => {
    const accelerationFormData: CreateAccelerationForm = {
      ...createAccelerationEmptyDataMock,
      accelerationIndexType: 'covering',
      primaryShardsCount: 5,
      replicaShardsCount: 1,
    };
    const setAccelerationFormData = jest.fn();
    const wrapper = mount(
      <IndexAdvancedSettings
        accelerationFormData={accelerationFormData}
        setAccelerationFormData={setAccelerationFormData}
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

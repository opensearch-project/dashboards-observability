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
import { IndexSettingOptions } from '../index_setting_options';

describe('Index settings acceleration components', () => {
  configure({ adapter: new Adapter() });

  it('renders acceleration index settings with default options', async () => {
    const accelerationFormData = createAccelerationEmptyDataMock;
    const setAccelerationFormData = jest.fn();
    const wrapper = mount(
      <IndexSettingOptions
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

  it('renders acceleration index settings with different options1', async () => {
    const accelerationFormData: CreateAccelerationForm = {
      ...createAccelerationEmptyDataMock,
      primaryShardsCount: 1,
      replicaShardsCount: 5,
      refreshType: 'manual',
    };
    const setAccelerationFormData = jest.fn();
    const wrapper = mount(
      <IndexSettingOptions
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

  it('renders acceleration index settings with different options2', async () => {
    const accelerationFormData: CreateAccelerationForm = {
      ...createAccelerationEmptyDataMock,
      primaryShardsCount: 5,
      replicaShardsCount: 1,
      refreshType: 'autoInterval',
      refreshIntervalOptions: { refreshWindow: 1, refreshInterval: 'second' },
      checkpointLocation: 's3://test/url',
    };
    const setAccelerationFormData = jest.fn();
    const wrapper = mount(
      <IndexSettingOptions
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

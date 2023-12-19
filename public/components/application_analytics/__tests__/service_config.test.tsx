/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { waitFor } from '@testing-library/react';
import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import toJson from 'enzyme-to-json';
import DSLService from 'public/services/requests/dsl';
import React from 'react';
import { coreStartMock } from '../../../../test/__mocks__/coreMocks';
import { ServiceConfig } from '../components/config_components/service_config';

describe('Service Config component', () => {
  configure({ adapter: new Adapter() });

  it('renders empty service config', async () => {
    const core = coreStartMock;
    const setQuery = jest.fn();
    const setFilters = jest.fn();
    const setStartTime = jest.fn();
    const setEndTime = jest.fn();
    const setSelectedServices = jest.fn();
    const setNameWithStorage = jest.fn();
    const setDescriptionWithStorage = jest.fn();
    const setQueryWithStorage = jest.fn();
    const setFiltersWithStorage = jest.fn();
    const setAppConfigs = jest.fn();
    const setStartTimeWithStorage = jest.fn();
    const setEndTimeWithStorage = jest.fn();
    const dslService = ({
      http: jest.fn(),
      fetch: jest.fn(),
      fetchIndices: jest.fn(),
      fetchFields: jest.fn(),
    } as unknown) as DSLService;
    const wrapper = mount(
      <ServiceConfig
        http={core.http}
        chrome={core.chrome}
        parentBreadcrumb={{ text: 'test', href: 'test#/' }}
        query=""
        setQuery={setQuery}
        filters={[]}
        setFilters={setFilters}
        startTime="now-5m"
        setStartTime={setStartTime}
        endTime="now"
        setEndTime={setEndTime}
        mode="data_prepper"
        dslService={dslService}
        selectedServices={[]}
        setSelectedServices={setSelectedServices}
        name=""
        description=""
        setNameWithStorage={setNameWithStorage}
        setDescriptionWithStorage={setDescriptionWithStorage}
        setQueryWithStorage={setQueryWithStorage}
        setFiltersWithStorage={setFiltersWithStorage}
        appConfigs={[]}
        setAppConfigs={setAppConfigs}
        setStartTimeWithStorage={setStartTimeWithStorage}
        setEndTimeWithStorage={setEndTimeWithStorage}
      />
    );

    wrapper.update();
    await waitFor(() => {
      expect(
        toJson(wrapper, {
          mode: 'deep',
        })
      ).toMatchSnapshot();
    });
  });

  it('renders with one service selected', async () => {
    const core = coreStartMock;
    const setQuery = jest.fn();
    const setFilters = jest.fn();
    const setStartTime = jest.fn();
    const setEndTime = jest.fn();
    const setSelectedServices = jest.fn();
    const setNameWithStorage = jest.fn();
    const setDescriptionWithStorage = jest.fn();
    const setQueryWithStorage = jest.fn();
    const setFiltersWithStorage = jest.fn();
    const setAppConfigs = jest.fn();
    const setStartTimeWithStorage = jest.fn();
    const setEndTimeWithStorage = jest.fn();
    const dslService = ({
      http: jest.fn(),
      fetch: jest.fn(),
      fetchIndices: jest.fn(),
      fetchFields: jest.fn(),
    } as unknown) as DSLService;
    const serviceFilter = [
      {
        field: 'serviceName',
        operator: 'is',
        value: 'User',
        inverted: false,
        disabled: false,
      },
    ];
    const wrapper = mount(
      <ServiceConfig
        http={core.http}
        chrome={core.chrome}
        parentBreadcrumb={{ text: 'test', href: 'test#/' }}
        query=""
        setQuery={setQuery}
        filters={serviceFilter}
        setFilters={setFilters}
        startTime="now-5m"
        setStartTime={setStartTime}
        endTime="now"
        setEndTime={setEndTime}
        mode="data_prepper"
        dslService={dslService}
        selectedServices={[]}
        setSelectedServices={setSelectedServices}
        name=""
        description=""
        setNameWithStorage={setNameWithStorage}
        setDescriptionWithStorage={setDescriptionWithStorage}
        setQueryWithStorage={setQueryWithStorage}
        setFiltersWithStorage={setFiltersWithStorage}
        appConfigs={[]}
        setAppConfigs={setAppConfigs}
        setStartTimeWithStorage={setStartTimeWithStorage}
        setEndTimeWithStorage={setEndTimeWithStorage}
      />
    );

    wrapper.update();
    await waitFor(() => {
      expect(
        toJson(wrapper, {
          mode: 'deep',
        })
      ).toMatchSnapshot();
    });
  });
});

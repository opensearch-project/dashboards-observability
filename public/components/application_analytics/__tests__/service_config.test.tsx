/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render } from '@testing-library/react';
import { ServiceConfig } from '../components/config_components/service_config';
// eslint-disable-next-line jest/no-mocks-import
import { coreStartMock } from '../../../../test/__mocks__/coreMocks';
import DSLService from 'public/services/requests/dsl';

describe('Service Config component', () => {
  it('renders empty service config', () => {
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
    render(
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

    expect(document.body).toMatchSnapshot();
  });

  it('renders with one service selected', () => {
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
    render(
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

    expect(document.body).toMatchSnapshot();
  });
});

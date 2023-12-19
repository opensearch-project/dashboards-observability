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
import { TraceConfig } from '../components/config_components/trace_config';

describe('Trace Config component', () => {
  configure({ adapter: new Adapter() });

  it('renders empty trace config', async () => {
    const core = coreStartMock;
    const setQuery = jest.fn();
    const setFilters = jest.fn();
    const setStartTime = jest.fn();
    const setEndTime = jest.fn();
    const setSelectedTraces = jest.fn();
    const setNameWithStorage = jest.fn();
    const setDescriptionWithStorage = jest.fn();
    const setQueryWithStorage = jest.fn();
    const setFiltersWithStorage = jest.fn();
    const dslService = ({
      http: jest.fn(),
      fetch: jest.fn(),
      fetchIndices: jest.fn(),
      fetchFields: jest.fn(),
    } as unknown) as DSLService;
    const wrapper = mount(
      <TraceConfig
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
        indicesExist={true}
        dslService={dslService}
        selectedTraces={[]}
        setSelectedTraces={setSelectedTraces}
        name=""
        description=""
        setNameWithStorage={setNameWithStorage}
        setDescriptionWithStorage={setDescriptionWithStorage}
        setQueryWithStorage={setQueryWithStorage}
        setFiltersWithStorage={setFiltersWithStorage}
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

  it('renders with one trace selected', async () => {
    const core = coreStartMock;
    const setQuery = jest.fn();
    const setFilters = jest.fn();
    const setStartTime = jest.fn();
    const setEndTime = jest.fn();
    const setSelectedTraces = jest.fn();
    const setNameWithStorage = jest.fn();
    const setDescriptionWithStorage = jest.fn();
    const setQueryWithStorage = jest.fn();
    const setFiltersWithStorage = jest.fn();
    const dslService = ({
      http: jest.fn(),
      fetch: jest.fn(),
      fetchIndices: jest.fn(),
      fetchFields: jest.fn(),
    } as unknown) as DSLService;
    const traceFilter = [
      {
        field: 'traceGroup',
        operator: 'is',
        value: 'test.auto',
        inverted: false,
        disabled: false,
      },
    ];
    const wrapper = mount(
      <TraceConfig
        http={core.http}
        chrome={core.chrome}
        parentBreadcrumb={{ text: 'test', href: 'test#/' }}
        query=""
        setQuery={setQuery}
        filters={traceFilter}
        setFilters={setFilters}
        startTime="now-5m"
        setStartTime={setStartTime}
        endTime="now"
        setEndTime={setEndTime}
        indicesExist={true}
        dslService={dslService}
        selectedTraces={[]}
        setSelectedTraces={setSelectedTraces}
        name=""
        description=""
        setNameWithStorage={setNameWithStorage}
        setDescriptionWithStorage={setDescriptionWithStorage}
        setQueryWithStorage={setQueryWithStorage}
        setFiltersWithStorage={setFiltersWithStorage}
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

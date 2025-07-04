/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import React from 'react';
import { Dashboard } from '..';
import { coreStartMock } from '../../../../../../test/__mocks__/coreMocks';

describe('Dashboard component', () => {
  configure({ adapter: new Adapter() });
  const modes = [
    { id: 'jaeger', title: 'Jaeger' },
    { id: 'data_prepper', title: 'Data Prepper' },
  ];

  it('renders empty dashboard', () => {
    const core = coreStartMock;
    const setQuery = jest.fn();
    const setFilters = jest.fn();
    const setStartTime = jest.fn();
    const setEndTime = jest.fn();
    const wrapper = mount(
      <Dashboard
        http={core.http}
        chrome={core.chrome}
        parentBreadcrumbs={[
          {
            text: 'test',
            href: 'test#/',
          },
        ]}
        childBreadcrumbs={[
          {
            text: 'Trace analytics',
            href: '#/trace_analytics/home',
          },
          {
            text: 'Dashboard',
            href: '#/trace_analytics/home',
          },
        ]}
        query=""
        setQuery={setQuery}
        filters={[]}
        appConfigs={[]}
        setFilters={setFilters}
        startTime="now-5m"
        setStartTime={setStartTime}
        endTime="now"
        setEndTime={setEndTime}
        page="dashboard"
        mode="data_prepper"
        modes={modes}
        dataSourceMDSId={[{ id: '', label: '' }]}
        attributesFilterFields={[]}
      />
    );

    expect(wrapper).toMatchSnapshot();
  });

  it('renders empty jaeger dashboard', () => {
    const core = coreStartMock;
    const setQuery = jest.fn();
    const setFilters = jest.fn();
    const setStartTime = jest.fn();
    const setEndTime = jest.fn();
    const wrapper = mount(
      <Dashboard
        http={core.http}
        chrome={core.chrome}
        parentBreadcrumbs={[
          {
            text: 'test',
            href: 'test#/',
          },
        ]}
        childBreadcrumbs={[
          {
            text: 'Trace analytics',
            href: '#/trace_analytics/home',
          },
          {
            text: 'Dashboard',
            href: '#/trace_analytics/home',
          },
        ]}
        query=""
        setQuery={setQuery}
        filters={[]}
        appConfigs={[]}
        setFilters={setFilters}
        startTime="now-5m"
        setStartTime={setStartTime}
        endTime="now"
        setEndTime={setEndTime}
        page="dashboard"
        mode="jaeger"
        jaegerIndicesExist={true}
        modes={modes}
        dataSourceMDSId={[{ id: '', label: '' }]}
        attributesFilterFields={[]}
      />
    );

    expect(wrapper).toMatchSnapshot();
  });

  it('renders dashboard', () => {
    const core = coreStartMock;
    const setQuery = jest.fn();
    const setFilters = jest.fn();
    const setStartTime = jest.fn();
    const setEndTime = jest.fn();
    const wrapper = mount(
      <Dashboard
        http={core.http}
        chrome={core.chrome}
        parentBreadcrumbs={[
          {
            text: 'test',
            href: 'test#/',
          },
        ]}
        childBreadcrumbs={[
          {
            text: 'Trace analytics',
            href: '#/trace_analytics/home',
          },
          {
            text: 'Dashboard',
            href: '#/trace_analytics/home',
          },
        ]}
        query=""
        setQuery={setQuery}
        filters={[]}
        appConfigs={[]}
        setFilters={setFilters}
        startTime="now-5m"
        setStartTime={setStartTime}
        endTime="now"
        setEndTime={setEndTime}
        page="dashboard"
        mode="data_prepper"
        modes={modes}
        dataSourceMDSId={[{ id: '', label: '' }]}
        attributesFilterFields={[]}
      />
    );

    expect(wrapper).toMatchSnapshot();

    wrapper.find('button[data-test-subj="dashboard-table-percentile-button-1"]').simulate('click');
    wrapper.find('button[data-test-subj="dashboard-table-percentile-button-2"]').simulate('click');
  });
});

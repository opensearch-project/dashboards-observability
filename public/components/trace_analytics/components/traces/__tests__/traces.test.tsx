/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import { Traces } from '..';
import { coreStartMock } from '../../../../../../test/__mocks__/coreMocks';

describe('Traces component', () => {
  configure({ adapter: new Adapter() });
  const modes = [
    { id: 'jaeger', title: 'Jaeger' },
    { id: 'data_prepper', title: 'Data Prepper' },
  ];

  it('renders empty traces page', () => {
    const core = coreStartMock;
    const setQuery = jest.fn();
    const setFilters = jest.fn();
    const setStartTime = jest.fn();
    const setEndTime = jest.fn();
    const traceIdColumnAction = (item: any) =>
      location.assign(`#/trace_analytics/traces/${encodeURIComponent(item)}`);
    const childBreadcrumbs = [
      {
        text: 'Trace analytics',
        href: '#/trace_analytics/home',
      },
      {
        text: 'Traces',
        href: '#/trace_analytics/traces',
      },
    ];
    const wrapper = mount(
      <Traces
        http={core.http}
        chrome={core.chrome}
        parentBreadcrumb={{ text: 'test', href: 'test#/' }}
        childBreadcrumbs={childBreadcrumbs}
        traceIdColumnAction={traceIdColumnAction}
        query=""
        setQuery={setQuery}
        filters={[]}
        appConfigs={[]}
        setFilters={setFilters}
        startTime="now-5m"
        setStartTime={setStartTime}
        endTime="now"
        setEndTime={setEndTime}
        page="traces"
        mode="data_prepper"
        dataPrepperIndicesExist={true}
        modes={modes}
      />
    );

    expect(wrapper).toMatchSnapshot();
  });

  it('renders traces page', () => {
    const core = coreStartMock;
    const setQuery = jest.fn();
    const setFilters = jest.fn();
    const setStartTime = jest.fn();
    const setEndTime = jest.fn();
    const traceIdColumnAction = (item: any) =>
      location.assign(`#/trace_analytics/traces/${encodeURIComponent(item)}`);
    const childBreadcrumbs = [
      {
        text: 'Trace analytics',
        href: '#/trace_analytics/home',
      },
      {
        text: 'Traces',
        href: '#/trace_analytics/traces',
      },
    ];
    const wrapper = mount(
      <Traces
        http={core.http}
        chrome={core.chrome}
        parentBreadcrumbs={[{ text: 'test', href: 'test#/' }]}
        childBreadcrumbs={childBreadcrumbs}
        traceIdColumnAction={traceIdColumnAction}
        query=""
        setQuery={setQuery}
        filters={[]}
        appConfigs={[]}
        setFilters={setFilters}
        startTime="now-5m"
        setStartTime={setStartTime}
        endTime="now"
        setEndTime={setEndTime}
        mode="data_prepper"
        page="traces"
        modes={modes}
        dataPrepperIndicesExist={true}
      />
    );

    expect(wrapper).toMatchSnapshot();
  });

  it('renders jaeger traces page', () => {
    const core = coreStartMock;
    const setQuery = jest.fn();
    const setFilters = jest.fn();
    const setStartTime = jest.fn();
    const setEndTime = jest.fn();
    const traceIdColumnAction = (item: any) =>
      location.assign(`#/trace_analytics/traces/${encodeURIComponent(item)}`);
    const childBreadcrumbs = [
      {
        text: 'Trace analytics',
        href: '#/trace_analytics/home',
      },
      {
        text: 'Traces',
        href: '#/trace_analytics/traces',
      },
    ];
    const wrapper = mount(
      <Traces
        http={core.http}
        chrome={core.chrome}
        parentBreadcrumbs={[{ text: 'test', href: 'test#/' }]}
        childBreadcrumbs={childBreadcrumbs}
        traceIdColumnAction={traceIdColumnAction}
        query=""
        setQuery={setQuery}
        filters={[]}
        appConfigs={[]}
        setFilters={setFilters}
        startTime="now-5m"
        setStartTime={setStartTime}
        endTime="now"
        setEndTime={setEndTime}
        mode="jaeger"
        page="traces"
        modes={modes}
        dataPrepperIndicesExist={false}
        jaegerIndicesExist={true}
      />
    );

    expect(wrapper).toMatchSnapshot();
  });
});

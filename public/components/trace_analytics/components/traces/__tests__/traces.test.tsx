/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import React from 'react';
import { Traces } from '..';
import { coreRefs } from '../../../../../framework/core_refs';

describe('Traces component', () => {
  configure({ adapter: new Adapter() });
  const modes = [
    { id: 'jaeger', title: 'Jaeger' },
    { id: 'data_prepper', title: 'Data Prepper' },
  ];

  it('renders empty traces page', () => {
    const { http, chrome } = coreRefs;
    const setQuery = jest.fn();
    const setFilters = jest.fn();
    const setStartTime = jest.fn();
    const setEndTime = jest.fn();
    const getTraceViewUri = jest.fn();
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
        http={http!}
        chrome={chrome!}
        parentBreadcrumb={{ text: 'test', href: 'test#/' }}
        childBreadcrumbs={childBreadcrumbs}
        getTraceViewUri={getTraceViewUri}
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
        modes={modes}
        dataSourceMDSId={[{ id: '', label: '' }]}
        attributesFilterFields={[]}
      />
    );

    expect(wrapper).toMatchSnapshot();
  });

  it('renders traces page', () => {
    const { http, chrome } = coreRefs;
    const setQuery = jest.fn();
    const setFilters = jest.fn();
    const setStartTime = jest.fn();
    const setEndTime = jest.fn();
    const getTraceViewUri = jest.fn();
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
        http={http!}
        chrome={chrome!}
        parentBreadcrumbs={[{ text: 'test', href: 'test#/' }]}
        childBreadcrumbs={childBreadcrumbs}
        getTraceViewUri={getTraceViewUri}
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
        dataSourceMDSId={[{ id: '', label: '' }]}
        attributesFilterFields={[]}
      />
    );

    expect(wrapper).toMatchSnapshot();
  });

  it('renders jaeger traces page', () => {
    const { http, chrome } = coreRefs;
    const setQuery = jest.fn();
    const setFilters = jest.fn();
    const setStartTime = jest.fn();
    const setEndTime = jest.fn();
    const getTraceViewUri = jest.fn();
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
        http={http!}
        chrome={chrome!}
        parentBreadcrumbs={[{ text: 'test', href: 'test#/' }]}
        childBreadcrumbs={childBreadcrumbs}
        getTraceViewUri={getTraceViewUri}
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
        jaegerIndicesExist={true}
        dataSourceMDSId={[{ id: '', label: '' }]}
        attributesFilterFields={[]}
      />
    );

    expect(wrapper).toMatchSnapshot();
  });
});

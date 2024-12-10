/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import React from 'react';
import { ServicesTable } from '../services_table';
import { generateServiceUrl } from '../../common/helper_functions';

describe('Services table component', () => {
  configure({ adapter: new Adapter() });

  it('renders empty services table message', () => {
    const addFilter = jest.fn();
    const setRedirect = jest.fn();
    const traceColumnAction = () => location.assign('#/trace_analytics/traces');
    const wrapper = mount(
      <ServicesTable
        items={[]}
        selectedItems={[]}
        traceColumnAction={traceColumnAction}
        addFilter={addFilter}
        jaegerIndicesExist={false}
        dataPrepperIndicesExist={true}
        mode="data_prepper"
        setRedirect={setRedirect}
        loading={false}
      />
    );

    expect(wrapper).toMatchSnapshot();
  });

  it('renders empty jaeger services table message', () => {
    const addFilter = jest.fn();
    const setRedirect = jest.fn();
    const traceColumnAction = () => location.assign('#/trace_analytics/traces');
    const wrapper = mount(
      <ServicesTable
        items={[]}
        selectedItems={[]}
        traceColumnAction={traceColumnAction}
        addFilter={addFilter}
        jaegerIndicesExist={true}
        dataPrepperIndicesExist={false}
        mode="jaeger"
        setRedirect={setRedirect}
        loading={false}
      />
    );

    expect(wrapper).toMatchSnapshot();
  });

  it('renders services table', () => {
    const tableItems = [
      {
        name: 'database',
        average_latency: 49.54,
        error_rate: 3.77,
        throughput: 53,
        traces: 31,
        connected_services: ['order', 'inventory'],
        number_of_connected_services: 2,
      },
    ];
    const addFilter = jest.fn();
    const setRedirect = jest.fn();
    const traceColumnAction = () => location.assign('#/trace_analytics/traces');
    const wrapper = mount(
      <ServicesTable
        items={tableItems}
        selectedItems={[]}
        traceColumnAction={traceColumnAction}
        mode="data_prepper"
        dataPrepperIndicesExist={true}
        jaegerIndicesExist={false}
        addFilter={addFilter}
        setRedirect={setRedirect}
        loading={false}
      />
    );

    expect(wrapper).toMatchSnapshot();
  });

  it('renders jaeger services table', () => {
    const tableItems = [
      {
        name: 'database',
        average_latency: 49.54,
        error_rate: 3.77,
        throughput: 53,
        traces: 31,
      },
    ];
    const addFilter = jest.fn();
    const setRedirect = jest.fn();
    const traceColumnAction = () => location.assign('#/trace_analytics/traces');
    const wrapper = mount(
      <ServicesTable
        items={tableItems}
        selectedItems={[]}
        traceColumnAction={traceColumnAction}
        mode="jaeger"
        dataPrepperIndicesExist={false}
        jaegerIndicesExist={true}
        addFilter={addFilter}
        setRedirect={setRedirect}
        loading={false}
      />
    );

    expect(wrapper).toMatchSnapshot();
  });

  it('redirects to the correct URL when the service link is clicked', () => {
    const mockDataSourceId = 'mock-data-source-id';
    const tableItems = [
      {
        name: 'checkoutservice',
        average_latency: 100,
        error_rate: 0.5,
        throughput: 200,
        traces: 10,
        itemId: '1',
      },
    ];

    // Mock window.location before rendering
    const originalLocation = window.location;
    delete window.location;
    window.location = { ...originalLocation };

    const wrapper = mount(
      <ServicesTable
        items={tableItems}
        selectedItems={[]}
        setSelectedItems={jest.fn()}
        addServicesGroupFilter={jest.fn()}
        loading={false}
        traceColumnAction={jest.fn()}
        setCurrentSelectedService={jest.fn()}
        addFilter={jest.fn()}
        setRedirect={jest.fn()}
        mode="data_prepper"
        jaegerIndicesExist={false}
        dataPrepperIndicesExist={true}
        isServiceTrendEnabled={false}
        setIsServiceTrendEnabled={jest.fn()}
        serviceTrends={{}}
        dataSourceMDSId={[{ id: mockDataSourceId, label: 'Mock Data Source' }]}
      />
    );

    // Find and click the service link
    const serviceLink = wrapper.find('[data-test-subj="service-link"]').first();
    expect(serviceLink.exists()).toBeTruthy();

    serviceLink.simulate('click');

    const expectedUrl = generateServiceUrl('checkoutservice', mockDataSourceId);
    expect(window.location.href).toBe(expectedUrl);

    window.location = originalLocation;
  });
});

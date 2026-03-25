/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { generateServiceUrl } from '../../common/helper_functions';
import { ServicesTable } from '../services_table';

describe('Services table component', () => {
  it('renders empty services table message', async () => {
    const addFilter = jest.fn();
    const setRedirect = jest.fn();
    const traceColumnAction = () => location.assign('#/trace_analytics/traces');
    render(
      <ServicesTable
        items={[]}
        selectedItems={[]}
        traceColumnAction={traceColumnAction}
        addFilter={addFilter}
        jaegerIndicesExist={false}
        mode="data_prepper"
        setRedirect={setRedirect}
        loading={false}
      />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });

  it('renders empty jaeger services table message', async () => {
    const addFilter = jest.fn();
    const setRedirect = jest.fn();
    const traceColumnAction = () => location.assign('#/trace_analytics/traces');
    render(
      <ServicesTable
        items={[]}
        selectedItems={[]}
        traceColumnAction={traceColumnAction}
        addFilter={addFilter}
        jaegerIndicesExist={true}
        mode="jaeger"
        setRedirect={setRedirect}
        loading={false}
      />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });

  it('renders services table', async () => {
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
    render(
      <ServicesTable
        items={tableItems}
        selectedItems={[]}
        traceColumnAction={traceColumnAction}
        mode="data_prepper"
        jaegerIndicesExist={false}
        addFilter={addFilter}
        setRedirect={setRedirect}
        loading={false}
      />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });

  it('renders jaeger services table', async () => {
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
    render(
      <ServicesTable
        items={tableItems}
        selectedItems={[]}
        traceColumnAction={traceColumnAction}
        mode="jaeger"
        jaegerIndicesExist={true}
        addFilter={addFilter}
        setRedirect={setRedirect}
        loading={false}
      />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });

  it('redirects to the correct URL when the service link is clicked', async () => {
    const mockDataSourceId = 'mock-data-source-id';
    const mockMode = 'data_prepper';
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

    const { getByTestId } = render(
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
        isServiceTrendEnabled={false}
        setIsServiceTrendEnabled={jest.fn()}
        serviceTrends={{}}
        dataSourceMDSId={[{ id: mockDataSourceId, label: 'Mock Data Source' }]}
      />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });

    // Find and click the service link
    const serviceLink = getByTestId('service-link');
    expect(serviceLink).toBeInTheDocument();

    fireEvent.click(serviceLink);

    const expectedUrl = generateServiceUrl('checkoutservice', mockDataSourceId, mockMode);
    expect(window.location.href).toBe(expectedUrl);

    window.location = originalLocation;
  });
});

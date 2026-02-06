/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, waitFor, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { Dashboard } from '..';
// eslint-disable-next-line jest/no-mocks-import
import { coreStartMock } from '../../../../../../test/__mocks__/coreMocks';

describe('Dashboard component', () => {
  const modes = [
    { id: 'jaeger', title: 'Jaeger' },
    { id: 'data_prepper', title: 'Data Prepper' },
  ];

  it('renders empty dashboard', async () => {
    const core = coreStartMock;
    const setQuery = jest.fn();
    const setFilters = jest.fn();
    const setStartTime = jest.fn();
    const setEndTime = jest.fn();
    render(
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

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });

  it('renders empty jaeger dashboard', async () => {
    const core = coreStartMock;
    const setQuery = jest.fn();
    const setFilters = jest.fn();
    const setStartTime = jest.fn();
    const setEndTime = jest.fn();
    render(
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

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });

  it('renders dashboard', async () => {
    const core = coreStartMock;
    const setQuery = jest.fn();
    const setFilters = jest.fn();
    const setStartTime = jest.fn();
    const setEndTime = jest.fn();
    render(
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

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });

    const button1 = screen.getByTestId('dashboard-table-percentile-button-1');
    const button2 = screen.getByTestId('dashboard-table-percentile-button-2');
    fireEvent.click(button1);
    fireEvent.click(button2);
  });
});

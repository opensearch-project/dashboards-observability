/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, waitFor, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { DashboardTable } from '../dashboard_table';

describe('Dashboard table component', () => {
  it('renders empty dashboard table message', async () => {
    const addFilter = jest.fn();
    const addPercentileFilter = jest.fn();
    const setRedirect = jest.fn();
    render(
      <DashboardTable
        items={[]}
        filters={[]}
        addFilter={addFilter}
        addPercentileFilter={addPercentileFilter}
        setRedirect={setRedirect}
        loading={false}
        page="dashboard"
      />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });

  it('renders dashboard table', async () => {
    const tableItems = [
      {
        dashboard_trace_group_name: 'client_create_order',
        dashboard_average_latency: 187.27,
        dashboard_traces: 7,
        dashboard_latency_variance: [26.43, 325.4, 325.4],
        dashboard_error_rate: 14.285714285714285,
        '24_hour_latency_trend': null,
      },
    ];
    const addFilter = jest.fn();
    const addPercentileFilter = jest.fn();
    const setRedirect = jest.fn();
    render(
      <DashboardTable
        items={tableItems}
        filters={[
          {
            field: 'traceGroup',
            operator: 'exists',
            value: 'exists',
            inverted: false,
            disabled: false,
          },
        ]}
        addFilter={addFilter}
        addPercentileFilter={addPercentileFilter}
        setRedirect={setRedirect}
        loading={false}
        page="dashboard"
      />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });

    const percentileButton1 = screen.getByTestId('dashboard-table-percentile-button-1');
    const percentileButton2 = screen.getByTestId('dashboard-table-percentile-button-2');
    fireEvent.click(percentileButton1);
    fireEvent.click(percentileButton2);
    expect(addPercentileFilter).toBeCalledTimes(2);

    const traceGroupButton = screen.getByTestId('dashboard-table-trace-group-name-button');
    fireEvent.click(traceGroupButton);
    expect(addFilter).toBeCalled();

    const tracesButton = screen.getByTestId('dashboard-table-traces-button');
    fireEvent.click(tracesButton);
    expect(setRedirect).toBeCalledWith(true);
  });
});

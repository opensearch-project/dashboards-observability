/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { LatencyTable } from '../top_latency_table';

describe('Latency Table component', () => {
  it('renders empty top error rates table', async () => {
    render(
      <LatencyTable
        title={'Top 5 Service and Operation Error Rates'}
        items={[]}
        filters={[
          {
            field: 'traceGroup',
            operator: 'exists',
            value: 'exists',
            inverted: false,
            disabled: false,
          },
        ]}
        addFilters={jest.fn()}
        addFilter={jest.fn()}
        addPercentileFilter={jest.fn()}
        setRedirect={jest.fn()}
        loading={false}
        page="dashboard"
      />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });

  it('renders top error rates table with data', async () => {
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
      <LatencyTable
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
        addFilters={jest.fn()}
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
});

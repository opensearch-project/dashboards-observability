/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import React from 'react';
import { ErrorRatesTable } from '../top_error_rates_table';

describe('Error Rates Table component', () => {
  configure({ adapter: new Adapter() });

  it('renders empty top error rates table', () => {
    const wrapper = mount(
        <ErrorRatesTable
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

    expect(wrapper).toMatchSnapshot();
  });

  it('renders top error rates table with data', () => {
    const tableItems = [
        {
          dashboard_trace_group_name: 'client_create_order',
          dashboard_average_latency: 187.27,
          dashboard_traces: 7,
          dashboard_latency_variance: [26.43, 325.4, 325.4],
          dashboard_error_rate: 14.285714285714285,
          '24_hour_error_trend': null,
        },
      ];
      const addFilter = jest.fn();
      const addPercentileFilter = jest.fn();
      const setRedirect = jest.fn();
      const wrapper = mount(
        <ErrorRatesTable
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
    expect(wrapper).toMatchSnapshot();
  });
});

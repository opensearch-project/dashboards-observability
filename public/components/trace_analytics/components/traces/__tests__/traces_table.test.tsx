/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { TracesTable } from '../traces_table';

describe('Traces table component', () => {
  it('renders empty traces table message', async () => {
    const refresh = jest.fn();
    const getTraceViewUri = (item: any) => `#/trace_analytics/traces/${encodeURIComponent(item)}`;
    render(
      <TracesTable
        items={[]}
        refresh={refresh}
        jaegerIndicesExist={false}
        mode="data_prepper"
        loading={false}
        getTraceViewUri={getTraceViewUri}
      />
    );
    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });

  it('renders traces table', async () => {
    jest.mock('../../../../../../common/constants/trace_analytics', () => ({ TRACES_MAX_NUM: 1 }));
    const tableItems = [
      {
        trace_id: '00079a615e31e61766fcb20b557051c1',
        trace_group: 'HTTP GET',
        latency: 19.91,
        last_updated: '11/10/2020 09:55:45',
        error_count: 'Yes',
        percentile_in_trace_group: 30,
        actions: '#',
      },
    ];
    const getTraceViewUri = (item: any) => `#/trace_analytics/traces/${encodeURIComponent(item)}`;
    const refresh = jest.fn();
    render(
      <TracesTable
        items={tableItems}
        refresh={refresh}
        jaegerIndicesExist={false}
        mode="data_prepper"
        loading={false}
        getTraceViewUri={getTraceViewUri}
      />
    );
    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });

  it('renders jaeger traces table', async () => {
    jest.mock('../../../../../../common/constants/trace_analytics', () => ({ TRACES_MAX_NUM: 1 }));
    const tableItems = [
      {
        trace_id: '00079a615e31e61766fcb20b557051c1',
        trace_group: 'HTTP GET',
        latency: 19.91,
        last_updated: '11/10/2020 09:55:45',
        error_count: 'Yes',
        actions: '#',
      },
    ];
    const getTraceViewUri = (item: any) => `#/trace_analytics/traces/${encodeURIComponent(item)}`;
    const refresh = jest.fn();
    render(
      <TracesTable
        items={tableItems}
        refresh={refresh}
        jaegerIndicesExist={true}
        mode="jaeger"
        loading={false}
        getTraceViewUri={getTraceViewUri}
      />
    );
    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});

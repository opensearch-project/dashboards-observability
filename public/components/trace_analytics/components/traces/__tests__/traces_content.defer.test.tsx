/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { Traces } from '..';
import { coreRefs } from '../../../../../framework/core_refs';
import { handleServiceMapRequest } from '../../../requests/services_request_handler';
import { handleTracesRequest } from '../../../requests/traces_request_handler';

jest.mock('../../../requests/traces_request_handler', () => ({
  handleTracesRequest: jest.fn(() => Promise.resolve()),
  handleCustomIndicesTracesRequest: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../../requests/services_request_handler', () => ({
  handleServiceMapRequest: jest.fn(() => Promise.resolve()),
}));

const modes = [
  { id: 'jaeger', title: 'Jaeger' },
  { id: 'data_prepper', title: 'Data Prepper' },
];

const childBreadcrumbs = [{ text: 'Traces', href: '#/traces' }];

const renderTraces = (overrides: Record<string, unknown>) => {
  const { http, chrome } = coreRefs;
  return render(
    <Traces
      http={http!}
      chrome={chrome!}
      parentBreadcrumb={{ text: 'test', href: 'test#/' }}
      childBreadcrumbs={childBreadcrumbs}
      getTraceViewUri={jest.fn()}
      query=""
      setQuery={jest.fn()}
      filters={[]}
      appConfigs={[]}
      setFilters={jest.fn()}
      startTime="now-5m"
      setStartTime={jest.fn()}
      endTime="now"
      setEndTime={jest.fn()}
      page="traces"
      mode="data_prepper"
      modes={modes}
      tracesTableMode="traces"
      setTracesTableMode={jest.fn()}
      setCurrentSelectedService={jest.fn()}
      toasts={[]}
      attributesFilterFields={[]}
      {...overrides}
    />
  );
};

describe('TracesContent initial-fetch deferral (MDS)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not fetch on first load while the data source id is unresolved (MDS enabled)', async () => {
    renderTraces({
      dataSourceEnabled: true,
      dataSourceMDSId: [{ id: undefined, label: undefined }],
    });

    // Allow mount effects (including setRedirect(false)) to flush.
    await waitFor(() => {
      expect(handleServiceMapRequest).not.toHaveBeenCalled();
    });
    expect(handleTracesRequest).not.toHaveBeenCalled();
  });

  it('fetches once the data source id resolves (MDS enabled)', async () => {
    const { rerender } = renderTraces({
      dataSourceEnabled: true,
      dataSourceMDSId: [{ id: undefined, label: undefined }],
    });

    await waitFor(() => {
      expect(handleTracesRequest).not.toHaveBeenCalled();
    });

    const { http, chrome } = coreRefs;
    rerender(
      <Traces
        http={http!}
        chrome={chrome!}
        parentBreadcrumb={{ text: 'test', href: 'test#/' }}
        childBreadcrumbs={childBreadcrumbs}
        getTraceViewUri={jest.fn()}
        query=""
        setQuery={jest.fn()}
        filters={[]}
        appConfigs={[]}
        setFilters={jest.fn()}
        startTime="now-5m"
        setStartTime={jest.fn()}
        endTime="now"
        setEndTime={jest.fn()}
        page="traces"
        mode="data_prepper"
        modes={modes}
        tracesTableMode="traces"
        setTracesTableMode={jest.fn()}
        setCurrentSelectedService={jest.fn()}
        toasts={[]}
        attributesFilterFields={[]}
        dataSourceEnabled={true}
        dataSourceMDSId={[{ id: 'remote-cluster-id', label: 'remote' }]}
      />
    );

    await waitFor(() => {
      expect(handleTracesRequest).toHaveBeenCalled();
    });
  });

  it('fetches immediately when MDS is disabled even with an unresolved id', async () => {
    renderTraces({
      dataSourceEnabled: false,
      dataSourceMDSId: [{ id: undefined, label: undefined }],
    });

    await waitFor(() => {
      expect(handleTracesRequest).toHaveBeenCalled();
    });
  });
});

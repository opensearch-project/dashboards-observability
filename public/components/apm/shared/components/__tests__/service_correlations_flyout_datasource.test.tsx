/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react';

// Track executeQuery calls to verify dataSource is passed correctly
const mockExecuteQuery = jest.fn().mockResolvedValue({ jsonData: [] });

jest.mock('../../../query_services/ppl_search_service', () => ({
  PPLSearchService: jest.fn().mockImplementation(() => ({
    executeQuery: mockExecuteQuery,
  })),
}));

jest.mock('../../../config/apm_config_context', () => ({
  useApmConfig: jest.fn(),
}));

jest.mock('../../hooks/use_apm_config', () => ({
  useCorrelatedLogs: jest.fn(),
}));

jest.mock('../../hooks/use_service_attributes', () => ({
  useServiceAttributes: jest.fn().mockReturnValue({
    attributes: {},
    isLoading: false,
    error: null,
  }),
}));

jest.mock('../../../../../framework/core_refs', () => ({
  coreRefs: {
    http: { post: jest.fn() },
    toasts: { addDanger: jest.fn() },
    application: { navigateToApp: jest.fn() },
  },
}));

jest.mock('../../../../../../common/utils', () => ({
  uiSettingsService: {
    get: jest.fn().mockReturnValue('YYYY-MM-DD HH:mm:ss'),
  },
}));

jest.mock('../../utils/navigation_utils', () => ({
  navigateToExploreTraces: jest.fn(),
  navigateToSpanDetails: jest.fn(),
  navigateToExploreLogs: jest.fn(),
  navigateToDatasetCorrelations: jest.fn(),
}));

import { useApmConfig } from '../../../config/apm_config_context';
import { useCorrelatedLogs } from '../../hooks/use_apm_config';
import { ServiceCorrelationsFlyout } from '../service_correlations_flyout';

const DATASOURCE_ID = 'external-datasource-abc';

const mockConfig = {
  config: {
    correlationType: 'APM-Config-test',
    version: '1.0.0',
    tracesDataset: {
      id: 'traces-dataset-id',
      title: 'otel-v1-apm-span*',
      datasourceId: DATASOURCE_ID,
    },
    serviceMapDataset: null,
    prometheusDataSource: null,
    windowDuration: 60,
  },
  loading: false,
  error: null,
  refresh: jest.fn(),
};

const mockCorrelatedLogs = [
  {
    id: 'logs-dataset-id',
    displayName: 'logs-otel-v1*',
    title: 'logs-otel-v1*',
    dataSourceId: DATASOURCE_ID,
    dataSourceTitle: 'External Cluster',
    schemaMappings: {
      serviceName: 'resource.attributes.service.name',
      timestamp: 'time',
      traceId: 'traceId',
    },
  },
];

const defaultProps = {
  serviceName: 'frontend-proxy',
  environment: 'production',
  timeRange: { from: 'now-15m', to: 'now' },
  initialTab: 'spans' as const,
  onClose: jest.fn(),
};

describe('ServiceCorrelationsFlyout dataSource propagation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useApmConfig as jest.Mock).mockReturnValue(mockConfig);
    (useCorrelatedLogs as jest.Mock).mockReturnValue({
      data: mockCorrelatedLogs,
      loading: false,
    });
    // Return span data so logs fetch is triggered (logs wait for spans to finish)
    mockExecuteQuery.mockResolvedValue({
      jsonData: [
        {
          spanId: 'span-1',
          startTime: '2026-03-25T19:55:00',
          traceId: 'trace-123',
          serviceName: 'frontend-proxy',
          name: 'GET /',
          kind: 'SPAN_KIND_SERVER',
          status: { code: 0 },
        },
      ],
    });
  });

  it('should include dataSource in spans query dataset', async () => {
    render(<ServiceCorrelationsFlyout {...defaultProps} />);

    await waitFor(() => {
      expect(mockExecuteQuery).toHaveBeenCalled();
    });

    // First call is the spans query
    const spansCall = mockExecuteQuery.mock.calls[0];
    const spansDataset = spansCall[1];

    expect(spansDataset.dataSource).toEqual({ id: DATASOURCE_ID });
  });

  it('should include dataSource in logs query dataset', async () => {
    render(<ServiceCorrelationsFlyout {...defaultProps} />);

    // Wait for both spans and logs queries to complete
    await waitFor(() => {
      expect(mockExecuteQuery).toHaveBeenCalledTimes(2);
    });

    // Second call is the logs query
    const logsCall = mockExecuteQuery.mock.calls[1];
    const logsDataset = logsCall[1];

    expect(logsDataset.dataSource).toEqual({ id: DATASOURCE_ID });
  });

  it('should omit dataSource when datasourceId is not set', async () => {
    (useApmConfig as jest.Mock).mockReturnValue({
      ...mockConfig,
      config: {
        ...mockConfig.config,
        tracesDataset: {
          id: 'traces-dataset-id',
          title: 'otel-v1-apm-span*',
          // No datasourceId — local cluster
        },
      },
    });
    (useCorrelatedLogs as jest.Mock).mockReturnValue({
      data: [
        {
          ...mockCorrelatedLogs[0],
          dataSourceId: undefined,
        },
      ],
      loading: false,
    });

    render(<ServiceCorrelationsFlyout {...defaultProps} />);

    await waitFor(() => {
      expect(mockExecuteQuery).toHaveBeenCalledTimes(2);
    });

    // Spans query should not have dataSource
    expect(mockExecuteQuery.mock.calls[0][1].dataSource).toBeUndefined();
    // Logs query should not have dataSource
    expect(mockExecuteQuery.mock.calls[1][1].dataSource).toBeUndefined();
  });
});

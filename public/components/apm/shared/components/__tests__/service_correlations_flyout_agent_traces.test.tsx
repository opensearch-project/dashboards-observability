/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

let mockAgentTracesAvailable = true;
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
  navigateToAgentTraces: jest.fn(),
  navigateToAgentTraceDetails: jest.fn(),
  subscribeAgentTracesAvailable: jest.fn((cb: (available: boolean) => void) => {
    cb(mockAgentTracesAvailable);
    return () => {};
  }),
}));

import { useApmConfig } from '../../../config/apm_config_context';
import { useCorrelatedLogs } from '../../hooks/use_apm_config';
import {
  navigateToAgentTraceDetails,
  navigateToAgentTraces,
  navigateToExploreTraces,
  navigateToSpanDetails,
} from '../../utils/navigation_utils';
import { ServiceCorrelationsFlyout } from '../service_correlations_flyout';

const config = {
  config: {
    tracesDataset: { id: 'traces-id', title: 'otel-v1-apm-span*', datasourceId: 'ds-1' },
    serviceMapDataset: null,
    prometheusDataSource: null,
  },
  loading: false,
  error: null,
  refresh: jest.fn(),
};

const span = (spanId: string, attributes: Record<string, unknown> = {}) => ({
  spanId,
  traceId: `trace-${spanId}`,
  startTime: '2026-10-01T10:00:00',
  serviceName: 'travel-planner',
  name: 'op',
  kind: 'SPAN_KIND_INTERNAL',
  status: { code: 0 },
  attributes,
});

const props = {
  serviceName: 'travel-planner',
  environment: 'production',
  timeRange: { from: 'now-15m', to: 'now' },
  initialTab: 'spans' as const,
  onClose: jest.fn(),
};

describe('ServiceCorrelationsFlyout Agent Traces routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAgentTracesAvailable = true;
    (useApmConfig as jest.Mock).mockReturnValue(config);
    (useCorrelatedLogs as jest.Mock).mockReturnValue({ data: [], loading: false });
  });

  it('opens GenAI spans and the service in Agent Traces', async () => {
    mockExecuteQuery.mockResolvedValue({
      jsonData: [
        span('genai', { 'gen_ai.operation.name': 'invoke_agent' }),
        span('http', { 'http.method': 'POST' }),
      ],
    });
    render(<ServiceCorrelationsFlyout {...props} />);
    await waitFor(() => expect(screen.getByText('View in Agent Traces')).toBeInTheDocument());

    fireEvent.click(screen.getByText('genai'));
    expect(navigateToAgentTraceDetails).toHaveBeenCalledWith(
      'traces-id',
      'otel-v1-apm-span*',
      'trace-genai',
      props.timeRange,
      'ds-1',
      undefined
    );
    // A non-GenAI span of the same service keeps the Explore traces span view.
    fireEvent.click(screen.getByText('http'));
    expect(navigateToSpanDetails).toHaveBeenCalledWith(
      'traces-id',
      'otel-v1-apm-span*',
      'http',
      'trace-http',
      'ds-1',
      undefined
    );

    fireEvent.click(screen.getByTestId('apmCorrelationsExploreTraces'));
    expect(navigateToAgentTraces).toHaveBeenCalled();
    expect(navigateToExploreTraces).not.toHaveBeenCalled();
  });

  it('keeps Explore traces for services without GenAI spans', async () => {
    mockExecuteQuery.mockResolvedValue({ jsonData: [span('http')] });
    render(<ServiceCorrelationsFlyout {...props} />);
    await waitFor(() => expect(screen.getByText('http')).toBeInTheDocument());

    expect(screen.getByText('Explore Traces')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('apmCorrelationsExploreTraces'));
    expect(navigateToExploreTraces).toHaveBeenCalled();
    expect(navigateToAgentTraces).not.toHaveBeenCalled();
  });

  it('keeps Explore traces when Agent Traces is not available', async () => {
    mockAgentTracesAvailable = false;
    mockExecuteQuery.mockResolvedValue({
      jsonData: [span('genai', { 'gen_ai.operation.name': 'chat' })],
    });
    render(<ServiceCorrelationsFlyout {...props} />);
    await waitFor(() => expect(screen.getByText('genai')).toBeInTheDocument());

    fireEvent.click(screen.getByText('genai'));
    expect(navigateToSpanDetails).toHaveBeenCalled();
    expect(navigateToAgentTraceDetails).not.toHaveBeenCalled();
    expect(screen.getByText('Explore Traces')).toBeInTheDocument();
  });
});

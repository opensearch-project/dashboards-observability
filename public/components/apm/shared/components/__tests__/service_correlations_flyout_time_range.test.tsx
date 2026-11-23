/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockAgentTracesAvailable = false;
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
import { navigateToExploreTraces } from '../../utils/navigation_utils';
import { ServiceCorrelationsFlyout } from '../service_correlations_flyout';
import { CORRELATION_CONSTANTS } from '../../../common/constants';

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

const logDataset = {
  id: 'logs-id',
  title: 'otel-logs*',
  displayName: 'Logs',
  schemaMappings: { serviceName: 'serviceName', timestamp: 'time', traceId: 'traceId' },
};

const fixedRange = { from: '2026-10-01T00:00:00.000Z', to: '2026-10-01T06:00:00.000Z' };

describe('ServiceCorrelationsFlyout time range', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useApmConfig as jest.Mock).mockReturnValue(config);
    (useCorrelatedLogs as jest.Mock).mockReturnValue({ data: [logDataset], loading: false });
    mockExecuteQuery.mockResolvedValue({ jsonData: [] });
  });

  const queries = () => mockExecuteQuery.mock.calls.map((c) => c[0] as string);

  it('bounds the span query to the selected time range', async () => {
    render(
      <ServiceCorrelationsFlyout
        {...props}
        timeRange={{ from: '2026-10-01T00:00:00.000Z', to: '2026-10-01T06:00:00.000Z' }}
      />
    );
    await waitFor(() => expect(queries().some((q) => q.includes('otel-v1-apm-span*'))).toBe(true));
    const spanQuery = queries().find((q) => q.includes('otel-v1-apm-span*')) as string;
    expect(spanQuery).toContain("`startTime` >= '2026-10-01 00:00:00.000'");
    expect(spanQuery).toContain("`startTime` <= '2026-10-01 06:00:00.000'");
    expect(spanQuery).toContain('head 50');
  });

  it('bounds the log query to the selected range even when no spans were found', async () => {
    render(
      <ServiceCorrelationsFlyout
        {...props}
        initialTab="logs"
        timeRange={{ from: '2026-10-01T00:00:00.000Z', to: '2026-10-01T06:00:00.000Z' }}
      />
    );
    await waitFor(() => expect(queries().some((q) => q.includes('otel-logs*'))).toBe(true));
    const logQuery = queries().find((q) => q.includes('otel-logs*')) as string;
    expect(logQuery).toContain("`time` >= '2026-10-01 00:00:00.000'");
    expect(logQuery).toContain("`time` <= '2026-10-01 06:00:00.000'");
  });

  it('clamps the log window to the selected range when spans fall inside it', async () => {
    mockExecuteQuery.mockImplementation(async (q: string) =>
      q.includes('otel-v1-apm-span*')
        ? { jsonData: [{ ...span('s1'), startTime: '2026-10-01T03:00:00' }] }
        : { jsonData: [] }
    );
    render(
      <ServiceCorrelationsFlyout
        {...props}
        initialTab="logs"
        timeRange={{ from: '2026-10-01T00:00:00.000Z', to: '2026-10-01T06:00:00.000Z' }}
      />
    );
    await waitFor(() => expect(queries().some((q) => q.includes('otel-logs*'))).toBe(true));
    const logQuery = queries()
      .filter((q) => q.includes('otel-logs*'))
      .pop() as string;
    expect(logQuery).toContain("`time` <= '2026-10-01 03:00:00.000'");
    // Lower bound is the span start minus the lag buffer: 03:00 - 5m.
    expect(CORRELATION_CONSTANTS.TELEMETRY_LAG_BUFFER_MS).toBe(5 * 60 * 1000);
    expect(logQuery).toContain("`time` >= '2026-10-01 02:55:00.000'");
  });

  it('explains an empty span list in terms of the time range and filters', async () => {
    render(<ServiceCorrelationsFlyout {...props} />);
    await waitFor(() =>
      expect(screen.getByText('No spans found in the selected time range')).toBeInTheDocument()
    );
    expect(screen.getByText(/Widen the time range or clear the operation/)).toBeInTheDocument();
  });

  it('clamps the lag buffer to the range start when spans begin at the range edge', async () => {
    mockExecuteQuery.mockImplementation(async (q: string) =>
      q.includes('otel-v1-apm-span*')
        ? { jsonData: [{ ...span('s1'), startTime: '2026-10-01T00:01:00' }] }
        : { jsonData: [] }
    );
    render(<ServiceCorrelationsFlyout {...props} initialTab="logs" timeRange={fixedRange} />);
    await waitFor(() => expect(queries().some((q) => q.includes('otel-logs*'))).toBe(true));
    const logQuery = queries()
      .filter((q) => q.includes('otel-logs*'))
      .pop() as string;
    expect(logQuery).toContain("`time` >= '2026-10-01 00:00:00.000'");
  });

  it('applies the time bound together with the operation filter', async () => {
    render(
      <ServiceCorrelationsFlyout {...props} operationFilter="GET /cart" timeRange={fixedRange} />
    );
    await waitFor(() => expect(queries().some((q) => q.includes('otel-v1-apm-span*'))).toBe(true));
    const spanQuery = queries().find((q) => q.includes('otel-v1-apm-span*')) as string;
    expect(spanQuery).toContain("where name = 'GET /cart'");
    expect(spanQuery).toContain("`startTime` >= '2026-10-01 00:00:00.000'");
  });

  it('keeps the time bound on the pre-3.1 coalesce fallback query', async () => {
    mockExecuteQuery.mockImplementation(async (q: string) => {
      if (q.includes('otel-v1-apm-span*') && q.includes('coalesce')) {
        throw new Error('Unsupported function: coalesce');
      }
      return { jsonData: [] };
    });
    render(<ServiceCorrelationsFlyout {...props} timeRange={fixedRange} />);
    await waitFor(() => expect(queries().some((q) => q.includes('otel-v1-apm-span*'))).toBe(true));
    // Pick an HTTP bucket, which is pushed down via coalesce.
    fireEvent.click(screen.getByText('All'));
    fireEvent.click(await screen.findByText('5xx'));
    await waitFor(() =>
      expect(
        queries().some((q) => q.includes('head 1000') && q.includes('otel-v1-apm-span*'))
      ).toBe(true)
    );
    const fallback = queries().find(
      (q) => q.includes('head 1000') && q.includes('otel-v1-apm-span*')
    ) as string;
    expect(fallback).toContain("`startTime` >= '2026-10-01 00:00:00.000'");
    expect(fallback).toContain("`startTime` <= '2026-10-01 06:00:00.000'");
  });

  it('does not reuse the previous range span window for logs after the range changes', async () => {
    mockExecuteQuery.mockImplementation(async (q: string) =>
      q.includes('otel-v1-apm-span*') && q.includes("'2026-10-01 00:00:00.000'")
        ? { jsonData: [{ ...span('s1'), startTime: '2026-10-01T03:00:00' }] }
        : { jsonData: [] }
    );
    const { rerender } = render(
      <ServiceCorrelationsFlyout {...props} initialTab="logs" timeRange={fixedRange} />
    );
    await waitFor(() =>
      expect(queries().some((q) => q.includes("`time` <= '2026-10-01 03:"))).toBe(true)
    );
    mockExecuteQuery.mockClear();
    // New range with no spans: logs must cover the whole new range, not the old span window.
    rerender(
      <ServiceCorrelationsFlyout
        {...props}
        initialTab="logs"
        timeRange={{ from: '2026-10-02T00:00:00.000Z', to: '2026-10-02T06:00:00.000Z' }}
      />
    );
    await waitFor(() => expect(queries().some((q) => q.includes('otel-logs*'))).toBe(true));
    // No intermediate log query may carry the previous range's window or trace ids.
    queries()
      .filter((q) => q.includes('otel-logs*'))
      .forEach((q) => expect(q).not.toContain('2026-10-01'));
    const logQuery = queries()
      .filter((q) => q.includes('otel-logs*'))
      .pop() as string;
    expect(logQuery).toContain("`time` >= '2026-10-02 00:00:00.000'");
    expect(logQuery).toContain("`time` <= '2026-10-02 06:00:00.000'");
  });

  it('carries the active status filter to the Explore Traces link', async () => {
    mockExecuteQuery.mockResolvedValue({ jsonData: [{ ...span('e1'), status: { code: 2 } }] });
    render(<ServiceCorrelationsFlyout {...props} operationFilter="op" timeRange={fixedRange} />);
    await waitFor(() => expect(screen.getByText('e1')).toBeInTheDocument());
    fireEvent.click(screen.getByText('All'));
    const errorOption = (await screen.findAllByRole('option')).find(
      (o) => o.textContent === 'ERROR'
    ) as HTMLElement;
    fireEvent.click(errorOption);
    await waitFor(() => expect(queries().some((q) => q.includes('`status.code` = 2'))).toBe(true));
    fireEvent.click(await screen.findByTestId('apmCorrelationsExploreTraces'));
    expect(navigateToExploreTraces).toHaveBeenLastCalledWith(
      'traces-id',
      'otel-v1-apm-span*',
      'travel-planner',
      fixedRange,
      'ds-1',
      undefined,
      'op',
      ' | where `status.code` = 2'
    );
  });

  it('passes no extra filter to the link when the status filter is All', async () => {
    mockExecuteQuery.mockResolvedValue({ jsonData: [span('a1')] });
    render(<ServiceCorrelationsFlyout {...props} timeRange={fixedRange} />);
    await waitFor(() => expect(screen.getByText('a1')).toBeInTheDocument());
    fireEvent.click(await screen.findByTestId('apmCorrelationsExploreTraces'));
    expect((navigateToExploreTraces as jest.Mock).mock.calls.pop()[7]).toBe('');
  });

  it('ignores a slow span response for a previous range once the range has changed', async () => {
    let resolveStale: (v: unknown) => void = () => {};
    mockExecuteQuery.mockImplementation((q: string) => {
      if (!q.includes('otel-v1-apm-span*')) return Promise.resolve({ jsonData: [] });
      if (q.includes("'2026-10-01 00:00:00.000'")) {
        return new Promise((resolve) => {
          resolveStale = resolve;
        });
      }
      return Promise.resolve({ jsonData: [span('fresh')] });
    });
    const { rerender } = render(<ServiceCorrelationsFlyout {...props} timeRange={fixedRange} />);
    await waitFor(() => expect(queries().some((q) => q.includes('otel-v1-apm-span*'))).toBe(true));
    rerender(
      <ServiceCorrelationsFlyout
        {...props}
        timeRange={{ from: '2026-10-02T00:00:00.000Z', to: '2026-10-02T06:00:00.000Z' }}
      />
    );
    await waitFor(() => expect(screen.getByText('fresh')).toBeInTheDocument());
    // The older request resolves last; it must not replace the current spans.
    resolveStale({ jsonData: [span('stale')] });
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByText('fresh')).toBeInTheDocument();
    expect(screen.queryByText('stale')).not.toBeInTheDocument();
  });

  it('does not carry the status filter to the link while the filtered fetch is loading', async () => {
    mockExecuteQuery.mockImplementation((q: string) =>
      q.includes('otel-v1-apm-span*') && q.includes('coalesce')
        ? new Promise(() => {}) // the HTTP-bucket fetch never settles
        : Promise.resolve({ jsonData: [span('a1')] })
    );
    render(<ServiceCorrelationsFlyout {...props} timeRange={fixedRange} />);
    await waitFor(() => expect(screen.getByText('a1')).toBeInTheDocument());
    fireEvent.click(screen.getByText('All'));
    const option = (await screen.findAllByRole('option')).find(
      (o) => o.textContent === '5xx'
    ) as HTMLElement;
    fireEvent.click(option);
    await waitFor(() => expect(queries().some((q) => q.includes('coalesce'))).toBe(true));
    fireEvent.click(await screen.findByTestId('apmCorrelationsExploreTraces'));
    // coalesce is unsupported before OpenSearch 3.1 and the fetch hasn't confirmed support yet.
    expect((navigateToExploreTraces as jest.Mock).mock.calls.pop()[7]).toBe('');
  });

  it('passes the traces data source title to the Explore Traces link', async () => {
    (useApmConfig as jest.Mock).mockReturnValue({
      ...config,
      config: {
        ...config.config,
        tracesDataset: { ...config.config.tracesDataset, datasourceTitle: 'Local Cluster' },
      },
    });
    mockExecuteQuery.mockResolvedValue({ jsonData: [span('a1')] });
    render(<ServiceCorrelationsFlyout {...props} timeRange={fixedRange} />);
    await waitFor(() => expect(screen.getByText('a1')).toBeInTheDocument());
    fireEvent.click(await screen.findByTestId('apmCorrelationsExploreTraces'));
    expect((navigateToExploreTraces as jest.Mock).mock.calls.pop()[5]).toBe('Local Cluster');
  });
});

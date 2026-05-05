/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  handleGetMetricNames,
  handleGetLabelNames,
  handleGetLabelValues,
  handleGetMetricMetadata,
} from '../metadata_handlers';

const mockService = {
  getMetricNames: jest.fn(),
  getLabelNames: jest.fn(),
  getLabelValues: jest.fn(),
  getMetricMetadata: jest.fn(),
};

const mockClient = {};
const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

describe('metadata_handlers', () => {
  // ---- handleGetMetricNames ----
  it('returns sorted, truncated metric names', async () => {
    mockService.getMetricNames.mockResolvedValueOnce(['z_metric', 'a_metric']);
    const result = await handleGetMetricNames(mockService as never, mockClient, 'ds-1');
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ metrics: ['a_metric', 'z_metric'], total: 2, truncated: false });
  });

  it('returns empty metrics on service error', async () => {
    mockService.getMetricNames.mockRejectedValueOnce(new Error('fail'));
    const result = await handleGetMetricNames(
      mockService as never,
      mockClient,
      'ds-1',
      undefined,
      mockLogger
    );
    expect(result.body).toEqual({ metrics: [], total: 0, truncated: false });
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  // ---- handleGetLabelNames ----
  it('returns sorted label names', async () => {
    mockService.getLabelNames.mockResolvedValueOnce(['job', '__name__']);
    const result = await handleGetLabelNames(mockService as never, mockClient, 'ds-1');
    expect(result.body).toEqual({ labels: ['__name__', 'job'] });
  });

  it('returns empty labels on error', async () => {
    mockService.getLabelNames.mockRejectedValueOnce(new Error('fail'));
    const result = await handleGetLabelNames(
      mockService as never,
      mockClient,
      'ds-1',
      undefined,
      mockLogger
    );
    expect(result.body).toEqual({ labels: [] });
  });

  // ---- handleGetLabelValues ----
  it('returns sorted label values', async () => {
    mockService.getLabelValues.mockResolvedValueOnce(['b', 'a']);
    const result = await handleGetLabelValues(mockService as never, mockClient, 'ds-1', 'job');
    expect(result.body).toEqual({ values: ['a', 'b'], total: 2, truncated: false });
  });

  it('returns empty values on error', async () => {
    mockService.getLabelValues.mockRejectedValueOnce(new Error('fail'));
    const result = await handleGetLabelValues(
      mockService as never,
      mockClient,
      'ds-1',
      'job',
      undefined,
      mockLogger
    );
    expect(result.body).toEqual({ values: [], total: 0, truncated: false });
  });

  // ---- handleGetMetricMetadata ----
  it('returns metadata from service', async () => {
    const meta = [{ metric: 'up', type: 'gauge', help: 'Up' }];
    mockService.getMetricMetadata.mockResolvedValueOnce(meta);
    const result = await handleGetMetricMetadata(mockService as never, mockClient, 'ds-1');
    expect(result).toEqual({ status: 200, body: { metadata: meta } });
  });

  it('returns empty metadata on error', async () => {
    mockService.getMetricMetadata.mockRejectedValueOnce(new Error('fail'));
    const result = await handleGetMetricMetadata(
      mockService as never,
      mockClient,
      'ds-1',
      mockLogger
    );
    expect(result.body).toEqual({ metadata: [] });
  });
});

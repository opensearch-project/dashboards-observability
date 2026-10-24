/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { renderHook, waitFor } from '@testing-library/react';

const mockGetDetail = jest.fn();
jest.mock('../../query_services/alerting_opensearch_service', () => ({
  AlertingOpenSearchService: jest.fn().mockImplementation(() => ({
    getCloudWatchAlarmDetail: mockGetDetail,
  })),
}));
import { useCloudWatchAlarmDetail } from '../use_cloudwatch_alarm_detail';

const params = {
  dsId: 'cloudwatch',
  alarmName: 'checkout-errors-high',
  startTime: '2026-01-01T00:00:00.000Z',
  endTime: '2026-01-22T00:00:00.000Z',
};
const httpError = (status: number) =>
  Object.assign(new Error('Bad Request'), { response: { status } });

beforeEach(() => {
  mockGetDetail.mockReset();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('useCloudWatchAlarmDetail', () => {
  it('sends the window', async () => {
    mockGetDetail.mockResolvedValue({ alarm: { alarmName: 'checkout-errors-high' } });
    const { result } = renderHook(() => useCloudWatchAlarmDetail(params));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockGetDetail).toHaveBeenCalledWith(
      'cloudwatch',
      'checkout-errors-high',
      expect.objectContaining({ startTime: params.startTime, endTime: params.endTime })
    );
    expect(result.current.windowRejected).toBe(false);
  });

  it('reloads without the window when the server rejects it', async () => {
    const detail = { alarm: { alarmName: 'checkout-errors-high' } };
    mockGetDetail.mockRejectedValueOnce(httpError(400)).mockResolvedValueOnce(detail);
    const { result } = renderHook(() => useCloudWatchAlarmDetail(params));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockGetDetail).toHaveBeenCalledTimes(2);
    expect(mockGetDetail.mock.calls[1][2]).not.toHaveProperty('startTime');
    expect(result.current.detail).toEqual(detail);
    expect(result.current.windowRejected).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('still reports other failures as errors', async () => {
    mockGetDetail.mockRejectedValue(httpError(403));
    const { result } = renderHook(() => useCloudWatchAlarmDetail(params));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockGetDetail).toHaveBeenCalledTimes(1);
    expect(result.current.error).not.toBeNull();
  });
});

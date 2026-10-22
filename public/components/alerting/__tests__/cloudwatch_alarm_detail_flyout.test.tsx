/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for the CloudWatch alarm detail flyout, focused on the three data
 * states the hook can hand it: loading, error (classified vs generic, with
 * Retry), and loaded detail (summary + header state chips).
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@osd/i18n/react';
import type { CloudWatchAlarmDetail } from '../../../../common/types/alerting';
import type { ClassifiedError } from '../../../../common/error';
import {
  CloudWatchAlarmDetailFlyout,
  CloudWatchAlarmFlyoutRow,
} from '../cloudwatch_alarm_detail_flyout';
import { useCloudWatchAlarmDetail } from '../hooks/use_cloudwatch_alarm_detail';
import type { AlarmTimeWindow } from '../alarm_time_window';

jest.mock('../hooks/use_cloudwatch_alarm_detail', () => ({
  useCloudWatchAlarmDetail: jest.fn(),
}));
// Chart rendering is out of scope; keep jsdom light.
jest.mock('../echarts_render', () => ({
  EchartsRender: () => <div data-test-subj="mockEcharts" />,
}));

const useDetailMock = useCloudWatchAlarmDetail as jest.MockedFunction<
  typeof useCloudWatchAlarmDetail
>;

const row: CloudWatchAlarmFlyoutRow = {
  id: 'checkout-errors-high',
  name: 'checkout-errors-high',
  datasourceId: 'cloudwatch',
  severity: 'medium',
  monitorType: 'metric',
  cloudWatch: { state: 'ALARM', alarmType: 'metric' },
};

const detailFixture = (): CloudWatchAlarmDetail => ({
  alarm: {
    alarmName: 'checkout-errors-high',
    alarmType: 'metric',
    stateValue: 'ALARM',
    stateReason: 'Threshold Crossed',
    stateUpdatedTimestamp: '2026-09-08T10:00:00.000Z',
    namespace: 'AWS/ApplicationELB',
    metricName: 'HTTPCode_Target_5XX_Count',
    comparisonOperator: 'GreaterThanThreshold',
    threshold: 10,
    period: 60,
    region: 'us-east-1',
  },
  summary: 'checkout-errors-high is in ALARM. Threshold Crossed',
  history: [],
  historyAccessDenied: false,
});

const classifiedFixture = (): ClassifiedError => ({
  category: 'PERMISSION_DENIED',
  code: 'CLOUDWATCH_AUTH_EXPIRED',
  title: 'AWS session expired',
  message: 'The AWS credentials have expired, so CloudWatch rejected the request.',
  remediation: 'Refresh the AWS session, then retry.',
  retryable: false,
  httpStatus: 403,
  correlationId: 'cid-1',
});

function renderFlyout() {
  return render(
    <I18nProvider>
      <CloudWatchAlarmDetailFlyout rule={row} onClose={jest.fn()} />
    </I18nProvider>
  );
}

function mockHook(overrides: Partial<ReturnType<typeof useCloudWatchAlarmDetail>>) {
  useDetailMock.mockReturnValue({
    detail: null,
    isLoading: false,
    error: null,
    classifiedError: null,
    retry: jest.fn(),
    ...overrides,
  });
}

describe('CloudWatchAlarmDetailFlyout', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders the loaded detail summary', () => {
    mockHook({ detail: detailFixture() });
    renderFlyout();
    expect(
      screen.getByText('checkout-errors-high is in ALARM. Threshold Crossed')
    ).toBeInTheDocument();
  });

  it("names a composite's causing child as a link instead of the raw ARN", () => {
    mockHook({
      detail: {
        ...detailFixture(),
        alarm: { alarmName: 'checkout-composite', alarmType: 'composite', stateValue: 'ALARM' },
        summary: 'checkout-composite is in ALARM. Last state change 2026-09-24T10:00:00.000Z.',
        causedBy: {
          alarmName: 'checkout-service-degraded',
          alarmType: 'metric',
          stateValue: 'ALARM',
        },
      },
    });
    renderFlyout();
    expect(screen.getByTestId('cwAlarmDetailCausedBy')).toHaveTextContent(
      'Caused by: checkout-service-degraded'
    );
    expect(screen.queryByText(/arn:aws/)).toBeNull();
    // The link opens the child in the same flyout.
    fireEvent.click(screen.getByTestId('cwAlarmDetailCausedByLink'));
    expect(useDetailMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ alarmName: 'checkout-service-degraded' })
    );
  });

  it('shows no cause line without one', () => {
    mockHook({ detail: detailFixture() });
    renderFlyout();
    expect(screen.queryByTestId('cwAlarmDetailCausedBy')).toBeNull();
  });

  it('renders the classified error callout with Retry when the failure is classified', () => {
    const retry = jest.fn();
    mockHook({ error: new Error('403'), classifiedError: classifiedFixture(), retry });
    renderFlyout();
    // Named failure class + remediation from the classification.
    expect(screen.getByTestId('cwAlarmDetailClassifiedError')).toBeInTheDocument();
    expect(screen.getByText('AWS session expired')).toBeInTheDocument();
    // No generic fallback callout alongside.
    expect(
      screen.queryByText('Could not load alarm detail from CloudWatch')
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('cwAlarmDetailRetry'));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('falls back to the generic callout (still with Retry) for unclassified errors', () => {
    const retry = jest.fn();
    mockHook({ error: new Error('socket hang up'), retry });
    renderFlyout();
    expect(screen.getByText('Could not load alarm detail from CloudWatch')).toBeInTheDocument();
    expect(screen.getByText('socket hang up')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('cwAlarmDetailRetry'));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('shows the loading skeleton while fetching', () => {
    mockHook({ isLoading: true });
    renderFlyout();
    // The flyout renders via a portal, so query the document; OSD aliases EUI
    // to OUI, so match the class name prefix-agnostically.
    expect(document.body.querySelector('[class*="LoadingContent"]')).toBeTruthy();
    expect(screen.queryByTestId('cwAlarmDetailRetry')).not.toBeInTheDocument();
  });
});

describe('CloudWatchAlarmDetailFlyout time window', () => {
  // Midday timestamps so the M/D in the copy doesn't depend on the test machine's timezone.
  const timeWindow: AlarmTimeWindow = {
    startMs: Date.parse('2026-10-01T12:00:00.000Z'),
    endMs: Date.parse('2026-10-02T12:00:00.000Z'),
    label: 'last 24h',
  };
  const stateUpdate = (timestamp: string, oldState: string, newState: string) => ({
    timestamp,
    historyItemType: 'StateUpdate' as const,
    oldState: oldState as 'OK',
    newState: newState as 'ALARM',
    summary: `Alarm updated from ${oldState} to ${newState}`,
  });
  function renderWithWindow() {
    return render(
      <I18nProvider>
        <CloudWatchAlarmDetailFlyout rule={row} onClose={jest.fn()} timeRange={timeWindow} />
      </I18nProvider>
    );
  }

  beforeEach(() => jest.clearAllMocks());

  it('fetches the detail for the window', () => {
    mockHook({ isLoading: true });
    renderWithWindow();
    expect(useDetailMock).toHaveBeenCalledWith({
      dsId: 'cloudwatch',
      alarmName: 'checkout-errors-high',
      startTime: '2026-10-01T12:00:00.000Z',
      endTime: '2026-10-02T12:00:00.000Z',
    });
  });

  it('says when nothing changed in the window and when the last change was', () => {
    mockHook({
      detail: {
        ...detailFixture(),
        alarm: { ...detailFixture().alarm, stateUpdatedTimestamp: '2026-09-24T12:00:00.000Z' },
        history: [stateUpdate('2026-09-24T12:00:00.000Z', 'OK', 'ALARM')],
      },
    });
    renderWithWindow();
    expect(screen.getByTestId('cwAlarmHistoryNoChanges')).toHaveTextContent(
      'No changes in last 24h, last change 9/24'
    );
    expect(screen.getByTestId('cwAlarmNoMetricData')).toHaveTextContent(
      'No metric data in last 24h.'
    );
  });

  it('lists only the changes inside the window', () => {
    mockHook({
      detail: {
        ...detailFixture(),
        history: [
          stateUpdate('2026-10-02T06:00:00.000Z', 'OK', 'ALARM'),
          stateUpdate('2026-09-24T12:00:00.000Z', 'ALARM', 'OK'),
        ],
      },
    });
    renderWithWindow();
    expect(screen.getByText('Alarm updated from OK to ALARM')).toBeInTheDocument();
    expect(screen.queryByText('Alarm updated from ALARM to OK')).toBeNull();
    expect(screen.queryByTestId('cwAlarmHistoryNoChanges')).toBeNull();
  });

  it("draws a composite's current state across a window with no changes", () => {
    mockHook({
      detail: {
        ...detailFixture(),
        alarm: {
          alarmName: 'checkout-composite',
          alarmType: 'composite',
          stateValue: 'ALARM',
          stateUpdatedTimestamp: '2026-09-24T12:00:00.000Z',
        },
        history: [],
      },
    });
    render(
      <I18nProvider>
        <CloudWatchAlarmDetailFlyout
          rule={{
            ...row,
            monitorType: 'composite',
            cloudWatch: { state: 'ALARM', alarmType: 'composite' },
          }}
          onClose={jest.fn()}
          timeRange={timeWindow}
        />
      </I18nProvider>
    );
    expect(screen.getByTestId('mockEcharts')).toBeInTheDocument();
    expect(screen.getByTestId('cwAlarmTimelineNoChanges')).toHaveTextContent(
      'No changes in last 24h, last change 9/24'
    );
  });
});

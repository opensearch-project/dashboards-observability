/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@osd/i18n/react';
import type { UnifiedRule } from '../../../../common/types/alerting';
import { DetectorDetailFlyout } from '../detector_detail_flyout';
import { useRuleDetail } from '../hooks/use_rule_detail';

jest.mock('../hooks/use_rule_detail', () => ({
  useRuleDetail: jest.fn(),
}));

const useRuleDetailMock = useRuleDetail as jest.MockedFunction<typeof useRuleDetail>;

const detectorSummary = {
  id: 'det-1',
  name: 'sample-http-responses-detector',
  enabled: true,
  status: 'active' as const,
  severity: 'info' as const,
  monitorType: 'detector' as const,
  definitionType: 'detector' as const,
  group: 'SINGLE_ENTITY',
  healthStatus: 'healthy' as const,
  datasourceId: 'ds-1',
  datasourceType: 'opensearch' as const,
  query: '',
  condition: '',
  labels: { detector_type: 'SINGLE_ENTITY', indices: 'sample-http-responses' },
  annotations: {},
  createdBy: 'admin',
  createdAt: '2026-01-01T00:00:00Z',
  lastModified: '2026-06-04T17:00:00Z',
  notificationDestinations: [],
  evaluationInterval: '10 minutes',
  pendingPeriod: '1 minutes',
};

const detectorDetail = (): UnifiedRule => ({
  ...detectorSummary,
  description: 'Detects anomalous HTTP response behavior.',
  alertHistory: [],
  conditionPreviewData: [],
  notificationRouting: [],
  suppressionRules: [],
  raw: {
    id: 'det-1',
    name: 'sample-http-responses-detector',
    description: 'Detects anomalous HTTP response behavior.',
    detector_type: 'SINGLE_ENTITY',
    indices: ['sample-http-responses'],
    time_field: 'timestamp',
    filter_query: { match_all: { boost: 1 } },
    last_update_time: 1780590000000,
    detection_interval: { period: { interval: 10, unit: 'MINUTES' } },
    window_delay: { period: { interval: 1, unit: 'MINUTES' } },
    history: 40,
    feature_attributes: [
      {
        feature_name: 'sum_http_4xx',
        feature_enabled: true,
      },
    ],
    ui_metadata: {
      features: {
        sum_http_4xx: {
          aggregationOf: 'http_4xx',
          aggregationBy: 'sum',
        },
      },
    },
    anomaly_detector_job: {
      enabled: true,
      enabled_time: 1780590100000,
    },
  },
});

describe('DetectorDetailFlyout', () => {
  beforeEach(() => useRuleDetailMock.mockReset());

  it('renders detector configuration from the full detector detail response', () => {
    useRuleDetailMock.mockReturnValue({
      data: detectorDetail(),
      isLoading: false,
      error: null,
    });

    render(
      <I18nProvider>
        <DetectorDetailFlyout detector={detectorSummary} onClose={jest.fn()} />
      </I18nProvider>
    );

    expect(
      screen.getByRole('heading', { name: 'sample-http-responses-detector' })
    ).toBeInTheDocument();
    expect(screen.getByText('Detector settings')).toBeInTheDocument();
    expect(screen.getByText('Model configuration')).toBeInTheDocument();
    expect(screen.getByText('Operational settings')).toBeInTheDocument();
    expect(screen.getByText('sample-http-responses')).toBeInTheDocument();
    expect(screen.getByText('sum_http_4xx')).toBeInTheDocument();
    expect(screen.getByText(/Field: http_4xx/)).toBeInTheDocument();
    expect(screen.getAllByText('10 minutes')).toHaveLength(2);
    expect(useRuleDetailMock).toHaveBeenCalledWith('ds-1', 'det-1', 'detector');
  });
});

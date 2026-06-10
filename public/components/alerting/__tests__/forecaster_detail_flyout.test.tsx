/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@osd/i18n/react';
import type { UnifiedRule } from '../../../../common/types/alerting';
import { ForecasterDetailFlyout } from '../forecaster_detail_flyout';
import { useRuleDetail } from '../hooks/use_rule_detail';

jest.mock('../hooks/use_rule_detail', () => ({
  useRuleDetail: jest.fn(),
}));

const useRuleDetailMock = useRuleDetail as jest.MockedFunction<typeof useRuleDetail>;

const forecasterSummary = {
  id: 'forecast-1',
  name: 'sample-cpu-forecaster',
  enabled: true,
  status: 'active' as const,
  severity: 'info' as const,
  monitorType: 'forecaster' as const,
  definitionType: 'forecaster' as const,
  group: 'single_stream',
  healthStatus: 'healthy' as const,
  datasourceId: 'ds-1',
  datasourceType: 'opensearch' as const,
  query: '',
  condition: '',
  labels: { forecaster_type: 'single_stream', indices: 'metrics-hosts' },
  annotations: {},
  createdBy: 'admin',
  createdAt: '2026-01-01T00:00:00Z',
  lastModified: '2026-06-04T17:00:00Z',
  notificationDestinations: [],
  evaluationInterval: '10 minutes',
  pendingPeriod: '1 minutes',
};

const forecasterDetail = (): UnifiedRule => ({
  ...forecasterSummary,
  description: 'Forecasts host CPU behavior.',
  alertHistory: [],
  conditionPreviewData: [],
  notificationRouting: [],
  suppressionRules: [],
  raw: {
    id: 'forecast-1',
    name: 'sample-cpu-forecaster',
    description: 'Forecasts host CPU behavior.',
    indices: ['metrics-hosts'],
    time_field: '@timestamp',
    filter_query: { match_all: { boost: 1 } },
    last_update_time: 1780590000000,
    forecast_interval: { period: { interval: 10, unit: 'MINUTES' } },
    window_delay: { period: { interval: 1, unit: 'MINUTES' } },
    horizon: 24,
    history: 40,
    feature_attributes: [
      {
        feature_name: 'cpu_sum',
        feature_enabled: true,
      },
    ],
    ui_metadata: {
      features: {
        cpu_sum: {
          aggregationOf: 'cpu',
          aggregationBy: 'sum',
        },
      },
    },
    forecaster_job: {
      enabled: true,
      enabled_time: 1780590100000,
    },
  },
});

describe('ForecasterDetailFlyout', () => {
  beforeEach(() => useRuleDetailMock.mockReset());

  it('renders forecaster configuration from the full forecaster detail response', () => {
    useRuleDetailMock.mockReturnValue({
      data: forecasterDetail(),
      isLoading: false,
      error: null,
    });

    render(
      <I18nProvider>
        <ForecasterDetailFlyout forecaster={forecasterSummary} onClose={jest.fn()} />
      </I18nProvider>
    );

    expect(screen.getByRole('heading', { name: 'sample-cpu-forecaster' })).toBeInTheDocument();
    expect(screen.getByText('Forecaster settings')).toBeInTheDocument();
    expect(screen.getByText('Model configuration')).toBeInTheDocument();
    expect(screen.getByText('Operational settings')).toBeInTheDocument();
    expect(screen.getByText('metrics-hosts')).toBeInTheDocument();
    expect(screen.getByText('cpu_sum')).toBeInTheDocument();
    expect(screen.getByText(/Field: cpu/)).toBeInTheDocument();
    expect(screen.getByText('Horizon')).toBeInTheDocument();
    expect(screen.getByText('24')).toBeInTheDocument();
  });
});

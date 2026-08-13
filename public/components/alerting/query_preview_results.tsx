/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * QueryPreviewResults — the "Run preview" results block shared by the
 * Metrics page "Create alert rule" flyout and the Alert Manager
 * "Create metrics rule" flyout.
 *
 * Currently renders representative sample data (line chart) with a callout
 * making that explicit; a follow-up wires it to a live range query.
 */
import React from 'react';
import {
  EuiAccordion,
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import { FormattedMessage } from '@osd/i18n/react';
import { i18n } from '@osd/i18n';
import { EchartsRender } from './echarts_render';

const PREVIEW_TIMESTAMPS = ['04:00', '06:00', '08:00', '10:00', '12:00', '14:00', '16:00', '17:00'];
const PREVIEW_VALUES = [0.02, 0.03, 0.01, 0.06, 0.04, 0.07, 0.05, 0.08];

const PREVIEW_CHART_OPTION: Record<string, unknown> = {
  grid: { left: 48, right: 16, top: 16, bottom: 32 },
  tooltip: { trigger: 'axis' },
  xAxis: { type: 'category', data: PREVIEW_TIMESTAMPS },
  yAxis: { type: 'value' },
  series: [
    {
      type: 'line',
      data: PREVIEW_VALUES,
      smooth: true,
      itemStyle: { color: '#006BB4' },
      areaStyle: { color: 'rgba(0,107,180,0.1)' },
    },
  ],
};

export const QueryPreviewResults: React.FC<{
  /** The query being previewed — shown as the series caption. */
  query: string;
}> = ({ query }) => (
  <EuiAccordion
    id="prom-preview-results"
    buttonContent={
      <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
        <EuiFlexItem grow={false}>
          <strong>
            <FormattedMessage
              id="observability.alerting.queryPreviewResults.resultsTitle"
              defaultMessage="Results ({count})"
              values={{ count: PREVIEW_VALUES.length }}
            />
          </strong>
        </EuiFlexItem>
      </EuiFlexGroup>
    }
    initialIsOpen
    paddingSize="s"
  >
    <EuiCallOut size="s" color="warning" iconType="iInCircle">
      <EuiText size="xs">
        {i18n.translate('observability.alerting.queryPreviewResults.sampleDataCallout', {
          defaultMessage: 'Sample data — run the rule to see real results',
        })}
      </EuiText>
    </EuiCallOut>
    <EuiSpacer size="s" />
    <EuiText size="xs" color="subdued">
      {query || 'http_requests_total'}
    </EuiText>
    <EuiSpacer size="s" />
    <EchartsRender spec={PREVIEW_CHART_OPTION} height={200} />
  </EuiAccordion>
);

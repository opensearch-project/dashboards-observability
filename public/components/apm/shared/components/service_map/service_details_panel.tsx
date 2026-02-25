/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  EuiFlyout,
  EuiFlyoutHeader,
  EuiFlyoutBody,
  EuiTitle,
  EuiFlexGroup,
  EuiFlexItem,
  EuiText,
  EuiSpacer,
  EuiAccordion,
  EuiLoadingSpinner,
  EuiHorizontalRule,
  EuiPanel,
  EuiButtonEmpty,
} from '@elastic/eui';
import { HealthDonut } from '@osd/apm-topology';
import { LanguageIcon } from '../language_icon';
import { PromQLLineChart } from '../promql_line_chart';
import { SelectedNodeState, ServiceMapNodeMetrics } from '../../../common/types/service_map_types';
import {
  getPlatformDisplayName,
  APPLICATION_MAP_CONSTANTS,
  APM_CONSTANTS,
} from '../../../common/constants';
import { applicationMapI18nTexts as i18nTexts } from '../../../pages/application_map/application_map_i18n';
import {
  getQueryServiceRequests,
  getQueryServiceFaults,
  getQueryServiceErrors,
  getQueryApplicationRequests,
  getQueryApplicationFaults,
  getQueryApplicationErrors,
  getQueryApplicationLatency,
} from '../../../query_services/query_requests/promql_queries';
import { formatCount, formatLatency } from '../../../common/format_utils';

export interface ServiceDetailsPanelProps {
  node: SelectedNodeState;
  metrics: ServiceMapNodeMetrics | null;
  isLoading: boolean;
  timeRange: { from: string; to: string };
  prometheusConnectionId: string;
  onClose: () => void;
  onViewDetails: (serviceName: string, environment: string) => void;
  refreshTrigger?: number;
}

/**
 * ServiceDetailsPanel - Right flyout showing detailed metrics for a selected node
 *
 * Displays:
 * - Health donut with fault/error/success breakdown
 * - Error rate and fault rate badges
 * - Metric charts: Requests, Latency (P99/P90/P50), Faults, Errors
 */
export const ServiceDetailsPanel: React.FC<ServiceDetailsPanelProps> = ({
  node,
  metrics,
  isLoading,
  timeRange,
  prometheusConnectionId,
  onClose,
  onViewDetails,
  refreshTrigger,
}) => {
  // Detect if this is the Application root node (aggregated view)
  const isApplicationNode = node.nodeId === 'application-root';

  // Detect if this is a group node (from Group By feature)
  const isGroupNode = node.nodeId.startsWith('group-') || node.platformType === 'Group';
  const groupByAttribute = isGroupNode ? Object.keys(node.groupByAttributes || {})[0] : null;
  const groupByValue = isGroupNode ? node.serviceName : null; // serviceName holds the group value

  const platformDisplay = isApplicationNode
    ? 'Application'
    : getPlatformDisplayName(node.platformType);
  const language = node.groupByAttributes?.['telemetry.sdk.language'];

  // For group nodes, build queries that filter by the group attribute
  // Convert attribute dots to underscores for Prometheus (e.g., telemetry.sdk.language → telemetry_sdk_language)
  const prometheusLabel = groupByAttribute?.replace(/\./g, '_') || '';
  const groupLabelFilter = `${prometheusLabel}="${groupByValue}",namespace="span_derived"`;

  // PromQL queries for charts - use application-level, group-level, or service-level based on node type
  const requestsQuery = isGroupNode
    ? `sum(request{${groupLabelFilter}})`
    : isApplicationNode
    ? getQueryApplicationRequests()
    : getQueryServiceRequests(node.environment, node.serviceName);
  const faultsQuery = isGroupNode
    ? `sum(fault{${groupLabelFilter}})`
    : isApplicationNode
    ? getQueryApplicationFaults()
    : getQueryServiceFaults(node.environment, node.serviceName);
  const errorsQuery = isGroupNode
    ? `sum(error{${groupLabelFilter}})`
    : isApplicationNode
    ? getQueryApplicationErrors()
    : getQueryServiceErrors(node.environment, node.serviceName);

  // Latency query (P99, P90, P50 combined) - use application-level, group-level, or service-level
  const latencyQuery = isGroupNode
    ? `
label_replace(
  histogram_quantile(0.99,
    sum by (le) (
      latency_seconds_seconds_bucket{${groupLabelFilter}}
    )
  ) * 1000,
  "percentile", "p99", "", ""
)
or
label_replace(
  histogram_quantile(0.90,
    sum by (le) (
      latency_seconds_seconds_bucket{${groupLabelFilter}}
    )
  ) * 1000,
  "percentile", "p90", "", ""
)
or
label_replace(
  histogram_quantile(0.50,
    sum by (le) (
      latency_seconds_seconds_bucket{${groupLabelFilter}}
    )
  ) * 1000,
  "percentile", "p50", "", ""
)
`
    : isApplicationNode
    ? getQueryApplicationLatency()
    : `
label_replace(
  histogram_quantile(0.99,
    sum by (le) (
      latency_seconds_seconds_bucket{environment="${node.environment}",service="${node.serviceName}",namespace="span_derived"}
    )
  ) * 1000,
  "percentile", "p99", "", ""
)
or
label_replace(
  histogram_quantile(0.90,
    sum by (le) (
      latency_seconds_seconds_bucket{environment="${node.environment}",service="${node.serviceName}",namespace="span_derived"}
    )
  ) * 1000,
  "percentile", "p90", "", ""
)
or
label_replace(
  histogram_quantile(0.50,
    sum by (le) (
      latency_seconds_seconds_bucket{environment="${node.environment}",service="${node.serviceName}",namespace="span_derived"}
    )
  ) * 1000,
  "percentile", "p50", "", ""
)
`;

  // Display title - "Application" for root node, group value for group nodes, service name otherwise
  const displayTitle = isApplicationNode
    ? i18nTexts.navigation.application
    : isGroupNode
    ? node.serviceName // Group value (e.g., "nodejs")
    : node.serviceName;

  return (
    <EuiFlyout
      size="s"
      type="push"
      paddingSize="m"
      onClose={onClose}
      ownFocus={false}
      aria-labelledby="serviceDetailsPanelTitle"
    >
      <EuiFlyoutHeader hasBorder>
        <EuiFlexGroup alignItems="center" gutterSize="s">
          {!isApplicationNode && (
            <EuiFlexItem grow={false}>
              <LanguageIcon language={language} size="l" />
            </EuiFlexItem>
          )}
          <EuiFlexItem>
            <EuiTitle size="s">
              <h2 id="serviceDetailsPanelTitle">{displayTitle}</h2>
            </EuiTitle>
            <EuiText size="xs" color="subdued">
              {platformDisplay}
            </EuiText>
          </EuiFlexItem>
          {!isApplicationNode && !isGroupNode && (
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty
                size="s"
                onClick={() => onViewDetails(node.serviceName, node.environment)}
              >
                {i18nTexts.detailsPanel.viewDetails}
              </EuiButtonEmpty>
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
      </EuiFlyoutHeader>

      <EuiFlyoutBody>
        {isLoading ? (
          <EuiFlexGroup justifyContent="center" alignItems="center" style={{ minHeight: 200 }}>
            <EuiFlexItem grow={false}>
              <EuiLoadingSpinner size="xl" />
            </EuiFlexItem>
          </EuiFlexGroup>
        ) : (
          <>
            {/* Health Section */}
            <EuiAccordion
              id="healthAccordion"
              buttonContent={
                <EuiText size="s">
                  <strong>{i18nTexts.detailsPanel.health}</strong>
                </EuiText>
              }
              initialIsOpen={true}
              paddingSize="s"
            >
              <EuiFlexGroup alignItems="center" gutterSize="m">
                <EuiFlexItem grow={false}>
                  <HealthDonut
                    metrics={{
                      requests: metrics?.totalRequests || 0,
                      faults5xx: metrics?.totalFaults || 0,
                      errors4xx: metrics?.totalErrors || 0,
                    }}
                    size={APPLICATION_MAP_CONSTANTS.HEALTH_DONUT_SIZE}
                    isLegendEnabled={false}
                  />
                </EuiFlexItem>
                <EuiFlexItem>
                  <EuiFlexGroup direction="column" gutterSize="xs">
                    <EuiFlexItem>
                      <EuiText size="xs">
                        <strong>{i18nTexts.detailsPanel.totalRequests}:</strong>{' '}
                        {metrics ? formatCount(metrics.totalRequests) : '-'}
                      </EuiText>
                    </EuiFlexItem>
                    <EuiFlexItem>
                      <EuiText size="xs">
                        <strong>{i18nTexts.detailsPanel.totalErrors}:</strong>{' '}
                        {metrics ? formatCount(metrics.totalErrors) : '-'}
                      </EuiText>
                    </EuiFlexItem>
                    <EuiFlexItem>
                      <EuiText size="xs">
                        <strong>{i18nTexts.detailsPanel.totalFaults}:</strong>{' '}
                        {metrics ? formatCount(metrics.totalFaults) : '-'}
                      </EuiText>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiAccordion>

            <EuiHorizontalRule margin="s" />

            {/* Metrics Section */}
            <EuiAccordion
              id="metricsAccordion"
              buttonContent={
                <EuiText size="s">
                  <strong>{i18nTexts.detailsPanel.metrics}</strong>
                </EuiText>
              }
              initialIsOpen={true}
              paddingSize="s"
            >
              {/* Requests Chart */}
              <EuiPanel paddingSize="s" hasBorder>
                <EuiText size="xs">
                  <strong>{i18nTexts.detailsPanel.requests}</strong>
                </EuiText>
                <PromQLLineChart
                  promqlQuery={requestsQuery}
                  timeRange={timeRange}
                  prometheusConnectionId={prometheusConnectionId}
                  chartType="area"
                  height={APPLICATION_MAP_CONSTANTS.CHART_HEIGHT}
                  showLegend={false}
                  formatValue={formatCount}
                  refreshTrigger={refreshTrigger}
                  color={APM_CONSTANTS.COLORS.THROUGHPUT}
                />
              </EuiPanel>

              <EuiSpacer size="s" />

              {/* Latency Chart (P99, P90, P50) */}
              <EuiPanel paddingSize="s" hasBorder>
                <EuiText size="xs">
                  <strong>{i18nTexts.detailsPanel.latency}</strong>
                </EuiText>
                <PromQLLineChart
                  promqlQuery={latencyQuery}
                  timeRange={timeRange}
                  prometheusConnectionId={prometheusConnectionId}
                  chartType="line"
                  height={APPLICATION_MAP_CONSTANTS.CHART_HEIGHT}
                  showLegend={true}
                  formatValue={formatLatency}
                  refreshTrigger={refreshTrigger}
                  labelField="percentile"
                />
              </EuiPanel>

              <EuiSpacer size="s" />

              {/* Faults (5xx) Chart */}
              <EuiPanel paddingSize="s" hasBorder>
                <EuiText size="xs">
                  <strong>{i18nTexts.detailsPanel.faults5xx}</strong>
                </EuiText>
                <PromQLLineChart
                  promqlQuery={faultsQuery}
                  timeRange={timeRange}
                  prometheusConnectionId={prometheusConnectionId}
                  chartType="area"
                  height={APPLICATION_MAP_CONSTANTS.CHART_HEIGHT}
                  showLegend={false}
                  formatValue={formatCount}
                  refreshTrigger={refreshTrigger}
                  color={APM_CONSTANTS.COLORS.FAULT}
                />
              </EuiPanel>

              <EuiSpacer size="s" />

              {/* Errors (4xx) Chart */}
              <EuiPanel paddingSize="s" hasBorder>
                <EuiText size="xs">
                  <strong>{i18nTexts.detailsPanel.errors4xx}</strong>
                </EuiText>
                <PromQLLineChart
                  promqlQuery={errorsQuery}
                  timeRange={timeRange}
                  prometheusConnectionId={prometheusConnectionId}
                  chartType="area"
                  height={APPLICATION_MAP_CONSTANTS.CHART_HEIGHT}
                  showLegend={false}
                  formatValue={formatCount}
                  refreshTrigger={refreshTrigger}
                  color={APM_CONSTANTS.COLORS.WARNING}
                />
              </EuiPanel>
            </EuiAccordion>
          </>
        )}
      </EuiFlyoutBody>
    </EuiFlyout>
  );
};

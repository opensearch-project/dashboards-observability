/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiButtonGroup,
  EuiIconTip,
  EuiButtonEmpty,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { TimeRange } from '../../common/types/service_details_types';
import { PromQLMetricCard } from '../../shared/components/promql_metric_card';
import { PromQLLineChart } from '../../shared/components/promql_line_chart';
import { ServiceDependenciesByFaultRate } from '../../shared/components/fault_widgets/service_dependencies_by_fault_rate';
import { ServiceCorrelationsFlyout } from '../../shared/components/service_correlations_flyout';
import './service_overview.scss';
import {
  getQueryServiceRequests,
  getQueryServiceAvailability,
  getQueryServiceLatencyP99Card,
  getQueryServiceFaultRateCard,
  getQueryServiceErrorRateCard,
  getQueryServiceFaultRate,
  getQueryServiceErrorRateOverTime,
  getQueryServiceAvailabilityByOperations,
  getQueryTopDependenciesByLatency,
  getQueryTopOperationsByVolume,
} from '../../query_services/query_requests/promql_queries';
import {
  formatCount,
  formatPercentage,
  formatPercentageValue,
  formatLatency,
} from '../../common/format_utils';
import { navigateToServiceDetails } from '../../shared/utils/navigation_utils';

export interface ServiceOverviewProps {
  serviceName: string;
  environment?: string;
  timeRange: TimeRange;
  prometheusConnectionId: string;
  serviceMapDataset: string;
  refreshTrigger?: number;
}

/**
 * ServiceOverview - Overview tab for service details
 *
 * Layout:
 * 1. Metric Cards Row: Requests, Faults, Errors, Availability, P99 Latency
 * 2. Charts Section:
 *    - Latency by Service and Dependencies
 *    - Requests by Service and Top Operations
 *    - Availability by Service and Operations
 *    - Fault Rate by Service and Operations
 *    - Error Rate by Service and Operations
 */
export const ServiceOverview: React.FC<ServiceOverviewProps> = ({
  serviceName,
  environment = '',
  timeRange,
  prometheusConnectionId,
  serviceMapDataset: _serviceMapDataset,
  refreshTrigger,
}) => {
  // State for latency percentile selector
  const [latencyPercentile, setLatencyPercentile] = useState<'p99' | 'p90' | 'p50'>('p99');

  // Separate state for each chart's limit selector
  const [requestsTopK, setRequestsTopK] = useState<number>(3);
  const [faultRateTopK, setFaultRateTopK] = useState<number>(3);
  const [errorRateTopK, setErrorRateTopK] = useState<number>(3);
  const [availabilityBottomK, setAvailabilityBottomK] = useState<number>(3);

  // Flyout state
  const [flyoutOpen, setFlyoutOpen] = useState(false);
  const [flyoutInitialTab, setFlyoutInitialTab] = useState<'spans' | 'logs' | 'attributes'>(
    'spans'
  );

  // Open flyout with specific tab
  const openFlyout = (tab: 'spans' | 'logs' | 'attributes') => {
    setFlyoutInitialTab(tab);
    setFlyoutOpen(true);
  };

  // Button group options for latency percentile
  const latencyPercentileOptions = [
    {
      id: 'p99',
      label: 'P99',
    },
    {
      id: 'p90',
      label: 'P90',
    },
    {
      id: 'p50',
      label: 'P50',
    },
  ];

  // Button group options for limit selection (shared by all charts)
  const limitOptions = [
    {
      id: '3',
      label: '3',
    },
    {
      id: '5',
      label: '5',
    },
    {
      id: '10',
      label: '10',
    },
  ];

  // Convert latency percentile to number for query
  const latencyPercentileValue = useMemo(() => {
    switch (latencyPercentile) {
      case 'p50':
        return 0.5;
      case 'p90':
        return 0.9;
      case 'p99':
      default:
        return 0.99;
    }
  }, [latencyPercentile]);

  return (
    <div data-test-subj="serviceOverview">
      <EuiSpacer size="m" />
      {/* Top Dependencies by Fault Rate and Service Metadata Row */}
      <EuiFlexGroup gutterSize="l">
        {/* Top Dependencies by Fault Rate Widget */}
        <ServiceDependenciesByFaultRate
          serviceName={serviceName}
          environment={environment}
          timeRange={timeRange}
          refreshTrigger={refreshTrigger}
          onDependencyClick={(dependencyService) => {
            // Navigate to dependencies tab with dependency filter in URL
            navigateToServiceDetails(serviceName, environment || 'default', {
              tab: 'dependencies',
              dependency: dependencyService,
            });
          }}
        />

        {/* Service Metadata Panel */}
        <EuiFlexItem grow={false} style={{ minWidth: '280px' }}>
          <EuiPanel paddingSize="m" className="service-metadata-panel">
            <EuiText size="m">
              <h4>
                {i18n.translate('observability.apm.serviceOverview.serviceMetadata', {
                  defaultMessage: 'Correlated data',
                })}
              </h4>
            </EuiText>
            <EuiSpacer size="m" />
            <EuiFlexGroup direction="column" gutterSize="s" alignItems="flexStart">
              <EuiFlexItem grow={false}>
                <EuiButtonEmpty
                  iconType="navServices"
                  size="s"
                  onClick={() => openFlyout('attributes')}
                >
                  {i18n.translate('observability.apm.serviceOverview.viewAttributes', {
                    defaultMessage: 'View service attributes',
                  })}
                </EuiButtonEmpty>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButtonEmpty iconType="apmTrace" size="s" onClick={() => openFlyout('spans')}>
                  {i18n.translate('observability.apm.serviceOverview.viewSpans', {
                    defaultMessage: 'View correlated spans',
                  })}
                </EuiButtonEmpty>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButtonEmpty iconType="discoverApp" size="s" onClick={() => openFlyout('logs')}>
                  {i18n.translate('observability.apm.serviceOverview.viewLogs', {
                    defaultMessage: 'View correlated logs',
                  })}
                </EuiButtonEmpty>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiPanel>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="m" />

      {/* Metric Cards Row */}
      <EuiFlexGroup gutterSize="m">
        <EuiFlexItem>
          <PromQLMetricCard
            title={i18n.translate('observability.apm.serviceOverview.throughput', {
              defaultMessage: 'Throughput (req/int)',
            })}
            subtitle={i18n.translate('observability.apm.serviceOverview.avg', {
              defaultMessage: 'Avg',
            })}
            promqlQuery={getQueryServiceRequests(environment, serviceName)}
            timeRange={timeRange}
            prometheusConnectionId={prometheusConnectionId}
            formatValue={formatCount}
            refreshTrigger={refreshTrigger}
            showTotal
          />
        </EuiFlexItem>
        <EuiFlexItem>
          <PromQLMetricCard
            title={i18n.translate('observability.apm.serviceOverview.faultRate', {
              defaultMessage: 'Fault rate (5xx)',
            })}
            subtitle={i18n.translate('observability.apm.serviceOverview.avg', {
              defaultMessage: 'Avg',
            })}
            promqlQuery={getQueryServiceFaultRateCard(environment, serviceName)}
            timeRange={timeRange}
            prometheusConnectionId={prometheusConnectionId}
            formatValue={formatPercentageValue}
            invertColor
            refreshTrigger={refreshTrigger}
            showTotal
          />
        </EuiFlexItem>
        <EuiFlexItem>
          <PromQLMetricCard
            title={i18n.translate('observability.apm.serviceOverview.errorRate', {
              defaultMessage: 'Error rate (4xx)',
            })}
            subtitle={i18n.translate('observability.apm.serviceOverview.avg', {
              defaultMessage: 'Avg',
            })}
            promqlQuery={getQueryServiceErrorRateCard(environment, serviceName)}
            timeRange={timeRange}
            prometheusConnectionId={prometheusConnectionId}
            formatValue={formatPercentageValue}
            invertColor
            refreshTrigger={refreshTrigger}
            showTotal
          />
        </EuiFlexItem>
        <EuiFlexItem>
          <PromQLMetricCard
            title={i18n.translate('observability.apm.serviceOverview.availability', {
              defaultMessage: 'Availability',
            })}
            subtitle={i18n.translate('observability.apm.serviceOverview.avg', {
              defaultMessage: 'Avg',
            })}
            promqlQuery={getQueryServiceAvailability(environment, serviceName)}
            timeRange={timeRange}
            prometheusConnectionId={prometheusConnectionId}
            formatValue={formatPercentageValue}
            refreshTrigger={refreshTrigger}
            showTotal
          />
        </EuiFlexItem>
        <EuiFlexItem>
          <PromQLMetricCard
            title={i18n.translate('observability.apm.serviceOverview.latencyP99', {
              defaultMessage: 'Latency (P99)',
            })}
            subtitle={i18n.translate('observability.apm.serviceOverview.avg', {
              defaultMessage: 'Avg',
            })}
            promqlQuery={getQueryServiceLatencyP99Card(environment, serviceName)}
            timeRange={timeRange}
            prometheusConnectionId={prometheusConnectionId}
            formatValue={formatLatency}
            invertColor
            refreshTrigger={refreshTrigger}
            showTotal
          />
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="m" />

      {/* Charts Section */}
      {/* Row 1: Latency by Dependencies - Full Width */}
      <EuiFlexGroup gutterSize="m">
        <EuiFlexItem>
          <EuiPanel>
            <EuiFlexGroup justifyContent="spaceBetween" alignItems="center" gutterSize="s">
              <EuiFlexItem grow={false}>
                <EuiFlexGroup alignItems="center" gutterSize="xs">
                  <EuiFlexItem grow={false}>
                    <EuiText size="xs">
                      <h4 style={{ margin: 0 }}>
                        {i18n.translate('observability.apm.serviceOverview.latencyByDeps', {
                          defaultMessage: 'Latency by dependencies',
                        })}
                      </h4>
                    </EuiText>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiIconTip
                      content={i18n.translate(
                        'observability.apm.serviceOverview.latencyByDepsTooltip',
                        {
                          defaultMessage:
                            'Latency percentile calculated using histogram_quantile() over latency_seconds_bucket metric for top 5 dependencies, grouped by remoteService label',
                        }
                      )}
                      position="right"
                      type="questionInCircle"
                    />
                  </EuiFlexItem>
                </EuiFlexGroup>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButtonGroup
                  legend="Latency percentile"
                  options={latencyPercentileOptions}
                  idSelected={latencyPercentile}
                  onChange={(id) => setLatencyPercentile(id as 'p99' | 'p90' | 'p50')}
                  buttonSize="compressed"
                  isFullWidth={false}
                />
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiSpacer size="s" />
            <PromQLLineChart
              promqlQuery={getQueryTopDependenciesByLatency(
                environment,
                serviceName,
                latencyPercentileValue
              )}
              timeRange={timeRange}
              prometheusConnectionId={prometheusConnectionId}
              formatValue={formatLatency}
              refreshTrigger={refreshTrigger}
              labelField="remoteService"
            />
          </EuiPanel>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="m" />

      {/* Row 2: Requests by Top Operations + Availability by Operations */}
      <EuiFlexGroup gutterSize="m">
        <EuiFlexItem grow={1}>
          <EuiPanel>
            <EuiFlexGroup justifyContent="spaceBetween" alignItems="center" gutterSize="s">
              <EuiFlexItem grow={false}>
                <EuiFlexGroup alignItems="center" gutterSize="xs">
                  <EuiFlexItem grow={false}>
                    <EuiText size="xs">
                      <h4 style={{ margin: 0 }}>
                        {i18n.translate('observability.apm.serviceOverview.requestsByOps', {
                          defaultMessage: 'Requests by operations',
                        })}
                      </h4>
                    </EuiText>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiIconTip
                      content={i18n.translate(
                        'observability.apm.serviceOverview.requestsByOpsTooltip',
                        {
                          defaultMessage:
                            'Total request count from request gauge metric, aggregated using sum() and ranked with topk() by operation label',
                        }
                      )}
                      position="right"
                      type="questionInCircle"
                    />
                  </EuiFlexItem>
                </EuiFlexGroup>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiFlexGroup alignItems="center" gutterSize="s">
                  <EuiFlexItem grow={false}>
                    <EuiText size="xs">
                      <strong>Top</strong>
                    </EuiText>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiButtonGroup
                      legend="Top K operations"
                      options={limitOptions}
                      idSelected={String(requestsTopK)}
                      onChange={(id) => setRequestsTopK(Number(id))}
                      buttonSize="compressed"
                      isFullWidth={false}
                    />
                  </EuiFlexItem>
                </EuiFlexGroup>
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiSpacer size="s" />
            <PromQLLineChart
              promqlQuery={getQueryTopOperationsByVolume(environment, serviceName, requestsTopK)}
              timeRange={timeRange}
              prometheusConnectionId={prometheusConnectionId}
              formatValue={formatCount}
              refreshTrigger={refreshTrigger}
              labelField="operation"
            />
          </EuiPanel>
        </EuiFlexItem>
        <EuiFlexItem grow={1}>
          <EuiPanel>
            <EuiFlexGroup justifyContent="spaceBetween" alignItems="center" gutterSize="s">
              <EuiFlexItem grow={false}>
                <EuiFlexGroup alignItems="center" gutterSize="xs">
                  <EuiFlexItem grow={false}>
                    <EuiText size="xs">
                      <h4 style={{ margin: 0 }}>
                        {i18n.translate('observability.apm.serviceOverview.availabilityByOps', {
                          defaultMessage: 'Availability by operations',
                        })}
                      </h4>
                    </EuiText>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiIconTip
                      content={i18n.translate(
                        'observability.apm.serviceOverview.availabilityByOpsTooltip',
                        {
                          defaultMessage:
                            'Availability calculated as (1 - fault/request) * 100, using bottomk() to show operations with lowest availability',
                        }
                      )}
                      position="right"
                      type="questionInCircle"
                    />
                  </EuiFlexItem>
                </EuiFlexGroup>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiFlexGroup alignItems="center" gutterSize="s">
                  <EuiFlexItem grow={false}>
                    <EuiText size="xs">
                      <strong>Bottom</strong>
                    </EuiText>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiButtonGroup
                      legend="Bottom K operations"
                      options={limitOptions}
                      idSelected={String(availabilityBottomK)}
                      onChange={(id) => setAvailabilityBottomK(Number(id))}
                      buttonSize="compressed"
                      isFullWidth={false}
                    />
                  </EuiFlexItem>
                </EuiFlexGroup>
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiSpacer size="s" />
            <PromQLLineChart
              promqlQuery={getQueryServiceAvailabilityByOperations(
                environment,
                serviceName,
                availabilityBottomK
              )}
              timeRange={timeRange}
              prometheusConnectionId={prometheusConnectionId}
              formatValue={formatPercentage}
              formatTooltipValue={formatPercentageValue}
              refreshTrigger={refreshTrigger}
              labelField="operation"
            />
          </EuiPanel>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="m" />

      {/* Row 3: Fault Rate by Operations + Error Rate by Operations */}
      <EuiFlexGroup gutterSize="m">
        <EuiFlexItem grow={1}>
          <EuiPanel>
            <EuiFlexGroup justifyContent="spaceBetween" alignItems="center" gutterSize="s">
              <EuiFlexItem grow={false}>
                <EuiFlexGroup alignItems="center" gutterSize="xs">
                  <EuiFlexItem grow={false}>
                    <EuiText size="xs">
                      <h4 style={{ margin: 0 }}>
                        {i18n.translate('observability.apm.serviceOverview.faultRateByOps', {
                          defaultMessage: 'Fault rate by operations',
                        })}
                      </h4>
                    </EuiText>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiIconTip
                      content={i18n.translate(
                        'observability.apm.serviceOverview.faultRateByOpsTooltip',
                        {
                          defaultMessage:
                            'Fault rate calculated as (fault/request) * 100 from gauge metrics, ranked with topk() by operation label',
                        }
                      )}
                      position="right"
                      type="questionInCircle"
                    />
                  </EuiFlexItem>
                </EuiFlexGroup>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiFlexGroup alignItems="center" gutterSize="s">
                  <EuiFlexItem grow={false}>
                    <EuiText size="xs">
                      <strong>Top</strong>
                    </EuiText>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiButtonGroup
                      legend="Top K operations"
                      options={limitOptions}
                      idSelected={String(faultRateTopK)}
                      onChange={(id) => setFaultRateTopK(Number(id))}
                      buttonSize="compressed"
                      isFullWidth={false}
                    />
                  </EuiFlexItem>
                </EuiFlexGroup>
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiSpacer size="s" />
            <PromQLLineChart
              promqlQuery={getQueryServiceFaultRate(environment, serviceName, faultRateTopK)}
              timeRange={timeRange}
              prometheusConnectionId={prometheusConnectionId}
              formatValue={formatPercentage}
              formatTooltipValue={formatPercentageValue}
              refreshTrigger={refreshTrigger}
              labelField="operation"
            />
          </EuiPanel>
        </EuiFlexItem>
        <EuiFlexItem grow={1}>
          <EuiPanel>
            <EuiFlexGroup justifyContent="spaceBetween" alignItems="center" gutterSize="s">
              <EuiFlexItem grow={false}>
                <EuiFlexGroup alignItems="center" gutterSize="xs">
                  <EuiFlexItem grow={false}>
                    <EuiText size="xs">
                      <h4 style={{ margin: 0 }}>
                        {i18n.translate('observability.apm.serviceOverview.errorRateByOps', {
                          defaultMessage: 'Error rate by operations',
                        })}
                      </h4>
                    </EuiText>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiIconTip
                      content={i18n.translate(
                        'observability.apm.serviceOverview.errorRateByOpsTooltip',
                        {
                          defaultMessage:
                            'Error rate calculated as (error/request) * 100 from gauge metrics, ranked with topk() by operation label',
                        }
                      )}
                      position="right"
                      type="questionInCircle"
                    />
                  </EuiFlexItem>
                </EuiFlexGroup>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiFlexGroup alignItems="center" gutterSize="s">
                  <EuiFlexItem grow={false}>
                    <EuiText size="xs">
                      <strong>Top</strong>
                    </EuiText>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiButtonGroup
                      legend="Top K operations"
                      options={limitOptions}
                      idSelected={String(errorRateTopK)}
                      onChange={(id) => setErrorRateTopK(Number(id))}
                      buttonSize="compressed"
                      isFullWidth={false}
                    />
                  </EuiFlexItem>
                </EuiFlexGroup>
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiSpacer size="s" />
            <PromQLLineChart
              promqlQuery={getQueryServiceErrorRateOverTime(
                environment,
                serviceName,
                errorRateTopK
              )}
              timeRange={timeRange}
              prometheusConnectionId={prometheusConnectionId}
              formatValue={formatPercentage}
              formatTooltipValue={formatPercentageValue}
              refreshTrigger={refreshTrigger}
              labelField="operation"
            />
          </EuiPanel>
        </EuiFlexItem>
      </EuiFlexGroup>

      {/* Service Correlations Flyout */}
      {flyoutOpen && (
        <ServiceCorrelationsFlyout
          serviceName={serviceName}
          environment={environment || 'default'}
          timeRange={timeRange}
          initialTab={flyoutInitialTab}
          onClose={() => setFlyoutOpen(false)}
        />
      )}
    </div>
  );
};

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  EuiBadge,
  EuiBasicTable,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { TimeRange } from '../../common/types/service_details_types';
import { PromQLMetricCard } from '../../shared/components/promql_metric_card';
import { PromQLLineChart } from '../../shared/components/promql_line_chart';
import { useApmConfig } from '../../config/apm_config_context';
import { useChartStepWindow } from '../../shared/hooks/use_chart_step_window';
import { RESOLUTION_LOW, formatPrometheusDuration } from '../../shared/utils/step_utils';
import { PromQLSearchService } from '../../query_services/promql_search_service';
import { PPLSearchService } from '../../query_services/ppl_search_service';
import { getNodeTypeLabel } from '../../shared/utils/platform_utils';
import { APM_CONSTANTS } from '../../common/constants';
import { formatCount, formatPercentageValue, formatLatency } from '../../common/format_utils';
import {
  getQueryDependencyRequests,
  getQueryDependencyFaults,
  getQueryDependencyErrors,
  getQueryDependencyLatency,
  getQueryDependencyFaultRateCard,
  getQueryDependencyErrorRateCard,
  getQueryDependencyLatencyP99Card,
  getQueryDependencyCallers,
} from '../../query_services/query_requests/promql_queries';

export interface DependencyDetailsProps {
  dependencyName: string;
  environment?: string;
  nodeType: string;
  timeRange: TimeRange;
  refreshTrigger: number;
}

interface CallerRow {
  service: string;
  operation: string;
  requests: number;
}

interface SpanRow {
  spanId: string;
  serviceName: string;
  name: string;
  durationMs: number;
  statusCode: number;
  startTime: string;
}

const CHART_HEIGHT = 200;

const escPpl = (s: string): string => s.replace(/'/g, "''");

/**
 * Build the PPL `where` clause that selects the caller spans targeting this
 * dependency. A dependency emits no spans of its own, so these are the callers'
 * CLIENT/PRODUCER/CONSUMER spans identified by dependency attributes (mirrors how
 * the node was synthesized). Field names verified against the trace index.
 */
function buildDependencySpanWhere(nodeType: string, name: string): string | null {
  if (!name) return null;
  const hostOf = (n: string): string => (n.includes(':') ? n.slice(0, n.lastIndexOf(':')) : n);

  if (nodeType === 'messaging') {
    // name = "{system}:{destination}"
    const idx = name.indexOf(':');
    const destination = idx >= 0 ? name.slice(idx + 1) : name;
    return `where attributes.messaging.destination.name = '${escPpl(destination)}'`;
  }
  if (nodeType === 'database') {
    if (name.includes(':')) {
      const host = hostOf(name);
      return `where attributes.server.address = '${escPpl(host)}' or attributes.net.peer.name = '${escPpl(
        host
      )}'`;
    }
    return `where attributes.db_system_name = '${escPpl(name)}' or attributes.db_system = '${escPpl(
      name
    )}' or attributes.db.system.name = '${escPpl(name)}'`;
  }
  // external
  const host = hostOf(name);
  return `where attributes.server.address = '${escPpl(host)}' or attributes.net.peer.name = '${escPpl(
    host
  )}' or attributes.peer.service = '${escPpl(name)}'`;
}

/**
 * DependencyDetails - tailored detail page for inferred dependency nodes
 * (database / messaging / external). These do not emit their own spans, so all
 * metrics are derived from the callers' CLIENT spans (remoteService=<name>), and
 * a "Callers" table lists which services call this dependency. Service-only
 * surfaces (Operations / SLOs / self-spans) are intentionally omitted.
 */
export const DependencyDetails: React.FC<DependencyDetailsProps> = ({
  dependencyName,
  environment = 'generic:default',
  nodeType,
  timeRange,
  refreshTrigger,
}) => {
  const { config } = useApmConfig();
  const prometheusConnectionId = config?.prometheusDataSource?.name || '';
  const prometheusConnectionMeta = config?.prometheusDataSource?.meta;

  const { window: metricCardWindow, timeRangeSeconds } = useChartStepWindow(
    timeRange,
    RESOLUTION_LOW
  );
  const { window: chartStepWindow } = useChartStepWindow(timeRange);

  const [callers, setCallers] = useState<CallerRow[]>([]);
  const [callersLoading, setCallersLoading] = useState(false);
  const [spans, setSpans] = useState<SpanRow[]>([]);
  const [spansLoading, setSpansLoading] = useState(false);

  const promqlService = useMemo(() => {
    if (!prometheusConnectionId) return null;
    return new PromQLSearchService(prometheusConnectionId, prometheusConnectionMeta);
  }, [prometheusConnectionId, prometheusConnectionMeta]);

  // Fetch the callers table (which services call this dependency, and how often).
  useEffect(() => {
    if (!promqlService) return;
    const abortController = new AbortController();
    const fetchCallers = async () => {
      setCallersLoading(true);
      try {
        // Aggregate caller request counts over the selected range.
        const range = formatPrometheusDuration(timeRangeSeconds || 900);
        const query = getQueryDependencyCallers(environment, dependencyName, range);
        const resp = await promqlService.executeInstantQuery({
          query,
          time: Math.floor(Date.now() / 1000),
          signal: abortController.signal,
        });
        if (abortController.signal.aborted) return;
        setCallers(parseCallers(resp));
      } catch (e) {
        if (!abortController.signal.aborted) {
          console.error('[DependencyDetails] Failed to fetch callers:', e);
          setCallers([]);
        }
      } finally {
        if (!abortController.signal.aborted) setCallersLoading(false);
      }
    };
    fetchCallers();
    return () => abortController.abort();
  }, [promqlService, environment, dependencyName, timeRangeSeconds, refreshTrigger]);

  // Fetch the caller spans that target this dependency (it emits none of its own),
  // filtered by the dependency's identifying attributes.
  useEffect(() => {
    const tracesDataset = config?.tracesDataset;
    const where = buildDependencySpanWhere(nodeType, dependencyName);
    if (!tracesDataset || !where) {
      setSpans([]);
      return;
    }
    let cancelled = false;
    const fetchSpans = async () => {
      setSpansLoading(true);
      try {
        const pplService = new PPLSearchService();
        const dataset = {
          id: tracesDataset.id,
          title: tracesDataset.title,
          dataSource: tracesDataset.datasourceId ? { id: tracesDataset.datasourceId } : undefined,
        };
        const query = `source=${dataset.title} | ${where} | sort - startTime | head 50`;
        const resp = await pplService.executeQuery(query, dataset);
        if (cancelled) return;
        const rows: SpanRow[] = (resp.jsonData || []).map((item: any, idx: number) => ({
          spanId: item.spanId || `span-${idx}`,
          serviceName: item.serviceName || '-',
          name: item.name || '-',
          durationMs: (item.durationInNanos || 0) / 1_000_000,
          statusCode: item['status.code'] ?? item.status?.code ?? 0,
          startTime: item.startTime || '',
        }));
        setSpans(rows);
      } catch (e) {
        if (!cancelled) {
          console.error('[DependencyDetails] Failed to fetch dependency spans:', e);
          setSpans([]);
        }
      } finally {
        if (!cancelled) setSpansLoading(false);
      }
    };
    fetchSpans();
    return () => {
      cancelled = true;
    };
  }, [config, nodeType, dependencyName, timeRangeSeconds, refreshTrigger]);

  const requestsQuery = getQueryDependencyRequests(environment, dependencyName, chartStepWindow);
  const faultsQuery = getQueryDependencyFaults(environment, dependencyName, chartStepWindow);
  const errorsQuery = getQueryDependencyErrors(environment, dependencyName, chartStepWindow);
  const latencyQuery = getQueryDependencyLatency(environment, dependencyName);

  const callerColumns = [
    {
      field: 'service',
      name: i18n.translate('observability.apm.dependencyDetails.callers.service', {
        defaultMessage: 'Calling service',
      }),
    },
    {
      field: 'operation',
      name: i18n.translate('observability.apm.dependencyDetails.callers.operation', {
        defaultMessage: 'Operation',
      }),
    },
    {
      field: 'requests',
      name: i18n.translate('observability.apm.dependencyDetails.callers.requests', {
        defaultMessage: 'Requests',
      }),
      align: 'right' as const,
      render: (v: number) => formatCount(v),
    },
  ];

  const spanColumns = [
    {
      field: 'serviceName',
      name: i18n.translate('observability.apm.dependencyDetails.spans.caller', {
        defaultMessage: 'Caller',
      }),
    },
    {
      field: 'name',
      name: i18n.translate('observability.apm.dependencyDetails.spans.operation', {
        defaultMessage: 'Operation',
      }),
    },
    {
      field: 'durationMs',
      name: i18n.translate('observability.apm.dependencyDetails.spans.duration', {
        defaultMessage: 'Duration',
      }),
      align: 'right' as const,
      render: (v: number) => formatLatency(v),
    },
    {
      field: 'statusCode',
      name: i18n.translate('observability.apm.dependencyDetails.spans.status', {
        defaultMessage: 'Status',
      }),
      render: (code: number) => (code === 2 ? 'Error' : 'OK'),
    },
    {
      field: 'startTime',
      name: i18n.translate('observability.apm.dependencyDetails.spans.time', {
        defaultMessage: 'Start time',
      }),
    },
  ];

  return (
    <div data-test-subj="dependencyDetails">
      <EuiSpacer size="m" />
      {/* Name is already shown in the page chrome header; here we add the type badge
          and a short explanation of where the metrics come from. */}
      <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiBadge color="hollow">{getNodeTypeLabel(nodeType)}</EuiBadge>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiText size="xs" color="subdued">
            {i18n.translate('observability.apm.dependencyDetails.subtitle', {
              defaultMessage:
                'Inferred dependency — metrics are derived from the calling services’ client spans.',
            })}
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="m" />

      {/* Metric cards */}
      <EuiFlexGroup gutterSize="m">
        <EuiFlexItem>
          <PromQLMetricCard
            title={i18n.translate('observability.apm.dependencyDetails.throughput', {
              defaultMessage: 'Throughput (req/s)',
            })}
            promqlQuery={getQueryDependencyRequests(environment, dependencyName, metricCardWindow)}
            timeRange={timeRange}
            prometheusConnectionId={prometheusConnectionId}
            formatValue={formatCount}
            refreshTrigger={refreshTrigger}
            divisor={timeRangeSeconds}
          />
        </EuiFlexItem>
        <EuiFlexItem>
          <PromQLMetricCard
            title={i18n.translate('observability.apm.dependencyDetails.latencyP99', {
              defaultMessage: 'Latency (P99)',
            })}
            promqlQuery={getQueryDependencyLatencyP99Card(
              environment,
              dependencyName,
              metricCardWindow
            )}
            timeRange={timeRange}
            prometheusConnectionId={prometheusConnectionId}
            formatValue={formatLatency}
            refreshTrigger={refreshTrigger}
          />
        </EuiFlexItem>
        <EuiFlexItem>
          <PromQLMetricCard
            title={i18n.translate('observability.apm.dependencyDetails.faultRate', {
              defaultMessage: 'Fault rate (5xx)',
            })}
            promqlQuery={getQueryDependencyFaultRateCard(environment, dependencyName)}
            timeRange={timeRange}
            prometheusConnectionId={prometheusConnectionId}
            formatValue={formatPercentageValue}
            invertColor
            refreshTrigger={refreshTrigger}
          />
        </EuiFlexItem>
        <EuiFlexItem>
          <PromQLMetricCard
            title={i18n.translate('observability.apm.dependencyDetails.errorRate', {
              defaultMessage: 'Error rate (4xx)',
            })}
            promqlQuery={getQueryDependencyErrorRateCard(environment, dependencyName)}
            timeRange={timeRange}
            prometheusConnectionId={prometheusConnectionId}
            formatValue={formatPercentageValue}
            invertColor
            refreshTrigger={refreshTrigger}
          />
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="m" />

      {/* Charts */}
      <EuiFlexGroup gutterSize="m">
        <EuiFlexItem>
          <EuiPanel paddingSize="s" hasBorder>
            <EuiText size="xs">
              <strong>
                {i18n.translate('observability.apm.dependencyDetails.requests', {
                  defaultMessage: 'Requests',
                })}
              </strong>
            </EuiText>
            <PromQLLineChart
              promqlQuery={requestsQuery}
              timeRange={timeRange}
              prometheusConnectionId={prometheusConnectionId}
              chartType="area"
              height={CHART_HEIGHT}
              showLegend={false}
              formatValue={formatCount}
              refreshTrigger={refreshTrigger}
              color={APM_CONSTANTS.COLORS.THROUGHPUT}
            />
          </EuiPanel>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiPanel paddingSize="s" hasBorder>
            <EuiText size="xs">
              <strong>
                {i18n.translate('observability.apm.dependencyDetails.latency', {
                  defaultMessage: 'Latency',
                })}
              </strong>
            </EuiText>
            <PromQLLineChart
              promqlQuery={latencyQuery}
              timeRange={timeRange}
              prometheusConnectionId={prometheusConnectionId}
              chartType="line"
              height={CHART_HEIGHT}
              showLegend={true}
              formatValue={formatLatency}
              refreshTrigger={refreshTrigger}
              labelField="percentile"
            />
          </EuiPanel>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="m" />

      <EuiFlexGroup gutterSize="m">
        <EuiFlexItem>
          <EuiPanel paddingSize="s" hasBorder>
            <EuiText size="xs">
              <strong>
                {i18n.translate('observability.apm.dependencyDetails.faults5xx', {
                  defaultMessage: 'Faults (5xx)',
                })}
              </strong>
            </EuiText>
            <PromQLLineChart
              promqlQuery={faultsQuery}
              timeRange={timeRange}
              prometheusConnectionId={prometheusConnectionId}
              chartType="area"
              height={CHART_HEIGHT}
              showLegend={false}
              formatValue={formatCount}
              refreshTrigger={refreshTrigger}
              color={APM_CONSTANTS.COLORS.FAULT}
            />
          </EuiPanel>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiPanel paddingSize="s" hasBorder>
            <EuiText size="xs">
              <strong>
                {i18n.translate('observability.apm.dependencyDetails.errors4xx', {
                  defaultMessage: 'Errors (4xx)',
                })}
              </strong>
            </EuiText>
            <PromQLLineChart
              promqlQuery={errorsQuery}
              timeRange={timeRange}
              prometheusConnectionId={prometheusConnectionId}
              chartType="area"
              height={CHART_HEIGHT}
              showLegend={false}
              formatValue={formatCount}
              refreshTrigger={refreshTrigger}
              color={APM_CONSTANTS.COLORS.WARNING}
            />
          </EuiPanel>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="m" />

      {/* Callers table */}
      <EuiPanel paddingSize="m" hasBorder>
        <EuiTitle size="xs">
          <h3>
            {i18n.translate('observability.apm.dependencyDetails.callers.title', {
              defaultMessage: 'Callers',
            })}
          </h3>
        </EuiTitle>
        <EuiText size="xs" color="subdued">
          {i18n.translate('observability.apm.dependencyDetails.callers.description', {
            defaultMessage: 'Services calling this dependency and the operations they invoke.',
          })}
        </EuiText>
        <EuiSpacer size="s" />
        <EuiBasicTable
          items={callers}
          columns={callerColumns}
          loading={callersLoading}
          noItemsMessage={i18n.translate('observability.apm.dependencyDetails.callers.empty', {
            defaultMessage: 'No callers found in the selected time range.',
          })}
        />
      </EuiPanel>

      <EuiSpacer size="m" />

      {/* Spans: the callers' client spans targeting this dependency (it emits none of its own). */}
      <EuiPanel paddingSize="m" hasBorder>
        <EuiTitle size="xs">
          <h3>
            {i18n.translate('observability.apm.dependencyDetails.spans.title', {
              defaultMessage: 'Spans',
            })}
          </h3>
        </EuiTitle>
        <EuiText size="xs" color="subdued">
          {i18n.translate('observability.apm.dependencyDetails.spans.description', {
            defaultMessage:
              'Recent spans from calling services that target this dependency (it emits no spans of its own).',
          })}
        </EuiText>
        <EuiSpacer size="s" />
        <EuiBasicTable
          items={spans}
          columns={spanColumns}
          loading={spansLoading}
          noItemsMessage={i18n.translate('observability.apm.dependencyDetails.spans.empty', {
            defaultMessage: 'No spans found for this dependency in the selected time range.',
          })}
        />
      </EuiPanel>
    </div>
  );
};

/**
 * Parse the callers instant-query response into rows. Handles the query-enhancements
 * data_frame shape (Series label string) and the standard Prometheus result shape.
 */
function parseCallers(response: any): CallerRow[] {
  if (!response) return [];

  const rows: CallerRow[] = [];

  // data_frame shape
  if (response?.type === 'data_frame' && Array.isArray(response.fields)) {
    const seriesField = response.fields.find((f: any) => f.name === 'Series');
    const valueField = response.fields.find((f: any) => f.name === 'Value');
    if (seriesField && valueField) {
      for (let i = 0; i < seriesField.values.length; i++) {
        const label = String(seriesField.values[i]);
        const svc = label.match(/service="([^"]*)"/)?.[1] || '';
        const op = label.match(/remoteOperation="([^"]*)"/)?.[1] || '';
        rows.push({ service: svc, operation: op, requests: parseFloat(valueField.values[i]) || 0 });
      }
    }
  }

  // standard Prometheus result shape
  const result = response?.data?.result || response?.result || [];
  if (rows.length === 0 && Array.isArray(result)) {
    result.forEach((r: any) => {
      rows.push({
        service: r.metric?.service || '',
        operation: r.metric?.remoteOperation || '',
        requests: parseFloat(r.value?.[1]) || 0,
      });
    });
  }

  return rows.filter((r) => r.service).sort((a, b) => b.requests - a.requests);
}

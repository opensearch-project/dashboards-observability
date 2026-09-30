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
import { ApmCursorContext, createApmCursorBus } from '../../shared/hooks/apm_cursor_context';
import { RESOLUTION_LOW, formatPrometheusDuration } from '../../shared/utils/step_utils';
import { PromQLSearchService } from '../../query_services/promql_search_service';
import { PPLSearchService } from '../../query_services/ppl_search_service';
import { getNodeTypeLabel, isMessagingType } from '../../shared/utils/platform_utils';
import { parseTimeRange } from '../../shared/utils/time_utils';
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
import {
  buildDependencySpanCondition,
  flattenDependencyAttributes,
  getQueryDependencyAttributes,
  getQueryDependencySpans,
} from '../../query_services/query_requests/ppl_queries';

export interface DependencyDetailsProps {
  dependencyName: string;
  environment?: string;
  nodeType: string;
  timeRange: TimeRange;
  refreshTrigger: number;
  /** Called with ISO-8601 start/end when a chart is brushed, to zoom the page time range. */
  onTimeRangeChange?: (from: string, to: string) => void;
}

// data-prepper folds dependencies over its cardinality cap into these nodes (one per type,
// plus the pre-typed fallback), so they match no single dependency's spans.
const OVERFLOW_DEPENDENCY_NAMES = new Set([
  'OtherDatabase',
  'OtherExternal',
  'OtherMessaging',
  'OtherRemoteService',
]);

interface CallerRow {
  service: string;
  operation: string;
  requests: number;
  /** Messaging direction from the `spanKind` label (PRODUCER / CONSUMER); empty otherwise. */
  role: string;
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
  onTimeRangeChange,
}) => {
  const { config } = useApmConfig();
  // Syncs the crosshair across this page's charts.
  const cursorBus = useMemo(() => createApmCursorBus(), []);
  const isOverflow = OVERFLOW_DEPENDENCY_NAMES.has(dependencyName);
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
        // Aggregate caller request counts over the selected range, evaluated at its end
        // (not "now") so a historical range shows that range's callers.
        const range = formatPrometheusDuration(timeRangeSeconds || 900);
        const query = getQueryDependencyCallers(environment, dependencyName, range);
        const { endTime } = parseTimeRange(timeRange);
        const resp = await promqlService.executeInstantQuery({
          query,
          time: Math.floor(endTime.getTime() / 1000),
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
    // timeRange is keyed on its from/to strings so a re-created object does not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    promqlService,
    environment,
    dependencyName,
    timeRangeSeconds,
    timeRange.from,
    timeRange.to,
    refreshTrigger,
  ]);

  // Fetch the caller spans that target this dependency (it emits none of its own),
  // matched on the node's dependencyAttributes from the service map (falling back to
  // the node name for older documents) within the selected time range.
  useEffect(() => {
    const tracesDataset = config?.tracesDataset;
    if (!tracesDataset || !dependencyName || isOverflow) {
      setSpans([]);
      return;
    }
    const serviceMapDataset = config?.serviceMapDataset;
    const toDataset = (ds: { id: string; title: string; datasourceId?: string }) => ({
      id: ds.id,
      title: ds.title,
      ...(ds.datasourceId && { dataSource: { id: ds.datasourceId, type: 'DATA_SOURCE' } }),
    });
    let cancelled = false;
    const fetchSpans = async () => {
      setSpansLoading(true);
      try {
        const pplService = new PPLSearchService();
        const { startTime, endTime } = parseTimeRange(timeRange);

        let attributes: Record<string, string> = {};
        if (serviceMapDataset) {
          try {
            const attrResp = await pplService.executeQuery(
              getQueryDependencyAttributes(
                serviceMapDataset.title,
                dependencyName,
                environment,
                startTime,
                endTime
              ),
              toDataset(serviceMapDataset)
            );
            attributes = flattenDependencyAttributes(
              attrResp.jsonData?.[0]?.['targetNode.dependencyAttributes']
            );
          } catch (_e) {
            // Older service-map data has no dependencyAttributes; parse the name instead.
            attributes = {};
          }
        }
        if (cancelled) return;

        const spansQuery = (includeLegacyKeys: boolean) => {
          const condition = buildDependencySpanCondition(nodeType, dependencyName, attributes, {
            includeLegacyKeys,
          });
          return condition
            ? getQueryDependencySpans(tracesDataset.title, condition, startTime, endTime)
            : null;
        };
        const query = spansQuery(false);
        if (!query) {
          setSpans([]);
          return;
        }
        let resp = await pplService.executeQuery(query, toDataset(tracesDataset));
        // Only if nothing matched, also try the legacy keys (`db.system`,
        // `messaging.destination`). They are objects wherever their `.name` keys are
        // mapped, and PPL rejects that comparison, so this attempt may fail harmlessly.
        const legacyQuery = spansQuery(true);
        if (!cancelled && !(resp.jsonData || []).length && legacyQuery && legacyQuery !== query) {
          try {
            resp = await pplService.executeQuery(legacyQuery, toDataset(tracesDataset));
          } catch (_e) {
            // Keep the (empty) result of the query without legacy keys.
          }
        }
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
    // timeRange is keyed on its from/to strings so a re-created object does not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    config,
    nodeType,
    dependencyName,
    isOverflow,
    environment,
    timeRange.from,
    timeRange.to,
    refreshTrigger,
  ]);

  const requestsQuery = getQueryDependencyRequests(environment, dependencyName, chartStepWindow);
  const faultsQuery = getQueryDependencyFaults(environment, dependencyName, chartStepWindow);
  const errorsQuery = getQueryDependencyErrors(environment, dependencyName, chartStepWindow);
  const latencyQuery = getQueryDependencyLatency(environment, dependencyName);

  // A broker's series come from both producers and consumers, so "calling" would mislabel them.
  const isMessaging = isMessagingType(nodeType);

  const callerColumns = [
    {
      field: 'service',
      name: isMessaging
        ? i18n.translate('observability.apm.dependencyDetails.callers.messagingService', {
            defaultMessage: 'Producing or consuming service',
          })
        : i18n.translate('observability.apm.dependencyDetails.callers.service', {
            defaultMessage: 'Calling service',
          }),
    },
    ...(isMessaging
      ? [
          {
            field: 'role',
            name: i18n.translate('observability.apm.dependencyDetails.callers.role', {
              defaultMessage: 'Role',
            }),
            render: (role: string) =>
              role === 'PRODUCER'
                ? i18n.translate('observability.apm.dependencyDetails.callers.producer', {
                    defaultMessage: 'Producer',
                  })
                : role === 'CONSUMER'
                  ? i18n.translate('observability.apm.dependencyDetails.callers.consumer', {
                      defaultMessage: 'Consumer',
                    })
                  : '—',
          },
        ]
      : []),
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
            {isMessaging
              ? i18n.translate('observability.apm.dependencyDetails.messagingSubtitle', {
                  defaultMessage:
                    'Inferred message broker — throughput, latency and failures are measured on publishes, so each message counts once.',
                })
              : i18n.translate('observability.apm.dependencyDetails.subtitle', {
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
      <ApmCursorContext.Provider value={cursorBus}>
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
                onTimeRangeChange={onTimeRangeChange}
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
                onTimeRangeChange={onTimeRangeChange}
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
                onTimeRangeChange={onTimeRangeChange}
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
                onTimeRangeChange={onTimeRangeChange}
                color={APM_CONSTANTS.COLORS.WARNING}
              />
            </EuiPanel>
          </EuiFlexItem>
        </EuiFlexGroup>
      </ApmCursorContext.Provider>

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
          {isMessaging
            ? i18n.translate('observability.apm.dependencyDetails.callers.messagingDescription', {
                defaultMessage:
                  'Services publishing to or consuming from this destination, with the requests each made.',
              })
            : i18n.translate('observability.apm.dependencyDetails.callers.description', {
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
          noItemsMessage={
            isOverflow
              ? i18n.translate('observability.apm.dependencyDetails.spans.overflow', {
                  defaultMessage:
                    'This node groups dependencies over the data-prepper cardinality cap, so its spans cannot be matched to a single dependency.',
                })
              : i18n.translate('observability.apm.dependencyDetails.spans.empty', {
                  defaultMessage: 'No spans found for this dependency in the selected time range.',
                })
          }
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
    const labelsField = response.fields.find((f: any) => f.name === 'Labels');
    const valueField = response.fields.find((f: any) => f.name === 'Value');
    if (valueField && (labelsField || seriesField)) {
      for (let i = 0; i < valueField.values.length; i++) {
        // Prefer the structured Labels object; fall back to parsing the Series string.
        const labels = labelsField?.values?.[i];
        const series = String(seriesField?.values?.[i] ?? '');
        const svc =
          labels && typeof labels === 'object'
            ? labels.service || ''
            : series.match(/service="([^"]*)"/)?.[1] || '';
        const op =
          labels && typeof labels === 'object'
            ? labels.remoteOperation || ''
            : series.match(/remoteOperation="([^"]*)"/)?.[1] || '';
        const role =
          labels && typeof labels === 'object'
            ? labels.spanKind || ''
            : series.match(/spanKind="([^"]*)"/)?.[1] || '';
        rows.push({
          service: svc,
          operation: op,
          role,
          requests: parseFloat(valueField.values[i]) || 0,
        });
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
        role: r.metric?.spanKind || '',
        requests: parseFloat(r.value?.[1]) || 0,
      });
    });
  }

  return rows.filter((r) => r.service).sort((a, b) => b.requests - a.requests);
}

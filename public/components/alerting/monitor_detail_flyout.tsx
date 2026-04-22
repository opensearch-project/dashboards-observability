/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Monitor Detail Flyout — comprehensive view of a single monitor's
 * configuration, behavior, and impact with quick actions.
 */
import React, { useState, useEffect, useMemo } from 'react';
import type { EChartsOption, SeriesOption } from 'echarts';
import {
  EuiFlyout,
  EuiFlyoutHeader,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiTitle,
  EuiText,
  EuiSpacer,
  EuiBadge,
  EuiHealth,
  EuiFlexGroup,
  EuiFlexItem,
  EuiButton,
  EuiButtonEmpty,
  EuiPanel,
  EuiDescriptionList,
  EuiBasicTable,
  EuiBasicTableColumn,
  EuiAccordion,
  EuiToolTip,
  EuiCodeBlock,
  EuiIcon,
  EuiLoadingContent,
  EuiStat,
} from '@elastic/eui';
import { EchartsRender } from './echarts_render';
import {
  AlertHistoryEntry,
  NotificationRouting,
  OSMonitor,
  OSMonitorInput,
  UnifiedAlertSeverity,
  UnifiedRule,
  UnifiedRuleSummary,
} from '../../../common/types/alerting';
import { AlarmsApiClient } from './services/alarms_client';
import { DeleteModal } from '../common/helpers/delete_modal';

import { SEVERITY_COLORS, STATE_COLORS, STATUS_COLORS, HEALTH_COLORS } from './shared_constants';

// ============================================================================
// Condition humanizer — translates Painless scripts into readable text
// ============================================================================

function humanizeCondition(condition: string): React.ReactNode {
  const trimmed = condition.trim();

  // "return true" → "Always trigger"
  if (/^return\s+true\s*;?\s*$/.test(trimmed)) {
    return 'Always trigger';
  }

  // ctx.results[0].hits.total.value <op> N → "Document count <op> N"
  const docCountMatch = trimmed.match(
    /ctx\.results\[0]\.hits\.total\.value\s*(>=|<=|!=|==|>|<)\s*([\d.]+)/
  );
  if (docCountMatch) {
    return `Document count ${docCountMatch[1]} ${docCountMatch[2]}`;
  }

  // Anything else: show the raw condition in a code style
  return <code>{condition}</code>;
}

// ============================================================================
// SVG Line Graph for condition preview
// ============================================================================

const ConditionPreviewGraph: React.FC<{
  data: Array<{ timestamp: number; value: number }>;
  threshold?: { operator: string; value: number; unit?: string };
}> = ({ data, threshold }) => {
  // Handle sparse data: show a stat card instead of a chart for 1-2 data points
  const isSparse = data && data.length > 0 && data.length <= 2;

  const spec = useMemo((): EChartsOption | null => {
    if (!data || data.length === 0 || isSparse) return null;

    const timestamps = data.map((d) =>
      new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    );
    const values = data.map((d) => d.value);

    const series: SeriesOption[] = [
      {
        type: 'line',
        data: values,
        smooth: true,
        symbol: 'circle',
        symbolSize: 4,
        lineStyle: { color: '#006BB4', width: 2 },
        itemStyle: { color: '#006BB4' },
        areaStyle: { color: 'rgba(0, 107, 180, 0.08)' },
      },
    ];

    // Threshold line as a markLine
    if (threshold) {
      (series[0] as Record<string, unknown>).markLine = {
        silent: true,
        symbol: 'none',
        lineStyle: { color: '#BD271E', type: 'dashed', width: 1.5 },
        label: {
          formatter: `${threshold.value}${threshold.unit || ''}`,
          position: 'end',
          color: '#BD271E',
          fontSize: 10,
        },
        data: [{ yAxis: threshold.value }],
      };
    }

    return {
      grid: { left: 45, right: 15, top: 15, bottom: 30 },
      tooltip: {
        trigger: 'axis',
        formatter: (params: unknown) => {
          const p = (params as Array<{ axisValue: string; value: number }>)[0];
          return `${p.axisValue}<br/>${p.value.toFixed(2)}`;
        },
      },
      xAxis: {
        type: 'category',
        data: timestamps,
        axisLine: { lineStyle: { color: '#EDF0F5' } },
        axisLabel: { color: '#98A2B3', fontSize: 9 },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: '#EDF0F5' } },
        axisLabel: { color: '#98A2B3', fontSize: 9 },
      },
      series,
    };
  }, [data, threshold, isSparse]);

  if (!data || data.length === 0)
    return (
      <EuiText size="s" color="subdued">
        <em>
          No recent evaluation data available. The condition preview populates after the monitor
          executes and records metric data.
        </em>
      </EuiText>
    );

  if (isSparse) {
    const latestPoint = data[data.length - 1];
    const formattedValue = Number.isInteger(latestPoint.value)
      ? String(latestPoint.value)
      : latestPoint.value.toFixed(2);
    return (
      <EuiPanel color="subdued" paddingSize="m">
        <EuiStat title={formattedValue} description="Latest evaluated value" titleSize="l" />
        <EuiSpacer size="xs" />
        <EuiText size="xs" color="subdued">
          <em>Limited evaluation data — showing latest value</em>
        </EuiText>
      </EuiPanel>
    );
  }

  return <EchartsRender spec={spec!} height={180} />;
};

// ============================================================================
// Props
// ============================================================================

export interface MonitorDetailFlyoutProps {
  monitor: UnifiedRuleSummary;
  apiClient: AlarmsApiClient;
  onClose: () => void;
  onDelete: (id: string) => void;
  onClone: (monitor: UnifiedRuleSummary) => void;
}

// ============================================================================
// Main Component
// ============================================================================

export const MonitorDetailFlyout: React.FC<MonitorDetailFlyoutProps> = ({
  monitor,
  apiClient,
  onClose,
  onDelete,
  onClone,
}) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [detail, setDetail] = useState<UnifiedRule | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);

  // Fetch full detail from the API when flyout opens
  useEffect(() => {
    let cancelled = false;
    setDetailLoading(true);
    const dsId = monitor.datasourceId;
    const ruleId = monitor.id;
    apiClient
      .getRuleDetail(dsId, ruleId)
      .then((data: UnifiedRule) => {
        if (!cancelled && data) setDetail(data);
      })
      .catch((err: unknown) => {
        console.error('Failed to load monitor details:', err);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [monitor.datasourceId, monitor.id, apiClient]);

  // Use detail data when available, fall back to summary props.
  // `detail` has the full shape; `monitor` is only a summary, so
  // detail-only fields are empty until the fetch resolves.
  const alertHistory = detail?.alertHistory ?? [];
  const conditionPreviewData = detail?.conditionPreviewData ?? [];
  const notificationRouting = detail?.notificationRouting ?? [];
  const suppressionRules = detail?.suppressionRules ?? [];
  const description = detail?.description ?? '';
  const aiSummary = detail?.aiSummary ?? '';
  const evaluationInterval = detail?.evaluationInterval ?? monitor.evaluationInterval ?? '—';
  const pendingPeriod = detail?.pendingPeriod ?? monitor.pendingPeriod ?? '—';

  const isJson = (s: string) => {
    try {
      JSON.parse(s);
      return true;
    } catch {
      return false;
    }
  };
  const queryDisplay = isJson(monitor.query)
    ? JSON.stringify(JSON.parse(monitor.query), null, 2)
    : monitor.query;
  const queryLang = monitor.datasourceType === 'prometheus' ? 'promql' : 'json';

  // Detect monitor kind from raw data for type-specific rendering
  const monitorKind = monitor.labels?.monitor_kind as string | undefined;
  const rawMonitor = detail?.raw as OSMonitor | undefined;
  const rawInput: OSMonitorInput | undefined =
    rawMonitor && 'inputs' in rawMonitor ? rawMonitor.inputs?.[0] : undefined;

  // Alert history columns
  const historyColumns: Array<EuiBasicTableColumn<AlertHistoryEntry>> = [
    {
      field: 'timestamp',
      name: 'Time',
      width: '180px',
      render: (ts: string) => new Date(ts).toLocaleString(),
    },
    {
      field: 'state',
      name: 'State',
      render: (s: string) => <EuiHealth color={STATE_COLORS[s] || 'subdued'}>{s}</EuiHealth>,
    },
    { field: 'value', name: 'Value', width: '80px' },
    { field: 'message', name: 'Message', truncateText: true },
  ];

  // Notification routing columns
  const routingColumns: Array<EuiBasicTableColumn<NotificationRouting>> = [
    { field: 'channel', name: 'Channel', width: '100px' },
    { field: 'destination', name: 'Destination' },
    {
      field: 'severity',
      name: 'Severities',
      width: '160px',
      render: (sevs: UnifiedAlertSeverity[] | undefined) =>
        sevs
          ? sevs.map((s) => (
              <EuiBadge key={s} color={SEVERITY_COLORS[s]}>
                {s}
              </EuiBadge>
            ))
          : 'All',
    },
    { field: 'throttle', name: 'Throttle', width: '100px', render: (t: string) => t || '—' },
  ];

  return (
    <>
      <EuiFlyout onClose={onClose} size="m" ownFocus aria-labelledby="monitorDetailTitle">
        <EuiFlyoutHeader hasBorder>
          <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" responsive={false}>
            <EuiFlexItem>
              <EuiTitle size="m">
                <h2 id="monitorDetailTitle">{monitor.name}</h2>
              </EuiTitle>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiFlexGroup gutterSize="xs" responsive={false}>
                <EuiFlexItem grow={false}>
                  <EuiBadge color={STATUS_COLORS[monitor.status]}>{monitor.status}</EuiBadge>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiBadge color={SEVERITY_COLORS[monitor.severity]}>{monitor.severity}</EuiBadge>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiHealth color={HEALTH_COLORS[monitor.healthStatus]}>
                    {monitor.healthStatus}
                  </EuiHealth>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiSpacer size="s" />
          {/* Quick actions */}
          <EuiFlexGroup gutterSize="s" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiToolTip content="Editing not yet available">
                <EuiButtonEmpty size="s" iconType="pencil" isDisabled>
                  Edit
                </EuiButtonEmpty>
              </EuiToolTip>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty size="s" iconType="copy" onClick={() => onClone(monitor)}>
                Clone
              </EuiButtonEmpty>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty
                size="s"
                iconType="trash"
                color="danger"
                onClick={() => setShowDeleteConfirm(true)}
              >
                Delete
              </EuiButtonEmpty>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlyoutHeader>

        <EuiFlyoutBody>
          {detailLoading ? (
            <EuiLoadingContent lines={10} />
          ) : (
            <>
              {/* Description */}
              <EuiText size="s">
                <p>{description}</p>
              </EuiText>
              <EuiSpacer size="m" />

              {/* AI Summary */}
              <EuiAccordion
                id={`aiSummary-${monitor.id}`}
                buttonContent={
                  <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
                    <EuiFlexItem grow={false}>
                      <EuiIcon type="compute" />
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <strong>AI Summary</strong>
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiBadge color="hollow">Beta</EuiBadge>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                }
                initialIsOpen={true}
                paddingSize="m"
              >
                <EuiPanel color="subdued" paddingSize="m">
                  {aiSummary ? (
                    <EuiText size="s">
                      <p>{aiSummary}</p>
                    </EuiText>
                  ) : (
                    <EuiText size="s" color="subdued">
                      Not configured
                    </EuiText>
                  )}
                </EuiPanel>
              </EuiAccordion>

              <EuiSpacer size="m" />

              {/* Query Definition — type-aware rendering */}
              <EuiAccordion
                id={`queryDef-${monitor.id}`}
                buttonContent={
                  <strong>
                    {monitorKind === 'cluster_metrics'
                      ? 'Cluster API Configuration'
                      : monitorKind === 'doc'
                      ? 'Document-Level Queries'
                      : 'Query Definition'}
                  </strong>
                }
                initialIsOpen={true}
                paddingSize="m"
              >
                {monitorKind === 'cluster_metrics' && rawInput && 'uri' in rawInput ? (
                  <>
                    <EuiDescriptionList
                      type="column"
                      compressed
                      listItems={[
                        { title: 'API Type', description: rawInput.uri.api_type },
                        { title: 'Path', description: rawInput.uri.path || '—' },
                        { title: 'Path Params', description: rawInput.uri.path_params || '—' },
                        { title: 'URL', description: rawInput.uri.url || '—' },
                        {
                          title: 'Clusters',
                          description: rawInput.uri.clusters?.join(', ') || 'Local cluster',
                        },
                      ]}
                    />
                  </>
                ) : monitorKind === 'doc' && rawInput && 'doc_level_input' in rawInput ? (
                  <>
                    <EuiText size="s">
                      <strong>Target indices:</strong>{' '}
                      {rawInput.doc_level_input.indices?.join(', ') || '—'}
                    </EuiText>
                    {rawInput.doc_level_input.description && (
                      <EuiText size="xs" color="subdued">
                        {rawInput.doc_level_input.description}
                      </EuiText>
                    )}
                    <EuiSpacer size="s" />
                    {(rawInput.doc_level_input.queries ?? []).map((q, idx) => (
                      <EuiPanel
                        key={q.id || idx}
                        paddingSize="s"
                        color="subdued"
                        style={{ marginBottom: 8 }}
                      >
                        <EuiText size="s">
                          <strong>{q.name}</strong>
                        </EuiText>
                        <EuiCodeBlock language="json" fontSize="s" paddingSize="s" isCopyable>
                          {q.query}
                        </EuiCodeBlock>
                        {q.tags?.length > 0 && (
                          <EuiFlexGroup gutterSize="xs" wrap responsive={false}>
                            {q.tags.map((tag) => (
                              <EuiFlexItem grow={false} key={tag}>
                                <EuiBadge color="hollow">{tag}</EuiBadge>
                              </EuiFlexItem>
                            ))}
                          </EuiFlexGroup>
                        )}
                      </EuiPanel>
                    ))}
                  </>
                ) : (
                  <>
                    <EuiCodeBlock language={queryLang} fontSize="s" paddingSize="m" isCopyable>
                      {queryDisplay}
                    </EuiCodeBlock>
                    {monitorKind === 'bucket' && (
                      <EuiText size="xs" color="subdued">
                        <em>Bucket-level monitor — triggers evaluate per aggregation bucket</em>
                      </EuiText>
                    )}
                  </>
                )}
                {monitor.condition && (
                  <>
                    <EuiSpacer size="s" />
                    <EuiText size="xs" color="subdued">
                      Condition: {humanizeCondition(monitor.condition)}
                    </EuiText>
                  </>
                )}
              </EuiAccordion>

              <EuiSpacer size="m" />

              {/* Conditions & Thresholds */}
              <EuiAccordion
                id={`conditions-${monitor.id}`}
                buttonContent={<strong>Conditions &amp; Evaluation</strong>}
                initialIsOpen={true}
                paddingSize="m"
              >
                <EuiDescriptionList
                  type="column"
                  compressed
                  listItems={[
                    { title: 'Evaluation Interval', description: evaluationInterval },
                    { title: 'Pending Period', description: pendingPeriod },
                    ...(detail?.firingPeriod
                      ? [{ title: 'Firing Period', description: detail.firingPeriod }]
                      : []),
                    ...(detail?.lookbackPeriod
                      ? [{ title: 'Lookback Period', description: detail.lookbackPeriod }]
                      : []),
                    ...(monitor.threshold
                      ? [
                          {
                            title: 'Threshold',
                            description: `${monitor.threshold.operator} ${monitor.threshold.value}${
                              monitor.threshold.unit || ''
                            }`,
                          },
                        ]
                      : []),
                  ]}
                />
              </EuiAccordion>

              <EuiSpacer size="m" />

              {/* Labels */}
              <EuiAccordion
                id={`labels-${monitor.id}`}
                buttonContent={<strong>Labels</strong>}
                initialIsOpen={true}
                paddingSize="m"
              >
                {(() => {
                  const INTERNAL_LABEL_KEYS = [
                    'monitor_type',
                    'monitor_kind',
                    'datasource_id',
                    '_workspace',
                  ];
                  const visibleLabels = Object.entries(monitor.labels).filter(
                    ([k]) => !INTERNAL_LABEL_KEYS.includes(k)
                  );
                  return (
                    <EuiFlexGroup gutterSize="xs" wrap responsive={false}>
                      {visibleLabels.map(([k, v]) => (
                        <EuiFlexItem grow={false} key={k}>
                          <EuiBadge color="hollow">
                            {k}: {v}
                          </EuiBadge>
                        </EuiFlexItem>
                      ))}
                      {visibleLabels.length === 0 && (
                        <EuiText size="s" color="subdued">
                          Not configured
                        </EuiText>
                      )}
                    </EuiFlexGroup>
                  );
                })()}
              </EuiAccordion>

              <EuiSpacer size="m" />

              {/* Condition Preview Graph */}
              <EuiAccordion
                id={`preview-${monitor.id}`}
                buttonContent={<strong>Condition Preview</strong>}
                initialIsOpen={true}
                paddingSize="m"
              >
                <ConditionPreviewGraph data={conditionPreviewData} threshold={monitor.threshold} />
              </EuiAccordion>

              <EuiSpacer size="m" />

              {/* Alert History */}
              <EuiAccordion
                id={`alertHistory-${monitor.id}`}
                buttonContent={<strong>Recent Alert History ({alertHistory.length})</strong>}
                initialIsOpen={false}
                paddingSize="m"
              >
                <EuiBasicTable items={alertHistory} columns={historyColumns} compressed />
              </EuiAccordion>

              <EuiSpacer size="m" />

              {/* Notification Routing */}
              <EuiAccordion
                id={`routing-${monitor.id}`}
                buttonContent={<strong>Notification Routing ({notificationRouting.length})</strong>}
                initialIsOpen={false}
                paddingSize="m"
              >
                {notificationRouting.length > 0 ? (
                  <EuiBasicTable items={notificationRouting} columns={routingColumns} compressed />
                ) : (
                  <EuiText size="s" color="subdued">
                    No notification routing configured
                  </EuiText>
                )}
              </EuiAccordion>

              <EuiSpacer size="m" />

              {/* Suppression Rules */}
              <EuiAccordion
                id={`suppression-${monitor.id}`}
                buttonContent={<strong>Suppression Rules ({suppressionRules.length})</strong>}
                initialIsOpen={false}
                paddingSize="m"
              >
                {suppressionRules.length > 0 ? (
                  suppressionRules.map((sr) => (
                    <EuiPanel
                      key={sr.id}
                      paddingSize="s"
                      color={sr.active ? 'plain' : 'subdued'}
                      style={{ marginBottom: 8 }}
                    >
                      <EuiFlexGroup alignItems="center" responsive={false}>
                        <EuiFlexItem>
                          <EuiText size="s">
                            <strong>{sr.name}</strong>
                          </EuiText>
                          <EuiText size="xs" color="subdued">
                            {sr.reason}
                          </EuiText>
                          {sr.schedule && <EuiText size="xs">Schedule: {sr.schedule}</EuiText>}
                        </EuiFlexItem>
                        <EuiFlexItem grow={false}>
                          <EuiBadge color={sr.active ? 'success' : 'default'}>
                            {sr.active ? 'Active' : 'Inactive'}
                          </EuiBadge>
                        </EuiFlexItem>
                      </EuiFlexGroup>
                    </EuiPanel>
                  ))
                ) : (
                  <EuiText size="s" color="subdued">
                    No suppression rules applied
                  </EuiText>
                )}
              </EuiAccordion>

              <EuiSpacer size="m" />

              {/* Creation / Modification History */}
              <EuiAccordion
                id={`history-${monitor.id}`}
                buttonContent={<strong>History</strong>}
                initialIsOpen={false}
                paddingSize="m"
              >
                <EuiDescriptionList
                  type="column"
                  compressed
                  listItems={[
                    { title: 'Created By', description: monitor.createdBy },
                    {
                      title: 'Created At',
                      description: new Date(monitor.createdAt).toLocaleString(),
                    },
                    {
                      title: 'Last Modified',
                      description: new Date(monitor.lastModified).toLocaleString(),
                    },
                    {
                      title: 'Last Triggered',
                      description: monitor.lastTriggered
                        ? new Date(monitor.lastTriggered).toLocaleString()
                        : '—',
                    },
                    { title: 'Backend', description: monitor.datasourceType },
                    { title: 'Datasource ID', description: monitor.datasourceId },
                  ]}
                />
              </EuiAccordion>
            </>
          )}
        </EuiFlyoutBody>

        <EuiFlyoutFooter>
          <EuiFlexGroup justifyContent="spaceBetween" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty onClick={onClose}>Close</EuiButtonEmpty>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiFlexGroup gutterSize="s" responsive={false}>
                <EuiFlexItem grow={false}>
                  <EuiToolTip content="Enable/disable is not yet wired to the backend API">
                    <EuiButton size="s" isDisabled>
                      {monitor.enabled === false ? 'Enable Monitor' : 'Disable Monitor'}
                    </EuiButton>
                  </EuiToolTip>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlyoutFooter>
      </EuiFlyout>

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <DeleteModal
          title={`Delete "${monitor.name}"?`}
          message="This will remove the monitor from the current view."
          onCancel={() => setShowDeleteConfirm(false)}
          onConfirm={() => {
            onDelete(monitor.id);
            setShowDeleteConfirm(false);
            onClose();
          }}
        />
      )}
    </>
  );
};

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Monitor Detail Flyout — comprehensive view of a single monitor's
 * configuration, behavior, and impact with quick actions.
 */
import React, { useState } from 'react';
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
  EuiCallOut,
  EuiCodeBlock,
  EuiLoadingContent,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { FormattedMessage } from '@osd/i18n/react';
import {
  AlertHistoryEntry,
  NotificationRouting,
  OSMonitor,
  OSMonitorInput,
  UnifiedAlertSeverity,
  UnifiedRuleSummary,
} from '../../../common/types/alerting';
import { DeleteModal } from '../common/helpers/delete_modal';
import { useMonitorDetail } from './hooks/use_monitor_detail';
import { ConditionPreviewGraph } from './monitor_detail/condition_preview_graph';
import { humanizeCondition } from './monitor_detail/humanize_condition';

import { SEVERITY_COLORS, STATE_COLORS, STATUS_COLORS, HEALTH_COLORS } from './shared_constants';

// Per-table caps for the detail flyout. `EuiBasicTable` doesn't paginate by
// default; without these caps a monitor that has accumulated thousands of
// historical alerts would render every row, freezing the flyout. The Alerts
// tab is the right place to drill into the full history — the flyout's
// table is intentionally a quick overview.
const MAX_ALERT_HISTORY_ROWS = 50;
const MAX_ROUTING_ROWS = 50;

// ============================================================================
// Props
// ============================================================================

export interface MonitorDetailFlyoutProps {
  monitor: UnifiedRuleSummary;
  onClose: () => void;
  onDelete: (id: string) => void;
  onClone: (monitor: UnifiedRuleSummary) => void;
  /**
   * Optional Edit handler. When omitted, the Edit button is hidden — keeps
   * the flyout usable in contexts (e.g. AI wizard summary) that don't host
   * an edit flyout.
   */
  onEdit?: (monitor: UnifiedRuleSummary) => void;
}

// ============================================================================
// Main Component
// ============================================================================

export const MonitorDetailFlyout: React.FC<MonitorDetailFlyoutProps> = ({
  monitor,
  onClose,
  onDelete,
  onClone,
  onEdit,
}) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const { detail, isLoading: detailLoading, error: detailError } = useMonitorDetail({
    dsId: monitor.datasourceId,
    ruleId: monitor.id,
  });

  // Use detail data when available, fall back to summary props.
  // `detail` has the full shape; `monitor` is only a summary, so
  // detail-only fields are empty until the fetch resolves.
  const alertHistory = detail?.alertHistory ?? [];
  const conditionPreviewData = detail?.conditionPreviewData ?? [];
  const notificationRouting = detail?.notificationRouting ?? [];
  const suppressionRules = detail?.suppressionRules ?? [];
  const description = detail?.description ?? '';
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
      name: i18n.translate('observability.alerting.monitorDetailFlyout.history.time', {
        defaultMessage: 'Time',
      }),
      width: '180px',
      render: (ts: string) => new Date(ts).toLocaleString(),
    },
    {
      field: 'state',
      name: i18n.translate('observability.alerting.monitorDetailFlyout.history.state', {
        defaultMessage: 'State',
      }),
      render: (s: string) => <EuiHealth color={STATE_COLORS[s] || 'subdued'}>{s}</EuiHealth>,
    },
    {
      field: 'value',
      name: i18n.translate('observability.alerting.monitorDetailFlyout.history.value', {
        defaultMessage: 'Value',
      }),
      width: '80px',
    },
    {
      field: 'message',
      name: i18n.translate('observability.alerting.monitorDetailFlyout.history.message', {
        defaultMessage: 'Message',
      }),
      truncateText: true,
    },
  ];

  // Notification routing columns
  const routingColumns: Array<EuiBasicTableColumn<NotificationRouting>> = [
    {
      field: 'channel',
      name: i18n.translate('observability.alerting.monitorDetailFlyout.routing.channel', {
        defaultMessage: 'Channel',
      }),
      width: '100px',
    },
    {
      field: 'destination',
      name: i18n.translate('observability.alerting.monitorDetailFlyout.routing.destination', {
        defaultMessage: 'Destination',
      }),
    },
    {
      field: 'severity',
      name: i18n.translate('observability.alerting.monitorDetailFlyout.routing.severities', {
        defaultMessage: 'Severities',
      }),
      width: '160px',
      render: (sevs: UnifiedAlertSeverity[] | undefined) =>
        sevs
          ? sevs.map((s) => (
              <EuiBadge key={s} color={SEVERITY_COLORS[s]}>
                {s}
              </EuiBadge>
            ))
          : i18n.translate('observability.alerting.monitorDetailFlyout.routing.allSeverities', {
              defaultMessage: 'All',
            }),
    },
    {
      field: 'throttle',
      name: i18n.translate('observability.alerting.monitorDetailFlyout.routing.throttle', {
        defaultMessage: 'Throttle',
      }),
      width: '100px',
      render: (t: string) => t || '—',
    },
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
              {onEdit && monitor.monitorType === 'ppl' ? (
                <EuiButtonEmpty
                  size="s"
                  iconType="pencil"
                  onClick={() => onEdit(monitor)}
                  data-test-subj="alertManagerMonitorDetailEdit"
                >
                  <FormattedMessage
                    id="observability.alerting.monitorDetailFlyout.editButton"
                    defaultMessage="Edit"
                  />
                </EuiButtonEmpty>
              ) : (
                <EuiToolTip
                  content={i18n.translate(
                    'observability.alerting.monitorDetailFlyout.editTooltip',
                    {
                      defaultMessage: 'Editing is only supported for PPL monitors',
                    }
                  )}
                >
                  <EuiButtonEmpty size="s" iconType="pencil" isDisabled>
                    <FormattedMessage
                      id="observability.alerting.monitorDetailFlyout.editButton"
                      defaultMessage="Edit"
                    />
                  </EuiButtonEmpty>
                </EuiToolTip>
              )}
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty size="s" iconType="copy" onClick={() => onClone(monitor)}>
                <FormattedMessage
                  id="observability.alerting.monitorDetailFlyout.cloneButton"
                  defaultMessage="Clone"
                />
              </EuiButtonEmpty>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty
                size="s"
                iconType="trash"
                color="danger"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <FormattedMessage
                  id="observability.alerting.monitorDetailFlyout.deleteButton"
                  defaultMessage="Delete"
                />
              </EuiButtonEmpty>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlyoutHeader>

        <EuiFlyoutBody>
          {detailLoading ? (
            <EuiLoadingContent lines={10} />
          ) : (
            <>
              {detailError && (
                <>
                  <EuiCallOut
                    size="s"
                    color="warning"
                    iconType="alert"
                    title={i18n.translate(
                      'observability.alerting.monitorDetailFlyout.detailLoadError.title',
                      {
                        defaultMessage: 'Some monitor details could not be loaded',
                      }
                    )}
                    data-test-subj="alertManagerMonitorDetailLoadError"
                  >
                    <p>
                      <FormattedMessage
                        id="observability.alerting.monitorDetailFlyout.detailLoadError.body"
                        defaultMessage="Showing summary information only. Try reopening the flyout to retry."
                      />
                    </p>
                  </EuiCallOut>
                  <EuiSpacer size="m" />
                </>
              )}
              {/* Description */}
              <EuiText size="s">
                <p>{description}</p>
              </EuiText>
              <EuiSpacer size="m" />

              {/* Query Definition — type-aware rendering */}
              <EuiAccordion
                id={`queryDef-${monitor.id}`}
                buttonContent={
                  <strong>
                    {monitorKind === 'cluster_metrics'
                      ? i18n.translate(
                          'observability.alerting.monitorDetailFlyout.queryDef.clusterApi',
                          {
                            defaultMessage: 'Cluster API Configuration',
                          }
                        )
                      : monitorKind === 'doc'
                      ? i18n.translate(
                          'observability.alerting.monitorDetailFlyout.queryDef.docLevel',
                          {
                            defaultMessage: 'Document-Level Queries',
                          }
                        )
                      : i18n.translate(
                          'observability.alerting.monitorDetailFlyout.queryDef.queryDefinition',
                          {
                            defaultMessage: 'Query Definition',
                          }
                        )}
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
                        {
                          title: i18n.translate(
                            'observability.alerting.monitorDetailFlyout.cluster.apiType',
                            { defaultMessage: 'API Type' }
                          ),
                          description: rawInput.uri.api_type,
                        },
                        {
                          title: i18n.translate(
                            'observability.alerting.monitorDetailFlyout.cluster.path',
                            { defaultMessage: 'Path' }
                          ),
                          description: rawInput.uri.path || '—',
                        },
                        {
                          title: i18n.translate(
                            'observability.alerting.monitorDetailFlyout.cluster.pathParams',
                            { defaultMessage: 'Path Params' }
                          ),
                          description: rawInput.uri.path_params || '—',
                        },
                        {
                          title: i18n.translate(
                            'observability.alerting.monitorDetailFlyout.cluster.url',
                            { defaultMessage: 'URL' }
                          ),
                          description: rawInput.uri.url || '—',
                        },
                        {
                          title: i18n.translate(
                            'observability.alerting.monitorDetailFlyout.cluster.clusters',
                            { defaultMessage: 'Clusters' }
                          ),
                          description:
                            rawInput.uri.clusters?.join(', ') ||
                            i18n.translate(
                              'observability.alerting.monitorDetailFlyout.cluster.localCluster',
                              { defaultMessage: 'Local cluster' }
                            ),
                        },
                      ]}
                    />
                  </>
                ) : monitorKind === 'doc' && rawInput && 'doc_level_input' in rawInput ? (
                  <>
                    <EuiText size="s">
                      <strong>
                        <FormattedMessage
                          id="observability.alerting.monitorDetailFlyout.targetIndices"
                          defaultMessage="Target indices:"
                        />
                      </strong>{' '}
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
                        <em>
                          <FormattedMessage
                            id="observability.alerting.monitorDetailFlyout.bucketLevelDescription"
                            defaultMessage="Bucket-level monitor — triggers evaluate per aggregation bucket"
                          />
                        </em>
                      </EuiText>
                    )}
                  </>
                )}
                {monitor.condition && (
                  <>
                    <EuiSpacer size="s" />
                    <EuiText size="xs" color="subdued">
                      <FormattedMessage
                        id="observability.alerting.monitorDetailFlyout.conditionPrefix"
                        defaultMessage="Condition: {condition}"
                        values={{ condition: humanizeCondition(monitor.condition) }}
                      />
                    </EuiText>
                  </>
                )}
              </EuiAccordion>

              <EuiSpacer size="m" />

              {/* Conditions & Thresholds */}
              <EuiAccordion
                id={`conditions-${monitor.id}`}
                buttonContent={
                  <strong>
                    <FormattedMessage
                      id="observability.alerting.monitorDetailFlyout.conditionsHeader"
                      defaultMessage="Conditions & Evaluation"
                    />
                  </strong>
                }
                initialIsOpen={true}
                paddingSize="m"
              >
                <EuiDescriptionList
                  type="column"
                  compressed
                  listItems={[
                    {
                      title: i18n.translate(
                        'observability.alerting.monitorDetailFlyout.evaluationInterval',
                        { defaultMessage: 'Evaluation Interval' }
                      ),
                      description: evaluationInterval,
                    },
                    {
                      title: i18n.translate(
                        'observability.alerting.monitorDetailFlyout.pendingPeriod',
                        { defaultMessage: 'Pending Period' }
                      ),
                      description: pendingPeriod,
                    },
                    ...(detail?.firingPeriod
                      ? [
                          {
                            title: i18n.translate(
                              'observability.alerting.monitorDetailFlyout.firingPeriod',
                              { defaultMessage: 'Firing Period' }
                            ),
                            description: detail.firingPeriod,
                          },
                        ]
                      : []),
                    ...(detail?.lookbackPeriod
                      ? [
                          {
                            title: i18n.translate(
                              'observability.alerting.monitorDetailFlyout.lookbackPeriod',
                              { defaultMessage: 'Lookback Period' }
                            ),
                            description: detail.lookbackPeriod,
                          },
                        ]
                      : []),
                    ...(monitor.threshold
                      ? [
                          {
                            title: i18n.translate(
                              'observability.alerting.monitorDetailFlyout.threshold',
                              { defaultMessage: 'Threshold' }
                            ),
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
                buttonContent={
                  <strong>
                    <FormattedMessage
                      id="observability.alerting.monitorDetailFlyout.labelsHeader"
                      defaultMessage="Labels"
                    />
                  </strong>
                }
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
                          <FormattedMessage
                            id="observability.alerting.monitorDetailFlyout.notConfigured"
                            defaultMessage="Not configured"
                          />
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
                buttonContent={
                  <strong>
                    <FormattedMessage
                      id="observability.alerting.monitorDetailFlyout.conditionPreviewHeader"
                      defaultMessage="Condition Preview"
                    />
                  </strong>
                }
                initialIsOpen={true}
                paddingSize="m"
              >
                <ConditionPreviewGraph data={conditionPreviewData} threshold={monitor.threshold} />
              </EuiAccordion>

              <EuiSpacer size="m" />

              {/* Alert History */}
              <EuiAccordion
                id={`alertHistory-${monitor.id}`}
                buttonContent={
                  <strong>
                    <FormattedMessage
                      id="observability.alerting.monitorDetailFlyout.recentAlertHistoryHeader"
                      defaultMessage="Recent Alert History ({count})"
                      values={{ count: alertHistory.length }}
                    />
                  </strong>
                }
                initialIsOpen={false}
                paddingSize="m"
              >
                <EuiBasicTable
                  items={alertHistory.slice(0, MAX_ALERT_HISTORY_ROWS)}
                  columns={historyColumns}
                  compressed
                />
                {alertHistory.length > MAX_ALERT_HISTORY_ROWS && (
                  <EuiText size="xs" color="subdued">
                    <FormattedMessage
                      id="observability.alerting.monitorDetailFlyout.alertHistoryTruncated"
                      defaultMessage="Showing the {shown} most recent of {total} alerts. Use the Alerts tab to filter by time."
                      values={{
                        shown: MAX_ALERT_HISTORY_ROWS,
                        total: alertHistory.length,
                      }}
                    />
                  </EuiText>
                )}
              </EuiAccordion>

              <EuiSpacer size="m" />

              {/* Notification Routing */}
              <EuiAccordion
                id={`routing-${monitor.id}`}
                buttonContent={
                  <strong>
                    <FormattedMessage
                      id="observability.alerting.monitorDetailFlyout.notificationRoutingHeader"
                      defaultMessage="Notification Routing ({count})"
                      values={{ count: notificationRouting.length }}
                    />
                  </strong>
                }
                initialIsOpen={false}
                paddingSize="m"
              >
                {notificationRouting.length > 0 ? (
                  <EuiBasicTable
                    items={notificationRouting.slice(0, MAX_ROUTING_ROWS)}
                    columns={routingColumns}
                    compressed
                  />
                ) : (
                  <EuiText size="s" color="subdued">
                    <FormattedMessage
                      id="observability.alerting.monitorDetailFlyout.noRouting"
                      defaultMessage="No notification routing configured"
                    />
                  </EuiText>
                )}
              </EuiAccordion>

              <EuiSpacer size="m" />

              {/* Suppression Rules */}
              <EuiAccordion
                id={`suppression-${monitor.id}`}
                buttonContent={
                  <strong>
                    <FormattedMessage
                      id="observability.alerting.monitorDetailFlyout.suppressionRulesHeader"
                      defaultMessage="Suppression Rules ({count})"
                      values={{ count: suppressionRules.length }}
                    />
                  </strong>
                }
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
                          {sr.schedule && (
                            <EuiText size="xs">
                              <FormattedMessage
                                id="observability.alerting.monitorDetailFlyout.scheduleLabel"
                                defaultMessage="Schedule: {schedule}"
                                values={{ schedule: sr.schedule }}
                              />
                            </EuiText>
                          )}
                        </EuiFlexItem>
                        <EuiFlexItem grow={false}>
                          <EuiBadge color={sr.active ? 'success' : 'default'}>
                            {sr.active
                              ? i18n.translate(
                                  'observability.alerting.monitorDetailFlyout.suppressionActive',
                                  { defaultMessage: 'Active' }
                                )
                              : i18n.translate(
                                  'observability.alerting.monitorDetailFlyout.suppressionInactive',
                                  { defaultMessage: 'Inactive' }
                                )}
                          </EuiBadge>
                        </EuiFlexItem>
                      </EuiFlexGroup>
                    </EuiPanel>
                  ))
                ) : (
                  <EuiText size="s" color="subdued">
                    <FormattedMessage
                      id="observability.alerting.monitorDetailFlyout.noSuppression"
                      defaultMessage="No suppression rules applied"
                    />
                  </EuiText>
                )}
              </EuiAccordion>

              <EuiSpacer size="m" />

              {/* Creation / Modification History */}
              <EuiAccordion
                id={`history-${monitor.id}`}
                buttonContent={
                  <strong>
                    <FormattedMessage
                      id="observability.alerting.monitorDetailFlyout.historyHeader"
                      defaultMessage="History"
                    />
                  </strong>
                }
                initialIsOpen={false}
                paddingSize="m"
              >
                <EuiDescriptionList
                  type="column"
                  compressed
                  listItems={[
                    {
                      title: i18n.translate(
                        'observability.alerting.monitorDetailFlyout.history.createdBy',
                        { defaultMessage: 'Created By' }
                      ),
                      description: monitor.createdBy,
                    },
                    {
                      title: i18n.translate(
                        'observability.alerting.monitorDetailFlyout.history.createdAt',
                        { defaultMessage: 'Created At' }
                      ),
                      description: new Date(monitor.createdAt).toLocaleString(),
                    },
                    {
                      title: i18n.translate(
                        'observability.alerting.monitorDetailFlyout.history.lastModified',
                        { defaultMessage: 'Last Modified' }
                      ),
                      description: new Date(monitor.lastModified).toLocaleString(),
                    },
                    {
                      title: i18n.translate(
                        'observability.alerting.monitorDetailFlyout.history.lastTriggered',
                        { defaultMessage: 'Last Triggered' }
                      ),
                      description: monitor.lastTriggered
                        ? new Date(monitor.lastTriggered).toLocaleString()
                        : '—',
                    },
                    {
                      title: i18n.translate(
                        'observability.alerting.monitorDetailFlyout.history.backend',
                        { defaultMessage: 'Backend' }
                      ),
                      description: monitor.datasourceType,
                    },
                    {
                      title: i18n.translate(
                        'observability.alerting.monitorDetailFlyout.history.datasourceId',
                        { defaultMessage: 'Datasource ID' }
                      ),
                      description: monitor.datasourceId,
                    },
                  ]}
                />
              </EuiAccordion>
            </>
          )}
        </EuiFlyoutBody>

        <EuiFlyoutFooter>
          <EuiFlexGroup justifyContent="spaceBetween" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty onClick={onClose}>
                <FormattedMessage
                  id="observability.alerting.monitorDetailFlyout.closeButton"
                  defaultMessage="Close"
                />
              </EuiButtonEmpty>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiFlexGroup gutterSize="s" responsive={false}>
                <EuiFlexItem grow={false}>
                  <EuiToolTip
                    content={i18n.translate(
                      'observability.alerting.monitorDetailFlyout.enableDisableTooltip',
                      {
                        defaultMessage: 'Enable/disable is not yet wired to the backend API',
                      }
                    )}
                  >
                    <EuiButton size="s" isDisabled>
                      {monitor.enabled === false
                        ? i18n.translate(
                            'observability.alerting.monitorDetailFlyout.enableMonitor',
                            { defaultMessage: 'Enable Monitor' }
                          )
                        : i18n.translate(
                            'observability.alerting.monitorDetailFlyout.disableMonitor',
                            { defaultMessage: 'Disable Monitor' }
                          )}
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
          title={i18n.translate('observability.alerting.monitorDetailFlyout.deleteModalTitle', {
            defaultMessage: 'Delete "{name}"?',
            values: { name: monitor.name },
          })}
          message={i18n.translate('observability.alerting.monitorDetailFlyout.deleteModalMessage', {
            defaultMessage: 'This will remove the monitor from the current view.',
          })}
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

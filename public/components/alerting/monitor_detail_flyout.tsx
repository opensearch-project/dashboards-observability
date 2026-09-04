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
  EuiCode,
  EuiCodeBlock,
  EuiConfirmModal,
  EuiLink,
  EuiLoadingContent,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { FormattedMessage } from '@osd/i18n/react';
import {
  AlertHistoryEntry,
  OSMonitor,
  OSMonitorInput,
  UnifiedRuleSummary,
} from '../../../common/types/alerting';
import { DeleteModal } from '../common/helpers/delete_modal';
import { useMonitorDetail } from './hooks/use_monitor_detail';
import { ConditionPreviewGraph } from './monitor_detail/condition_preview_graph';
import { humanizeCondition } from './monitor_detail/humanize_condition';
import { normalizeDuration } from './utils/duration';
import { observabilityAlertingID } from '../../../common/constants/shared';
import { coreRefs } from '../../framework/core_refs';
import { isPending } from './monitors_table/pending_rules';

import { SEVERITY_COLORS, STATE_COLORS, STATUS_COLORS, HEALTH_COLORS } from './shared_constants';

// Cap for the alert-history table in the flyout. `EuiBasicTable` doesn't
// paginate by default; without this cap a monitor that has accumulated
// thousands of historical alerts would render every row, freezing the
// flyout. The Alerts tab is the right place to drill into the full history.
const MAX_ALERT_HISTORY_ROWS = 50;

// Classic alerting app that hosts the full monitor editor. Its `monitors`
// browser app mounts the `/monitors` hash route, so a deep link of the form
// `#/monitors/{id}?action=edit-monitor&monitorType={type}` opens the classic
// edit form directly. Used as the escape hatch for OpenSearch monitor types
// this flyout can't yet edit in place.
const CLASSIC_MONITORS_APP_ID = 'monitors';

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
  /**
   * Optional Disable / Enable handler. The page wires this only for PPL
   * monitors, which is the surface where {@link onEdit} is also wired —
   * the underlying transport (`PUT /monitors/{id}`) and trigger payload
   * stripping are the same. Non-PPL monitor types stay disabled with an
   * explanatory tooltip until their edit path is implemented.
   */
  onToggleEnabled?: (monitor: UnifiedRuleSummary) => Promise<void> | void;
}

/**
 * Collect the `terms.field` values from a bucket-level monitor's aggregation
 * tree — both `composite.sources[].<name>.terms.field` and plain `terms` aggs —
 * so the flyout can show the group-by dimensions. Best-effort + defensive: any
 * unexpected shape simply yields fewer fields, never a throw.
 */
function extractGroupByFields(aggregations: unknown): string[] {
  const fields: string[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;
    const terms = obj.terms as { field?: unknown } | undefined;
    if (terms && typeof terms.field === 'string') fields.push(terms.field);
    Object.values(obj).forEach((v) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') walk(v);
    });
  };
  walk(aggregations);
  return Array.from(new Set(fields));
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
  onToggleEnabled,
}) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showEditRedirectConfirm, setShowEditRedirectConfirm] = useState(false);
  const [isTogglingEnabled, setIsTogglingEnabled] = useState(false);
  // Optimistic rows we injected while the querier catches up carry a synthetic
  // `new-` id the backend doesn't know yet, so every mutating action (edit,
  // clone, delete, enable/disable) would 404 — gate them all off until the
  // rule confirms.
  const pending = isPending(monitor);
  const pendingActionTooltip = i18n.translate(
    'observability.alerting.monitorDetailFlyout.pendingActionTooltip',
    {
      defaultMessage:
        'This rule is still being confirmed by the querier. Actions are available once it appears in the list.',
    }
  );
  // Mirror the Edit-button gate (PPL only). Non-PPL types stay read-only;
  // the existing tooltip surfaces explains the limitation.
  // Prometheus rules cannot be disabled via the OS Alerting API.
  const canToggleEnabled =
    !pending &&
    !!onToggleEnabled &&
    monitor.datasourceType !== 'prometheus' &&
    (monitor.monitorType === 'ppl' || monitor.monitorType === 'metric');
  const detailState = useMonitorDetail({
    dsId: monitor.datasourceId,
    ruleId: monitor.id,
    definitionType: monitor.definitionType || 'monitor',
    // A pending optimistic row carries a synthetic `new-` id the backend can't
    // resolve — skip the detail fetch so it doesn't 404 on every open; the
    // flyout falls back to the summary props until the rule confirms.
    enabled: !pending,
  });
  const { detail, isLoading: detailLoading, error: detailError } = detailState;

  // Use detail data when available, fall back to summary props.
  // `detail` has the full shape; `monitor` is only a summary, so
  // detail-only fields are empty until the fetch resolves.
  const alertHistory = detail?.alertHistory ?? [];
  const conditionPreviewData = detail?.conditionPreviewData ?? [];
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
  const isComposite = monitorKind === 'composite';
  // Ordered member-monitor ids for composite (workflow) monitors, carried on
  // the summary because the workflow detail can't be fetched via the monitors
  // endpoint.
  const compositeDelegates = (monitor.labels?.composite_delegates ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  // Composite (workflow) monitors can't be safely cloned/deleted through the
  // monitor APIs used here, so those actions are gated with this explanation.
  const compositeActionTooltip = i18n.translate(
    'observability.alerting.monitorDetailFlyout.compositeActionTooltip',
    { defaultMessage: 'Composite monitors are managed in the classic Alerting app.' }
  );
  const rawMonitor = detail?.raw as OSMonitor | undefined;
  const rawInput: OSMonitorInput | undefined =
    rawMonitor && 'inputs' in rawMonitor ? rawMonitor.inputs?.[0] : undefined;
  const isBucket = monitorKind === 'bucket';
  // Group-by fields for a bucket-level monitor — pulled from the aggregation's
  // `terms.field`s (composite sources or plain terms aggs) so the flyout can
  // show what the buckets are grouped on rather than only the raw query JSON.
  const bucketGroupByFields =
    isBucket && rawInput && 'search' in rawInput
      ? extractGroupByFields((rawInput.search.query as Record<string, unknown>)?.aggregations)
      : [];
  // When the detail fetch fails for a structured kind (cluster-metrics / doc /
  // bucket), the summary `query` is an abbreviated non-JSON string; show a
  // plain "unavailable" note instead of rendering it as malformed JSON.
  const detailUnavailableForStructuredKind =
    !!detailError && (monitorKind === 'cluster_metrics' || monitorKind === 'doc' || isBucket);

  // Edit affordance routing. PPL and Prometheus ('metric') rules edit in
  // place via `onEdit`. Every other OpenSearch monitor type (bucket / doc /
  // cluster-metrics / query-level log & apm) isn't yet editable in this
  // flyout, so rather than disable Edit we send the user to the classic
  // alerting app after a heads-up confirmation.
  const canEditInPlace =
    !pending && !!onEdit && (monitor.monitorType === 'ppl' || monitor.monitorType === 'metric');
  // Only OpenSearch monitors have a real `_id` + monitor_type the classic
  // editor understands; detectors/forecasters/Prometheus rules do not.
  const isOpenSearchMonitor =
    (monitor.definitionType ?? 'monitor') === 'monitor' && monitor.datasourceType === 'opensearch';
  const canRedirectToClassicEdit = !pending && !canEditInPlace && isOpenSearchMonitor;
  // The classic `monitorType` param is advisory (the classic app re-derives
  // the form from the fetched monitor body), but we send the best value we
  // have. Cluster-metrics monitors are stored as `query_level_monitor` and
  // are only distinguishable via `monitor_kind`, so special-case them.
  const classicMonitorType =
    monitorKind === 'cluster_metrics'
      ? 'cluster_metrics_monitor'
      : ((monitor.labels?.monitor_type as string | undefined) ??
        rawMonitor?.monitor_type ??
        'query_level_monitor');

  const goToClassicEdit = () => {
    // The classic app resolves its data source from the URL's `dataSourceId`
    // param when multi-data-source is enabled. If the param is ABSENT it never
    // sets the data source (cold deep-link → "DataSource was not set" +
    // DataSourceView crash), so we always include it. For MDS OpenSearch
    // monitors the registry `datasourceId` IS the data-source saved-object id
    // (id === mdsId), so it maps straight through; the local-cluster sentinel
    // maps to an empty value, which the classic app treats as the local
    // cluster. When MDS is disabled the classic app ignores the param.
    const localSentinels = ['local-cluster', 'local', ''];
    const dataSourceIdParam = localSentinels.includes(monitor.datasourceId)
      ? ''
      : monitor.datasourceId;
    // navigateToApp resolves the basepath/workspace prefix (bare hash hrefs
    // don't) — matches the routing deep-link pattern used elsewhere here.
    // Encode the interpolated values so a reserved char (&, #, =, space) in any
    // of them can't be parsed as URL structure. In practice all three are
    // URL-safe (system `_id`, backend enum, saved-object id), so this is
    // defensive hardening rather than a behavior change.
    const id = encodeURIComponent(monitor.id);
    const monitorTypeParam = encodeURIComponent(classicMonitorType);
    const dsParam = encodeURIComponent(dataSourceIdParam);
    coreRefs?.application?.navigateToApp(CLASSIC_MONITORS_APP_ID, {
      path: `#/monitors/${id}?action=edit-monitor&monitorType=${monitorTypeParam}&dataSourceId=${dsParam}`,
    });
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  };

  // Query definition accordion title, type-aware
  let queryDefTitle: string;
  if (monitorKind === 'cluster_metrics') {
    queryDefTitle = i18n.translate(
      'observability.alerting.monitorDetailFlyout.queryDef.clusterApi',
      {
        defaultMessage: 'Cluster API Configuration',
      }
    );
  } else if (monitorKind === 'doc') {
    queryDefTitle = i18n.translate('observability.alerting.monitorDetailFlyout.queryDef.docLevel', {
      defaultMessage: 'Document-Level Queries',
    });
  } else if (monitorKind === 'composite') {
    queryDefTitle = i18n.translate(
      'observability.alerting.monitorDetailFlyout.queryDef.composite',
      { defaultMessage: 'Associated monitors' }
    );
  } else {
    queryDefTitle = i18n.translate(
      'observability.alerting.monitorDetailFlyout.queryDef.queryDefinition',
      { defaultMessage: 'Query Definition' }
    );
  }

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
              {canEditInPlace ? (
                <EuiButtonEmpty
                  size="s"
                  iconType="pencil"
                  onClick={() => onEdit?.(monitor)}
                  data-test-subj="alertManagerMonitorDetailEdit"
                >
                  <FormattedMessage
                    id="observability.alerting.monitorDetailFlyout.editButton"
                    defaultMessage="Edit"
                  />
                </EuiButtonEmpty>
              ) : canRedirectToClassicEdit ? (
                <EuiToolTip
                  content={i18n.translate(
                    'observability.alerting.monitorDetailFlyout.editRedirectTooltip',
                    {
                      defaultMessage:
                        'This rule type is edited in the classic experience. You’ll be redirected there.',
                    }
                  )}
                >
                  <EuiButtonEmpty
                    size="s"
                    iconType="pencil"
                    onClick={() => setShowEditRedirectConfirm(true)}
                    data-test-subj="alertManagerMonitorDetailEditRedirect"
                  >
                    <FormattedMessage
                      id="observability.alerting.monitorDetailFlyout.editButton"
                      defaultMessage="Edit"
                    />
                  </EuiButtonEmpty>
                </EuiToolTip>
              ) : (
                <EuiToolTip
                  content={
                    pending
                      ? pendingActionTooltip
                      : i18n.translate('observability.alerting.monitorDetailFlyout.editTooltip', {
                          defaultMessage: 'Editing is only supported for PPL alert rules',
                        })
                  }
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
              {isComposite || pending ? (
                <EuiToolTip content={pending ? pendingActionTooltip : compositeActionTooltip}>
                  <EuiButtonEmpty size="s" iconType="copy" isDisabled>
                    <FormattedMessage
                      id="observability.alerting.monitorDetailFlyout.cloneButton"
                      defaultMessage="Clone"
                    />
                  </EuiButtonEmpty>
                </EuiToolTip>
              ) : (
                <EuiButtonEmpty size="s" iconType="copy" onClick={() => onClone(monitor)}>
                  <FormattedMessage
                    id="observability.alerting.monitorDetailFlyout.cloneButton"
                    defaultMessage="Clone"
                  />
                </EuiButtonEmpty>
              )}
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              {isComposite || pending ? (
                <EuiToolTip content={pending ? pendingActionTooltip : compositeActionTooltip}>
                  <EuiButtonEmpty size="s" iconType="trash" color="danger" isDisabled>
                    <FormattedMessage
                      id="observability.alerting.monitorDetailFlyout.deleteButton"
                      defaultMessage="Delete"
                    />
                  </EuiButtonEmpty>
                </EuiToolTip>
              ) : (
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
              )}
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlyoutHeader>

        <EuiFlyoutBody>
          {detailLoading ? (
            <EuiLoadingContent lines={10} />
          ) : (
            <>
              {/* Composite (workflow) detail always 404s on the monitors
                  endpoint — that's expected, not an error — so skip the banner
                  and just render the summary-derived details cleanly. */}
              {detailError && !isComposite && (
                <>
                  <EuiCallOut
                    size="s"
                    color="warning"
                    iconType="alert"
                    title={i18n.translate(
                      'observability.alerting.monitorDetailFlyout.detailLoadError.title',
                      {
                        defaultMessage: 'Some rule details could not be loaded',
                      }
                    )}
                    data-test-subj="alertManagerMonitorDetailLoadError"
                  >
                    <p>
                      <FormattedMessage
                        id="observability.alerting.monitorDetailFlyout.detailLoadError.body"
                        defaultMessage="Showing summary information only — the full configuration is unavailable for this rule."
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
                buttonContent={<strong>{queryDefTitle}</strong>}
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
                ) : isComposite ? (
                  <>
                    <EuiText size="s">
                      <FormattedMessage
                        id="observability.alerting.monitorDetailFlyout.composite.description"
                        defaultMessage="This composite monitor triggers based on the alerts of its member monitors, evaluated in order:"
                      />
                    </EuiText>
                    <EuiSpacer size="s" />
                    {compositeDelegates.length > 0 ? (
                      <ol style={{ paddingLeft: 20, margin: 0 }}>
                        {compositeDelegates.map((mid, idx) => (
                          <li key={mid || idx} style={{ marginBottom: 4 }}>
                            <EuiCode>{mid}</EuiCode>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <EuiText size="s" color="subdued">
                        <FormattedMessage
                          id="observability.alerting.monitorDetailFlyout.composite.noMembers"
                          defaultMessage="No member monitors are configured."
                        />
                      </EuiText>
                    )}
                  </>
                ) : isBucket && rawInput && 'search' in rawInput ? (
                  <>
                    <EuiText size="s">
                      <strong>
                        <FormattedMessage
                          id="observability.alerting.monitorDetailFlyout.targetIndices"
                          defaultMessage="Target indices:"
                        />
                      </strong>{' '}
                      {rawInput.search.indices?.join(', ') || '—'}
                    </EuiText>
                    <EuiSpacer size="s" />
                    <EuiText size="s">
                      <strong>
                        <FormattedMessage
                          id="observability.alerting.monitorDetailFlyout.bucket.groupBy"
                          defaultMessage="Group by"
                        />
                      </strong>
                    </EuiText>
                    {bucketGroupByFields.length > 0 ? (
                      <EuiFlexGroup gutterSize="xs" wrap responsive={false}>
                        {bucketGroupByFields.map((f) => (
                          <EuiFlexItem grow={false} key={f}>
                            <EuiBadge color="hollow">{f}</EuiBadge>
                          </EuiFlexItem>
                        ))}
                      </EuiFlexGroup>
                    ) : (
                      <EuiText size="s" color="subdued">
                        —
                      </EuiText>
                    )}
                    {monitor.condition && (
                      <>
                        <EuiSpacer size="s" />
                        <EuiText size="s">
                          <strong>
                            <FormattedMessage
                              id="observability.alerting.monitorDetailFlyout.bucket.condition"
                              defaultMessage="Per-bucket condition"
                            />
                          </strong>
                        </EuiText>
                        <EuiCodeBlock fontSize="s" paddingSize="s" isCopyable>
                          {monitor.condition}
                        </EuiCodeBlock>
                      </>
                    )}
                    <EuiSpacer size="s" />
                    <EuiAccordion
                      id={`bucketQuery-${monitor.id}`}
                      buttonContent={
                        <EuiText size="xs">
                          <FormattedMessage
                            id="observability.alerting.monitorDetailFlyout.bucket.showQuery"
                            defaultMessage="Show aggregation query"
                          />
                        </EuiText>
                      }
                      paddingSize="s"
                    >
                      <EuiCodeBlock language="json" fontSize="s" paddingSize="m" isCopyable>
                        {queryDisplay}
                      </EuiCodeBlock>
                    </EuiAccordion>
                  </>
                ) : detailUnavailableForStructuredKind ? (
                  <EuiText size="s" color="subdued">
                    <FormattedMessage
                      id="observability.alerting.monitorDetailFlyout.detailUnavailable"
                      defaultMessage="Detailed configuration is unavailable for this rule."
                    />
                  </EuiText>
                ) : (
                  <EuiCodeBlock language={queryLang} fontSize="s" paddingSize="m" isCopyable>
                    {queryDisplay}
                  </EuiCodeBlock>
                )}
                {/* Prometheus rules: the expr above IS the condition — the
                    summary `condition` field is a canned template, so hide it */}
                {monitor.condition && monitor.datasourceType !== 'prometheus' && (
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
                    ...(monitor.datasourceType !== 'prometheus'
                      ? [
                          {
                            title: i18n.translate(
                              'observability.alerting.monitorDetailFlyout.evaluationInterval',
                              { defaultMessage: 'Evaluation Interval' }
                            ),
                            description: evaluationInterval,
                          },
                          // Pending period isn't a meaningful concept for a
                          // composite (it fires off member alerts, not a
                          // sustained threshold), so omit it there.
                          ...(!isComposite
                            ? [
                                {
                                  title: i18n.translate(
                                    'observability.alerting.monitorDetailFlyout.pendingPeriod',
                                    { defaultMessage: 'Pending Period' }
                                  ),
                                  description: pendingPeriod,
                                },
                              ]
                            : []),
                        ]
                      : []),
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
                    ...(monitor.threshold && monitor.datasourceType !== 'prometheus' && !isComposite
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
                    ...(monitor.datasourceType === 'prometheus'
                      ? [
                          {
                            title: i18n.translate(
                              'observability.alerting.monitorDetailFlyout.forDuration',
                              { defaultMessage: 'For Duration' }
                            ),
                            // pendingPeriod carries the rule's `for:` value
                            // ("300s") — normalize for display ("5m")
                            description: normalizeDuration(
                              monitor.pendingPeriod || monitor.threshold?.forDuration || '',
                              '—'
                            ),
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
                    'composite_delegates',
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

              {/* Condition Preview Graph — hidden for PPL monitors. The
                  server-side preview pipeline (`fetchOSPreviewTimeSeries`)
                  has no PPL branch: it routes by input shape and PPL
                  monitors carry a `ppl_input` that isn't covered, so the
                  data array would always be empty and the accordion would
                  permanently render the "No recent evaluation data" copy.
                  Skip rendering until a PPL preview pipeline ships. Also skip
                  for composites — a workflow has no single series to plot. */}
              {monitor.monitorType !== 'ppl' && !isComposite && (
                <>
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
                    <ConditionPreviewGraph
                      data={conditionPreviewData}
                      threshold={monitor.threshold}
                    />
                  </EuiAccordion>

                  <EuiSpacer size="m" />
                </>
              )}

              {/* Notification Routing — Prometheus only */}
              {monitor.datasourceType === 'prometheus' && (
                <>
                  <EuiAccordion
                    id={`notification-routing-${monitor.id}`}
                    buttonContent={
                      <strong>
                        <FormattedMessage
                          id="observability.alerting.monitorDetailFlyout.notificationRoutingHeader"
                          defaultMessage="Notification Routing"
                        />
                      </strong>
                    }
                    initialIsOpen={true}
                    paddingSize="m"
                  >
                    <EuiCallOut size="s" iconType="bell" color="primary">
                      <EuiText size="xs">
                        <p>
                          <FormattedMessage
                            id="observability.alerting.monitorDetailFlyout.notificationRoutingBody"
                            defaultMessage="Notifications for Prometheus alerts are managed through Alertmanager. The {labels} on this rule determine which receiver handles the alert based on the routing configuration."
                            values={{
                              labels: (
                                <strong>
                                  <FormattedMessage
                                    id="observability.alerting.monitorDetailFlyout.notificationRoutingLabels"
                                    defaultMessage="labels"
                                  />
                                </strong>
                              ),
                            }}
                          />
                        </p>
                        <p>
                          {/* navigateToApp resolves the basepath (bare hash
                              hrefs don't) — matches the toast_helpers deep-link
                              pattern */}
                          <EuiLink
                            onClick={() => {
                              coreRefs?.application?.navigateToApp(observabilityAlertingID, {
                                path: '#/routing',
                              });
                              window.dispatchEvent(new HashChangeEvent('hashchange'));
                            }}
                            data-test-subj="monitorDetailViewRoutingLink"
                          >
                            <FormattedMessage
                              id="observability.alerting.monitorDetailFlyout.viewRoutingLink"
                              defaultMessage="View notification routing →"
                            />
                          </EuiLink>
                        </p>
                      </EuiText>
                    </EuiCallOut>
                  </EuiAccordion>
                  <EuiSpacer size="m" />
                </>
              )}

              {/* Recent alerts (OS = mixed-state slice, Prom = currently firing/pending) */}
              <EuiAccordion
                id={`alertHistory-${monitor.id}`}
                buttonContent={
                  <strong>
                    {monitor.datasourceType === 'prometheus' ? (
                      <FormattedMessage
                        id="observability.alerting.monitorDetailFlyout.firingPendingAlertsHeader"
                        defaultMessage="Currently firing/pending alerts ({count})"
                        values={{ count: alertHistory.length }}
                      />
                    ) : (
                      <FormattedMessage
                        id="observability.alerting.monitorDetailFlyout.recentAlertsHeader"
                        defaultMessage="Recent alerts ({count})"
                        values={{ count: alertHistory.length }}
                      />
                    )}
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

              {/* Details — creation / modification metadata */}
              <EuiAccordion
                id={`details-${monitor.id}`}
                buttonContent={
                  <strong>
                    <FormattedMessage
                      id="observability.alerting.monitorDetailFlyout.detailsHeader"
                      defaultMessage="Details"
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
                  {monitor.datasourceType === 'prometheus' ? null : canToggleEnabled ? (
                    <EuiButton
                      size="s"
                      isLoading={isTogglingEnabled}
                      onClick={async () => {
                        if (!onToggleEnabled || isTogglingEnabled) return;
                        setIsTogglingEnabled(true);
                        try {
                          await onToggleEnabled(monitor);
                        } finally {
                          setIsTogglingEnabled(false);
                        }
                      }}
                      data-test-subj="alertManagerMonitorDetailToggleEnabled"
                    >
                      {monitor.enabled === false
                        ? i18n.translate(
                            'observability.alerting.monitorDetailFlyout.enableMonitor',
                            { defaultMessage: 'Enable rule' }
                          )
                        : i18n.translate(
                            'observability.alerting.monitorDetailFlyout.disableMonitor',
                            { defaultMessage: 'Disable rule' }
                          )}
                    </EuiButton>
                  ) : (
                    <EuiToolTip
                      content={
                        pending
                          ? pendingActionTooltip
                          : i18n.translate(
                              'observability.alerting.monitorDetailFlyout.enableDisableTooltip',
                              {
                                defaultMessage:
                                  'Enable/disable is only supported for PPL alert rules.',
                              }
                            )
                      }
                    >
                      <EuiButton size="s" isDisabled>
                        {monitor.enabled === false
                          ? i18n.translate(
                              'observability.alerting.monitorDetailFlyout.enableMonitor',
                              { defaultMessage: 'Enable rule' }
                            )
                          : i18n.translate(
                              'observability.alerting.monitorDetailFlyout.disableMonitor',
                              { defaultMessage: 'Disable rule' }
                            )}
                      </EuiButton>
                    </EuiToolTip>
                  )}
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
            defaultMessage: 'This will remove the rule from the current view.',
          })}
          onCancel={() => setShowDeleteConfirm(false)}
          onConfirm={() => {
            onDelete(monitor.id);
            setShowDeleteConfirm(false);
            onClose();
          }}
        />
      )}

      {/* Redirect-to-classic-editor confirmation. Non-PPL/non-metric
          OpenSearch monitor types aren't editable in this flyout yet, so we
          warn the user before navigating them to the classic alerting app. */}
      {showEditRedirectConfirm && (
        // EuiConfirmModal renders its own EuiOverlayMask, so no wrapping mask
        // (wrapping double-dims the backdrop).
        <EuiConfirmModal
          title={i18n.translate(
            'observability.alerting.monitorDetailFlyout.editRedirectModalTitle',
            {
              defaultMessage: 'Edit in the classic experience?',
            }
          )}
          onCancel={() => setShowEditRedirectConfirm(false)}
          onConfirm={() => {
            setShowEditRedirectConfirm(false);
            goToClassicEdit();
          }}
          cancelButtonText={i18n.translate(
            'observability.alerting.monitorDetailFlyout.editRedirectModalCancel',
            { defaultMessage: 'Cancel' }
          )}
          confirmButtonText={i18n.translate(
            'observability.alerting.monitorDetailFlyout.editRedirectModalConfirm',
            { defaultMessage: 'Continue to classic experience' }
          )}
          buttonColor="primary"
          defaultFocusedButton="confirm"
          data-test-subj="alertManagerMonitorDetailEditRedirectModal"
        >
          <EuiText size="s">
            <p>
              <FormattedMessage
                id="observability.alerting.monitorDetailFlyout.editRedirectModalBody"
                defaultMessage="This rule type can’t be edited in the new experience yet. You’ll be taken to the classic alerting app to edit {name}."
                values={{ name: <strong>{monitor.name}</strong> }}
              />
            </p>
          </EuiText>
        </EuiConfirmModal>
      )}
    </>
  );
};

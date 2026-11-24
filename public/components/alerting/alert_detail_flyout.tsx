/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Alert Detail Flyout — drill-down view for a single alert
 * showing full context, labels, annotations, and actions.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  EuiFlyout,
  EuiFlyoutHeader,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiTitle,
  EuiText,
  EuiSpacer,
  EuiBadge,
  EuiFlexGroup,
  EuiFlexItem,
  EuiButton,
  EuiButtonEmpty,
  EuiDescriptionList,
  EuiAccordion,
  EuiCallOut,
  EuiCodeBlock,
  EuiLink,
  EuiLoadingContent,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { FormattedMessage } from '@osd/i18n/react';
import { UnifiedAlert, UnifiedAlertSummary, Datasource } from '../../../common/types/alerting';
import { observabilityApmSloID } from '../../../common/constants/apm';
import { coreRefs } from '../../framework/core_refs';
import { AnomalyDetailContent } from './anomaly_detail_flyout';
import { AlertingOpenSearchService } from './query_services/alerting_opensearch_service';
import { LinkifyAnnotation } from './linkify_annotation';
import { canAcknowledgeAlert, formatDatasourceType, STATE_COLORS } from './shared_constants';
import { EMPTY_VALUE, getNativeAlertStateLabel, isBreachStatus } from './enum_labels';
import { NativeStatus } from './native_status';
import { SeverityTag } from './severity_tag';
import { DatasourceTag } from './datasource_tag';
import { formatTimestamp } from './time_format';

/** Internal label keys filtered from the Labels accordion display. */
const INTERNAL_LABEL_KEYS = new Set([
  'monitor_id',
  'datasource_id',
  '_workspace',
  'monitor_type',
  'monitor_kind',
  'trigger_id',
  'trigger_name',
  'datasource_type',
]);

/**
 * Whether the rule behind an alert is in the loaded rules list. `unknown` when
 * the page can't tell — the list is still loading, failed, or was truncated
 * for the alert's datasource, or the alert has no monitor id.
 */
export type SourceRuleStatus = 'exists' | 'missing' | 'unknown';

export interface AlertDetailFlyoutProps {
  alert: UnifiedAlertSummary;
  datasources: Datasource[];
  allAlerts?: UnifiedAlertSummary[];
  sourceRuleStatus?: SourceRuleStatus;
  onClose: () => void;
  onAcknowledge: (alertId: string) => void;
}

/**
 * Where a Rule or SLO row goes: a hash path, plus the OSD app id when the
 * target is in another app (the SLO detail page) rather than the alerting app.
 */
interface SourceLink {
  path: string;
  appId?: string;
}

export const AlertDetailFlyout: React.FC<AlertDetailFlyoutProps> = ({
  alert,
  datasources,
  allAlerts = [],
  sourceRuleStatus = 'unknown',
  onClose,
  onAcknowledge,
}) => {
  const osService = useMemo(() => new AlertingOpenSearchService(), []);
  const [detailData, setDetailData] = useState<UnifiedAlert | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailFetched, setDetailFetched] = useState(false);

  // Mirror the current alert identity into a ref so an in-flight fetch
  // can compare its captured-at-call-time identity against the latest
  // mounted alert when the response resolves. Updated synchronously by
  // the reset effect below before the response could possibly land.
  const alertIdRef = useRef({ dsId: alert.datasourceId, id: alert.id });

  // Reset detail when the alert identity changes — guards against a parent
  // swapping `selectedAlert` from A to B without unmounting the flyout
  // (which would otherwise render B's summary on top of A's `raw`/labels).
  // Updates `alertIdRef` first so any still-in-flight fetch from A bails
  // in its `.then()`/`.finally()` instead of writing into B's state.
  useEffect(() => {
    alertIdRef.current = { dsId: alert.datasourceId, id: alert.id };
    setDetailData(null);
    setDetailLoading(false);
    setDetailFetched(false);
  }, [alert.datasourceId, alert.id]);

  // Detail (raw alert data) is fetched only when the user expands the
  // Raw Alert Data accordion. Opening the flyout fires zero network
  // calls; the visible accordions render from the summary on hand.
  // The Prom path returns null upstream (no per-alert API), so skip the
  // round-trip entirely — the summary already has labels/annotations.
  // `detailFetched` pins the cache even when the upstream resolves with
  // `null` (e.g. alert no longer present), so collapse → re-expand does
  // not refire the request.
  //
  // Identity guard: capture `(datasourceId, alertId)` at call time and
  // gate every state write on a match against the current alert. If the
  // parent swaps `selectedAlert` mid-fetch, the in-flight response would
  // otherwise write A's payload into B's `detailData` and pin
  // `detailFetched=true` for B without ever fetching B.
  const fetchDetailIfNeeded = useCallback(() => {
    if (alert.datasourceType === 'prometheus') return;
    if (detailFetched || detailLoading) return;
    const requestDsId = alert.datasourceId;
    const requestAlertId = alert.id;
    setDetailLoading(true);
    osService
      .getAlertDetail(alert.datasourceId, alert.id, alert.monitorId)
      .then((data: UnifiedAlert) => {
        if (alertIdRef.current.dsId !== requestDsId || alertIdRef.current.id !== requestAlertId) {
          return;
        }
        if (data) setDetailData(data);
      })
      .catch((err: unknown) => {
        console.error('Failed to load alert details:', err);
      })
      .finally(() => {
        if (alertIdRef.current.dsId !== requestDsId || alertIdRef.current.id !== requestAlertId) {
          return;
        }
        setDetailLoading(false);
        setDetailFetched(true);
      });
  }, [
    alert.datasourceId,
    alert.datasourceType,
    alert.id,
    alert.monitorId,
    detailFetched,
    detailLoading,
    osService,
  ]);

  // Merge detail data over summary — detail has `raw` and potentially richer labels.
  // The linked anomaly is assembled by the list API, so preserve it if a lazy
  // per-alert detail response does not carry that UI-only relationship.
  const alertData = detailData
    ? { ...alert, ...detailData, relatedAnomaly: detailData.relatedAnomaly ?? alert.relatedAnomaly }
    : alert;

  const ds = datasources.find((d) => d.id === alert.datasourceId);
  // Memoize so `allLabels` keeps a stable reference between renders when
  // `alertData.labels` is unchanged \u2014 the `useMemo` for `sourceLink`
  // below depends on it, and a fresh `{}` from the `||` fallback would
  // otherwise re-run the dep-list check every render.
  const allLabels = useMemo(() => alertData.labels || {}, [alertData.labels]);

  // Rule deep-link (BUG-14 / OBS1). The unified alert shape doesn't
  // carry a typed pointer to its rule; we derive one from the labels
  // available per-backend:
  //   - OpenSearch alerts: `labels.monitor_id` is reliably populated. Match
  //     on `monitor_id:<id>` so the Rules tab's `matchesSearch` narrows to
  //     the originating monitor (rules carry the same id).
  //   - Prometheus alerts: no `monitor_*` label exists; the closest stable
  //     handle is `labels.alertname` (Prom convention) which equals the
  //     rule's `name`. Match by name.
  // Falls back to undefined when no usable handle exists, in which case the
  // Rule row is not rendered. Rules deep-links include the backing datasource
  // id (`ds=…`) so the Rules tab DS filter auto-selects the right cluster on
  // landing (BUG-12). The SLO of a burn-rate alert is its own row (`sloLink`
  // below), so an SLO alert links to both.
  const ruleLink = useMemo<SourceLink | undefined>(() => {
    const dsId = alert.datasourceId;
    if (!dsId) return undefined;
    const labels = (allLabels as Record<string, string>) ?? {};
    if (alert.datasourceType === 'opensearch') {
      const monitorId = labels.monitor_id;
      if (!monitorId) return undefined;
      const params = new URLSearchParams({ q: `monitor_id:${monitorId}`, ds: dsId });
      return { path: `#/rules?${params.toString()}` };
    }
    if (alert.datasourceType === 'prometheus') {
      const alertname = labels.alertname;
      if (!alertname) return undefined;
      const params = new URLSearchParams({ q: alertname, ds: dsId });
      return { path: `#/rules?${params.toString()}` };
    }
    return undefined;
  }, [alert.datasourceId, alert.datasourceType, allLabels]);

  const labelRecord = allLabels as Record<string, string>;
  // SLO burn-rate alerts (either backend) carry `slo_id`. The SLO row opens the
  // SLO *detail* page, which lives in the separate SLO app
  // (`observabilityApmSloID`), at `#/slos/<id>` (the SLO listing/detail
  // deep-link convention).
  const sloId = labelRecord?.slo_id;
  const sloLink = useMemo<SourceLink | undefined>(
    () =>
      sloId
        ? { path: `#/slos/${encodeURIComponent(sloId)}`, appId: observabilityApmSloID }
        : undefined,
    [sloId]
  );
  const sloDisplayName = sloId ? (labelRecord?.slo_name ?? sloId) : undefined;
  // The Rule row names the rule: the monitor's own name (OpenSearch), then the
  // Prometheus `alertname`, then the raw `monitor_id`. `ruleLink` only exists
  // when `monitor_id` or `alertname` is present, so this resolves to a string.
  const ruleDisplayName =
    labelRecord?.monitor_name ?? labelRecord?.alertname ?? labelRecord?.monitor_id;

  // An alert can outlive its rule: OpenSearch keeps an alert whose monitor or
  // trigger was deleted (state `deleted`), and an old alert can point at a
  // monitor that's gone. Opening the rule would land on an empty Rules tab, so
  // say what happened instead and drop the link when the monitor is gone.
  const monitorMissing = sourceRuleStatus === 'missing';
  const deletedNotice = (() => {
    const monitorName = labelRecord?.monitor_name ?? labelRecord?.monitor_id;
    if (monitorMissing) {
      return {
        title: i18n.translate('observability.alerting.alertDetailFlyout.monitorDeletedTitle', {
          defaultMessage: 'The monitor for this alert no longer exists',
        }),
        body: i18n.translate('observability.alerting.alertDetailFlyout.monitorDeletedBody', {
          defaultMessage:
            'The monitor "{monitorName}" was deleted, so there is no rule to open and this alert can\'t be acknowledged. The alert is kept for history.',
          values: { monitorName: monitorName ?? EMPTY_VALUE },
        }),
      };
    }
    if (alert.state !== 'deleted') return undefined;
    if (sourceRuleStatus === 'exists') {
      return {
        title: i18n.translate('observability.alerting.alertDetailFlyout.triggerDeletedTitle', {
          defaultMessage: 'The trigger for this alert was deleted',
        }),
        body: i18n.translate('observability.alerting.alertDetailFlyout.triggerDeletedBody', {
          defaultMessage:
            'The trigger "{triggerName}" was removed from the monitor "{monitorName}", so this alert no longer fires and can\'t be acknowledged. The monitor still exists.',
          values: {
            triggerName: labelRecord?.trigger_name ?? EMPTY_VALUE,
            monitorName: monitorName ?? EMPTY_VALUE,
          },
        }),
      };
    }
    return {
      title: i18n.translate('observability.alerting.alertDetailFlyout.ruleDeletedTitle', {
        defaultMessage: 'The rule for this alert was deleted',
      }),
      body: i18n.translate('observability.alerting.alertDetailFlyout.ruleDeletedBody', {
        defaultMessage:
          "The monitor or trigger that created this alert was deleted while the alert was open, so it no longer fires and can't be acknowledged. The alert is kept for history.",
      }),
    };
  })();
  const openableRuleLink = monitorMissing ? undefined : ruleLink;

  const navigateToSource = (openableSourceLink: SourceLink | undefined) => {
    if (!openableSourceLink) return;
    onClose();
    if (openableSourceLink.appId) {
      // Cross-app navigation: the SLO detail page lives in a different OSD
      // application than the alerting app, so go through
      // `application.navigateToApp` to switch apps (workspace-aware), then
      // fire a synthetic hashchange for the target app's HashRouter to pick
      // up the route \u2014 navigateToApp uses pushState, which does not emit
      // hashchange on its own. Chain the dispatch off the returned promise so
      // it fires after the target app has mounted, not while the source app's
      // router is still active (dispatching synchronously races both routers).
      Promise.resolve(
        coreRefs?.application?.navigateToApp(openableSourceLink.appId, {
          path: openableSourceLink.path,
        })
      ).then(() => window.dispatchEvent(new HashChangeEvent('hashchange')));
      return;
    }
    // Same-app navigation: directly update the hash and dispatch a synthetic
    // hashchange event so the AlarmsPage listener picks it up. Setting
    // window.location.hash alone doesn't fire the event when called
    // programmatically from within the same page.
    window.location.hash = openableSourceLink.path;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  };

  // Filter out internal/system labels for display (fix S-m2/6)
  const labels = Object.fromEntries(
    Object.entries(allLabels).filter(([k]) => !INTERNAL_LABEL_KEYS.has(k))
  );
  const annotations = alertData.annotations || {};
  // An OpenSearch alert in Error state carries the monitor's error (often a long exception) as
  // its message. It is shown once, in a danger callout in the body, not as the header line.
  const osErrorMessage =
    alert.datasourceType === 'opensearch' && alert.state === 'error' ? alert.message : undefined;
  const relatedAnomaly = alertData.relatedAnomaly;
  const anomalyContext = useMemo(() => {
    if (!relatedAnomaly) return [];
    const context = new Map<string, UnifiedAlertSummary>();
    context.set(relatedAnomaly.id, relatedAnomaly);
    allAlerts.forEach((candidateAlert) => {
      context.set(candidateAlert.id, candidateAlert);
      if (candidateAlert.relatedAnomaly) {
        context.set(candidateAlert.relatedAnomaly.id, candidateAlert.relatedAnomaly);
      }
    });
    return Array.from(context.values());
  }, [allAlerts, relatedAnomaly]);

  return (
    <EuiFlyout
      onClose={onClose}
      size={relatedAnomaly ? 'l' : 'm'}
      ownFocus
      aria-labelledby="alertDetailTitle"
    >
      <EuiFlyoutHeader hasBorder>
        {/* the name only in the title, the message once below it, then one row with
            Status, Severity and Data source in the table's order and style. Alert names can be
            long with no spaces (e.g. generated SLO rule names), so the title wraps anywhere.
            An OpenSearch alert's error shows as a callout in the body instead of the message. */}
        <EuiTitle size="m">
          <h2 id="alertDetailTitle" style={{ overflowWrap: 'anywhere' }}>
            {alert.name}
          </h2>
        </EuiTitle>
        <EuiSpacer size="xs" />
        {osErrorMessage ? null : alert.message || annotations.summary || annotations.description ? (
          <EuiText size="s" color="subdued">
            {alert.message || annotations.summary || annotations.description}
          </EuiText>
        ) : (
          <EuiText size="s" color="subdued">
            <FormattedMessage
              id="observability.alerting.alertDetailFlyout.notAvailable"
              defaultMessage="Not available"
            />
          </EuiText>
        )}
        <EuiSpacer size="s" />
        <EuiFlexGroup
          gutterSize="m"
          alignItems="flexStart"
          responsive={false}
          wrap
          data-test-subj="alertDetailHeaderRow"
        >
          <EuiFlexItem grow={false}>
            <NativeStatus
              label={getNativeAlertStateLabel(alert.datasourceType, alert.state)}
              color={STATE_COLORS[alert.state] || 'subdued'}
              breached={isBreachStatus('alert', alert.datasourceType, alert.state)}
              data-test-subj="alertDetailStatus"
            />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <SeverityTag severity={alert.severity} data-test-subj="alertDetailSeverity" />
          </EuiFlexItem>
          <EuiFlexItem grow={false} style={{ minWidth: 0 }}>
            <DatasourceTag
              ds={ds}
              cloudWatch={alert.cloudWatch}
              datasourceType={alert.datasourceType}
              data-test-subj="alertDetailDatasource"
            />
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutHeader>

      <EuiFlyoutBody>
        {osErrorMessage && (
          <>
            <EuiCallOut
              title={i18n.translate('observability.alerting.alertDetailFlyout.errorCalloutTitle', {
                defaultMessage: 'Error',
              })}
              color="danger"
              iconType="alert"
              size="s"
              data-test-subj="alertDetailErrorCallout"
            >
              <p
                style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}
                data-test-subj="alertDetailErrorMessage"
              >
                {osErrorMessage}
              </p>
            </EuiCallOut>
            <EuiSpacer size="m" />
          </>
        )}
        {deletedNotice && (
          <>
            <EuiCallOut
              title={deletedNotice.title}
              color="warning"
              iconType="alert"
              size="s"
              data-test-subj="alertDetailRuleDeletedCallout"
            >
              <p>{deletedNotice.body}</p>
            </EuiCallOut>
            <EuiSpacer size="m" />
          </>
        )}
        {/* Started, the Rule and SLO links, and the CloudWatch account. Status,
            Severity and Data source are in the header row, so they are not repeated here. */}
        <EuiDescriptionList
          type="column"
          compressed
          data-test-subj="alertDetailSummary"
          listItems={[
            {
              title: i18n.translate('observability.alerting.alertDetailFlyout.started', {
                defaultMessage: 'Started',
              }),
              // Zone-labelled so this reads identically to the Started column in
              // the alerts table; a bare `toLocaleString()` hides which zone it
              // rendered in, so two readers see different "start" times.
              description: formatTimestamp(alert.startTime),
            },
            ...(ruleLink
              ? [
                  {
                    title: i18n.translate('observability.alerting.alertDetailFlyout.rule', {
                      defaultMessage: 'Rule',
                    }),
                    description: openableRuleLink ? (
                      <EuiLink
                        onClick={() => navigateToSource(openableRuleLink)}
                        data-test-subj="alertDetailSourceRuleLink"
                      >
                        {ruleDisplayName}
                      </EuiLink>
                    ) : (
                      <span data-test-subj="alertDetailSourceRuleDeleted">
                        {i18n.translate(
                          'observability.alerting.alertDetailFlyout.sourceRuleDeleted',
                          {
                            defaultMessage: '{name} (deleted)',
                            values: { name: ruleDisplayName },
                          }
                        )}
                      </span>
                    ),
                  },
                ]
              : []),
            ...(sloLink
              ? [
                  {
                    title: i18n.translate('observability.alerting.alertDetailFlyout.slo', {
                      defaultMessage: 'SLO',
                    }),
                    description: (
                      <EuiLink
                        onClick={() => navigateToSource(sloLink)}
                        data-test-subj="alertDetailSloLink"
                      >
                        {sloDisplayName}
                      </EuiLink>
                    ),
                  },
                ]
              : []),
            ...(alert.cloudWatch?.accountId
              ? [
                  {
                    title: i18n.translate('observability.alerting.alertDetailFlyout.account', {
                      defaultMessage: 'Account',
                    }),
                    description: alert.cloudWatch.accountId,
                  },
                ]
              : []),
          ]}
        />

        <EuiSpacer size="m" />

        <EuiAccordion
          id={`alertMoreDetails-${alert.id}`}
          data-test-subj="alertDetailMoreDetails"
          buttonContent={
            <strong>
              <FormattedMessage
                id="observability.alerting.alertDetailFlyout.moreDetails"
                defaultMessage="More details"
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
                title: i18n.translate('observability.alerting.alertDetailFlyout.alertId', {
                  defaultMessage: 'Alert ID',
                }),
                description: alert.id || EMPTY_VALUE,
              },
              {
                title: i18n.translate('observability.alerting.alertDetailFlyout.backend', {
                  defaultMessage: 'Backend',
                }),
                description: alert.datasourceType
                  ? formatDatasourceType(alert.datasourceType)
                  : EMPTY_VALUE,
              },
              {
                title: i18n.translate('observability.alerting.alertDetailFlyout.lastUpdated', {
                  defaultMessage: 'Last Updated',
                }),
                description: formatTimestamp(alert.lastUpdated),
              },
              {
                title: i18n.translate('observability.alerting.alertDetailFlyout.duration', {
                  defaultMessage: 'Duration',
                }),
                description: getAlertDuration(alert),
              },
              {
                title: i18n.translate('observability.alerting.alertDetailFlyout.datasourceId', {
                  defaultMessage: 'Data source ID',
                }),
                description: alert.datasourceId || EMPTY_VALUE,
              },
            ]}
          />
        </EuiAccordion>

        <EuiSpacer size="m" />

        {relatedAnomaly && (
          <>
            <EuiAccordion
              id={`alertRelatedAnomaly-${alert.id}`}
              buttonContent={
                <strong>
                  <FormattedMessage
                    id="observability.alerting.alertDetailFlyout.relatedAnomalyHeader"
                    defaultMessage="Associated anomaly"
                  />
                </strong>
              }
              initialIsOpen={true}
              paddingSize="m"
            >
              <AnomalyDetailContent
                anomaly={relatedAnomaly}
                datasources={datasources}
                allAlerts={anomalyContext}
              />
            </EuiAccordion>

            <EuiSpacer size="m" />
          </>
        )}

        {/* Labels (internal keys filtered — see INTERNAL_LABEL_KEYS) */}
        <EuiAccordion
          id={`alertLabels-${alert.id}`}
          buttonContent={
            <strong>
              <FormattedMessage
                id="observability.alerting.alertDetailFlyout.labelsHeader"
                defaultMessage="Labels ({count})"
                values={{ count: Object.keys(labels).length }}
              />
            </strong>
          }
          initialIsOpen={true}
          paddingSize="m"
        >
          {Object.keys(labels).length > 0 ? (
            <EuiFlexGroup gutterSize="xs" wrap responsive={false}>
              {Object.entries(labels).map(([k, v]) => (
                <EuiFlexItem grow={false} key={k}>
                  <EuiBadge color="hollow">
                    {k}: {v || '\u2014'}
                  </EuiBadge>
                </EuiFlexItem>
              ))}
            </EuiFlexGroup>
          ) : (
            <EuiText size="s" color="subdued">
              <FormattedMessage
                id="observability.alerting.alertDetailFlyout.labelsNotAvailable"
                defaultMessage="Not available"
              />
            </EuiText>
          )}
        </EuiAccordion>

        <EuiSpacer size="m" />

        {/* Annotations */}
        <EuiAccordion
          id={`alertAnnotations-${alert.id}`}
          buttonContent={
            <strong>
              <FormattedMessage
                id="observability.alerting.alertDetailFlyout.annotationsHeader"
                defaultMessage="Annotations ({count})"
                values={{ count: Object.keys(annotations).length }}
              />
            </strong>
          }
          initialIsOpen={true}
          paddingSize="m"
        >
          {Object.keys(annotations).length > 0 ? (
            <EuiDescriptionList
              type="column"
              compressed
              listItems={Object.entries(annotations).map(([k, v]) => ({
                title: k,
                // Annotations often hold runbook URLs \u2014 render them clickable
                // (safe http/https only) instead of plain text (SRE2).
                description: <LinkifyAnnotation value={v} />,
              }))}
            />
          ) : (
            <EuiText size="s" color="subdued">
              <FormattedMessage
                id="observability.alerting.alertDetailFlyout.annotationsNotAvailable"
                defaultMessage="Not available"
              />
            </EuiText>
          )}
        </EuiAccordion>

        <EuiSpacer size="m" />

        {/* Raw Data — fetched lazily on accordion expand. */}
        <EuiAccordion
          id={`alertRaw-${alert.id}`}
          buttonContent={
            <strong>
              <FormattedMessage
                id="observability.alerting.alertDetailFlyout.rawAlertData"
                defaultMessage="Raw Alert Data"
              />
            </strong>
          }
          initialIsOpen={false}
          paddingSize="m"
          onToggle={(isOpen) => {
            if (isOpen) fetchDetailIfNeeded();
          }}
        >
          {detailLoading ? (
            <EuiLoadingContent lines={6} />
          ) : (
            <EuiCodeBlock language="json" fontSize="s" paddingSize="m" isCopyable>
              {JSON.stringify(detailData?.raw ?? alert, null, 2)}
            </EuiCodeBlock>
          )}
        </EuiAccordion>
      </EuiFlyoutBody>

      <EuiFlyoutFooter>
        <EuiFlexGroup justifyContent="spaceBetween" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty onClick={onClose}>
              <FormattedMessage
                id="observability.alerting.alertDetailFlyout.closeButton"
                defaultMessage="Close"
              />
            </EuiButtonEmpty>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiFlexGroup gutterSize="s" responsive={false}>
              {/* Acknowledge: only OpenSearch alerting alerts have an acknowledge API */}
              {/* The callout says an alert whose monitor is gone can't be acknowledged — keep the button in line with it. */}
              {canAcknowledgeAlert(alert) && !monitorMissing && (
                <EuiFlexItem grow={false}>
                  <EuiButton fill size="s" iconType="check" onClick={() => onAcknowledge(alert.id)}>
                    <FormattedMessage
                      id="observability.alerting.alertDetailFlyout.acknowledgeButton"
                      defaultMessage="Acknowledge"
                    />
                  </EuiButton>
                </EuiFlexItem>
              )}
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutFooter>
    </EuiFlyout>
  );
};

// ============================================================================
// Helpers
// ============================================================================

/**
 * Firing alerts: start to now (matches the list's "Started … ago"). Resolved
 * alerts: start to when they resolved (`lastUpdated`), so the value stops
 * growing once the alert is over.
 */
function getAlertDuration(alert: {
  startTime: string;
  lastUpdated?: string;
  state?: string;
}): string {
  const { startTime } = alert;
  if (!startTime) return '—';
  const start = new Date(startTime).getTime();
  let end = Date.now();
  if (alert.state === 'resolved') {
    // `lastUpdated` is the resolve time for Prometheus episodes and close to it
    // (last notification) for OpenSearch monitors. Alarm-backed rows set it to
    // the same state-change timestamp as `startTime`, so there's no end to
    // measure to: show no duration rather than "0m".
    const resolved = alert.lastUpdated ? new Date(alert.lastUpdated).getTime() : NaN;
    if (!Number.isFinite(resolved) || resolved <= start) return '—';
    end = resolved;
  }
  const ms = Math.max(0, end - start);
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

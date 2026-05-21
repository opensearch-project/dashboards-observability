/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Alert Detail Flyout — drill-down view for a single alert
 * showing full context, labels, annotations, and actions.
 */
import React, { useCallback, useMemo, useState } from 'react';
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
  EuiDescriptionList,
  EuiAccordion,
  EuiCodeBlock,
  EuiLoadingContent,
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { FormattedMessage } from '@osd/i18n/react';
import { UnifiedAlert, UnifiedAlertSummary, Datasource } from '../../../common/types/alerting';
import { AlertingOpenSearchService } from './query_services/alerting_opensearch_service';
import { SEVERITY_COLORS, STATE_COLORS } from './shared_constants';

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

export interface AlertDetailFlyoutProps {
  alert: UnifiedAlertSummary;
  datasources: Datasource[];
  onClose: () => void;
  onAcknowledge: (alertId: string) => void;
}

export const AlertDetailFlyout: React.FC<AlertDetailFlyoutProps> = ({
  alert,
  datasources,
  onClose,
  onAcknowledge,
}) => {
  const osService = useMemo(() => new AlertingOpenSearchService(), []);
  const [detailData, setDetailData] = useState<UnifiedAlert | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Detail (raw alert data) is fetched only when the user expands the
  // Raw Alert Data accordion. Opening the flyout fires zero network
  // calls; the visible accordions render from the summary on hand.
  // The Prom path returns null upstream (no per-alert API), so skip the
  // round-trip entirely — the summary already has labels/annotations.
  const fetchDetailIfNeeded = useCallback(() => {
    if (alert.datasourceType === 'prometheus') return;
    if (detailData || detailLoading) return;
    setDetailLoading(true);
    osService
      .getAlertDetail(alert.datasourceId, alert.id, alert.monitorId)
      .then((data: UnifiedAlert) => {
        if (data) setDetailData(data);
      })
      .catch((err: unknown) => {
        console.error('Failed to load alert details:', err);
      })
      .finally(() => setDetailLoading(false));
  }, [
    alert.datasourceId,
    alert.datasourceType,
    alert.id,
    alert.monitorId,
    detailData,
    detailLoading,
    osService,
  ]);

  // Merge detail data over summary — detail has `raw` and potentially richer labels
  const alertData = detailData ? { ...alert, ...detailData } : alert;

  const dsName =
    datasources.find((d) => d.id === alert.datasourceId)?.name || alert.datasourceId || '\u2014';
  const allLabels = alertData.labels || {};
  // Filter out internal/system labels for display (fix S-m2/6)
  const labels = Object.fromEntries(
    Object.entries(allLabels).filter(([k]) => !INTERNAL_LABEL_KEYS.has(k))
  );
  const annotations = alertData.annotations || {};

  return (
    <EuiFlyout onClose={onClose} size="m" ownFocus aria-labelledby="alertDetailTitle">
      <EuiFlyoutHeader hasBorder>
        <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" responsive={false}>
          <EuiFlexItem>
            <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiTitle size="m">
                  <h2 id="alertDetailTitle">{alert.name}</h2>
                </EuiTitle>
              </EuiFlexItem>
              {/* S-m8: Datasource type badge for visual distinction */}
              <EuiFlexItem grow={false}>
                <EuiBadge color={alert.datasourceType === 'opensearch' ? 'primary' : 'accent'}>
                  {alert.datasourceType === 'opensearch' ? 'OpenSearch' : 'Prometheus'}
                </EuiBadge>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiFlexGroup gutterSize="xs" responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiHealth color={STATE_COLORS[alert.state]}>{alert.state}</EuiHealth>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiBadge color={SEVERITY_COLORS[alert.severity]}>{alert.severity}</EuiBadge>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer size="s" />
        {alert.message || annotations.summary || annotations.description ? (
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
      </EuiFlyoutHeader>

      <EuiFlyoutBody>
        {/* Alert Details */}
        <EuiAccordion
          id={`alertDetails-${alert.id}`}
          buttonContent={
            <strong>
              <FormattedMessage
                id="observability.alerting.alertDetailFlyout.alertDetails"
                defaultMessage="Alert Details"
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
                title: i18n.translate('observability.alerting.alertDetailFlyout.alertId', {
                  defaultMessage: 'Alert ID',
                }),
                description: alert.id || '\u2014',
              },
              {
                title: i18n.translate('observability.alerting.alertDetailFlyout.state', {
                  defaultMessage: 'State',
                }),
                description: alert.state || '\u2014',
              },
              {
                title: i18n.translate('observability.alerting.alertDetailFlyout.severity', {
                  defaultMessage: 'Severity',
                }),
                description: alert.severity || '\u2014',
              },
              {
                title: i18n.translate('observability.alerting.alertDetailFlyout.backend', {
                  defaultMessage: 'Backend',
                }),
                description: alert.datasourceType || '\u2014',
              },
              {
                title: i18n.translate('observability.alerting.alertDetailFlyout.datasource', {
                  defaultMessage: 'Datasource',
                }),
                description: dsName,
              },
              {
                title: i18n.translate('observability.alerting.alertDetailFlyout.started', {
                  defaultMessage: 'Started',
                }),
                description: alert.startTime
                  ? new Date(alert.startTime).toLocaleString()
                  : '\u2014',
              },
              {
                title: i18n.translate('observability.alerting.alertDetailFlyout.lastUpdated', {
                  defaultMessage: 'Last Updated',
                }),
                description: alert.lastUpdated
                  ? new Date(alert.lastUpdated).toLocaleString()
                  : '\u2014',
              },
              {
                title: i18n.translate('observability.alerting.alertDetailFlyout.duration', {
                  defaultMessage: 'Duration',
                }),
                description: getAlertDuration(alert.startTime),
              },
            ]}
          />
        </EuiAccordion>

        <EuiSpacer size="m" />

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
                description: v || '\u2014',
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
              {/* S-C4: Hide Acknowledge for Prometheus alerts — not supported */}
              {alert.state === 'active' && alert.datasourceType !== 'prometheus' && (
                <EuiFlexItem grow={false}>
                  <EuiButton fill size="s" iconType="check" onClick={() => onAcknowledge(alert.id)}>
                    <FormattedMessage
                      id="observability.alerting.alertDetailFlyout.acknowledgeButton"
                      defaultMessage="Acknowledge"
                    />
                  </EuiButton>
                </EuiFlexItem>
              )}
              {alert.state === 'active' && alert.datasourceType === 'prometheus' && (
                <EuiFlexItem grow={false}>
                  <EuiToolTip
                    content={i18n.translate(
                      'observability.alerting.alertDetailFlyout.acknowledgeNotSupportedTooltip',
                      {
                        defaultMessage: 'Acknowledgement not supported for Prometheus alerts',
                      }
                    )}
                  >
                    <EuiButton fill size="s" iconType="check" isDisabled>
                      <FormattedMessage
                        id="observability.alerting.alertDetailFlyout.acknowledgeDisabledButton"
                        defaultMessage="Acknowledge"
                      />
                    </EuiButton>
                  </EuiToolTip>
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

function getAlertDuration(startTime: string): string {
  if (!startTime) return '—';
  const ms = Date.now() - new Date(startTime).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

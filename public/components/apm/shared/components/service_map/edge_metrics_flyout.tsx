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
  EuiIcon,
  EuiLoadingSpinner,
  EuiAccordion,
} from '@elastic/eui';
import { HealthDonut, HEALTH_DONUT_COLORS } from '@osd/apm-topology';
import { EdgeMetrics, SelectedEdgeState } from '../../../common/types/service_map_types';
import { APPLICATION_MAP_CONSTANTS, APM_CONSTANTS } from '../../../common/constants';
import { applicationMapI18nTexts as i18nTexts } from '../../../pages/application_map/application_map_i18n';
import { formatCount, formatLatency as formatLatencyUtil } from '../../../common/format_utils';

export interface EdgeMetricsFlyoutProps {
  /** Selected edge state */
  selectedEdge: SelectedEdgeState;
  /** Edge metrics (null while loading) */
  metrics: EdgeMetrics | null;
  /** Whether metrics are currently loading */
  isLoading: boolean;
  /** Callback to close the flyout */
  onClose: () => void;
}

const colorSwatchStyle = (color: string): React.CSSProperties => ({
  display: 'inline-block',
  width: 12,
  height: 12,
  borderRadius: 2,
  backgroundColor: color,
});

/**
 * Flyout component displaying metrics for a selected service-to-service connection
 *
 * Shows:
 * - Header: "sourceService -> targetService"
 * - Health accordion: HealthDonut with colored metric labels and P99 Latency
 */
export const EdgeMetricsFlyout: React.FC<EdgeMetricsFlyoutProps> = ({
  selectedEdge,
  metrics,
  isLoading,
  onClose,
}) => {
  const requestCount = metrics?.requestCount ?? 0;
  const faultCount = metrics?.faultCount ?? 0;
  const errorCount = metrics?.errorCount ?? 0;

  return (
    <EuiFlyout
      size="s"
      type="push"
      paddingSize="m"
      ownFocus={false}
      onClose={onClose}
      aria-labelledby="edgeMetricsFlyoutTitle"
    >
      <EuiFlyoutHeader hasBorder style={{ paddingRight: 40 }}>
        <EuiTitle size="s">
          <h2 id="edgeMetricsFlyoutTitle">
            <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
              <EuiFlexItem grow={false}>
                <span>{selectedEdge.sourceService}</span>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiIcon type="sortRight" />
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <span>{selectedEdge.targetService}</span>
              </EuiFlexItem>
            </EuiFlexGroup>
          </h2>
        </EuiTitle>
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
              id="edgeHealthAccordion"
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
                      requests: requestCount,
                      faults5xx: faultCount,
                      errors4xx: errorCount,
                    }}
                    size={APPLICATION_MAP_CONSTANTS.HEALTH_DONUT_SIZE}
                    isLegendEnabled={false}
                  />
                </EuiFlexItem>
                <EuiFlexItem>
                  <EuiFlexGroup direction="column" gutterSize="xs">
                    <EuiFlexItem>
                      <EuiFlexGroup alignItems="center" gutterSize="xs" responsive={false}>
                        <EuiFlexItem grow={false}>
                          <span style={colorSwatchStyle(HEALTH_DONUT_COLORS.ok2xx)} />
                        </EuiFlexItem>
                        <EuiFlexItem>
                          <EuiText size="xs">
                            <strong>{i18nTexts.detailsPanel.totalRequests}:</strong>{' '}
                            {metrics ? formatCount(requestCount) : '-'}
                          </EuiText>
                        </EuiFlexItem>
                      </EuiFlexGroup>
                    </EuiFlexItem>
                    <EuiFlexItem>
                      <EuiFlexGroup alignItems="center" gutterSize="xs" responsive={false}>
                        <EuiFlexItem grow={false}>
                          <span style={colorSwatchStyle(HEALTH_DONUT_COLORS.error4xx)} />
                        </EuiFlexItem>
                        <EuiFlexItem>
                          <EuiText size="xs">
                            <strong>{i18nTexts.detailsPanel.totalErrors}:</strong>{' '}
                            {metrics ? formatCount(errorCount) : '-'}
                          </EuiText>
                        </EuiFlexItem>
                      </EuiFlexGroup>
                    </EuiFlexItem>
                    <EuiFlexItem>
                      <EuiFlexGroup alignItems="center" gutterSize="xs" responsive={false}>
                        <EuiFlexItem grow={false}>
                          <span style={colorSwatchStyle(HEALTH_DONUT_COLORS.fault5xx)} />
                        </EuiFlexItem>
                        <EuiFlexItem>
                          <EuiText size="xs">
                            <strong>{i18nTexts.detailsPanel.totalFaults}:</strong>{' '}
                            {metrics ? formatCount(faultCount) : '-'}
                          </EuiText>
                        </EuiFlexItem>
                      </EuiFlexGroup>
                    </EuiFlexItem>
                    <EuiFlexItem>
                      <EuiFlexGroup alignItems="center" gutterSize="xs" responsive={false}>
                        <EuiFlexItem grow={false}>
                          <span style={colorSwatchStyle(APM_CONSTANTS.COLORS.LATENCY)} />
                        </EuiFlexItem>
                        <EuiFlexItem>
                          <EuiText size="xs">
                            <strong>{i18nTexts.edgeMetrics.latency}:</strong>{' '}
                            {metrics ? formatLatencyUtil(metrics.latencyP99) : '-'}
                          </EuiText>
                        </EuiFlexItem>
                      </EuiFlexGroup>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiAccordion>
          </>
        )}
      </EuiFlyoutBody>
    </EuiFlyout>
  );
};

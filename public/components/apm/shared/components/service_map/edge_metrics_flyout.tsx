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
  EuiSpacer,
  EuiLoadingSpinner,
  EuiHorizontalRule,
} from '@elastic/eui';
import { EdgeMetrics, SelectedEdgeState } from '../../../common/types/service_map_types';
import { applicationMapI18nTexts as i18nTexts } from '../../../pages/application_map/application_map_i18n';

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

/**
 * Flyout component displaying metrics for a selected service-to-service connection
 *
 * Shows:
 * - Header: "sourceService -> targetService"
 * - Metrics: Requests, P99 Latency, Faults (5xx), Errors (4xx)
 *
 * Can be closed via X button or clicking outside.
 */
export const EdgeMetricsFlyout: React.FC<EdgeMetricsFlyoutProps> = ({
  selectedEdge,
  metrics,
  isLoading,
  onClose,
}) => {
  return (
    <EuiFlyout ownFocus={false} onClose={onClose} size="s" aria-labelledby="edgeMetricsFlyoutTitle">
      <EuiFlyoutHeader hasBorder>
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
        {/* Metrics content */}
        {isLoading ? (
          <EuiFlexGroup justifyContent="center" alignItems="center" style={{ minHeight: 100 }}>
            <EuiFlexItem grow={false}>
              <EuiLoadingSpinner size="m" />
            </EuiFlexItem>
          </EuiFlexGroup>
        ) : (
          <div>
            <EuiText size="s" color="subdued">
              <h4>{i18nTexts.edgeMetrics.title}</h4>
            </EuiText>
            <EuiHorizontalRule margin="s" />

            {/* Requests */}
            <MetricRow
              label={i18nTexts.edgeMetrics.requests}
              value={formatNumber(metrics?.requestCount ?? 0)}
            />
            <EuiSpacer size="s" />

            {/* P99 Latency */}
            <MetricRow
              label={i18nTexts.edgeMetrics.latency}
              value={formatLatency(metrics?.latencyP99 ?? 0)}
            />
            <EuiSpacer size="s" />

            {/* Faults (5xx) */}
            <MetricRow
              label={i18nTexts.edgeMetrics.faults}
              value={formatNumber(metrics?.faultCount ?? 0)}
              isError={metrics?.faultCount ? metrics.faultCount > 0 : false}
            />
            <EuiSpacer size="s" />

            {/* Errors (4xx) */}
            <MetricRow
              label={i18nTexts.edgeMetrics.errors}
              value={formatNumber(metrics?.errorCount ?? 0)}
              isWarning={metrics?.errorCount ? metrics.errorCount > 0 : false}
            />
          </div>
        )}
      </EuiFlyoutBody>
    </EuiFlyout>
  );
};

/**
 * Single metric row component
 */
interface MetricRowProps {
  label: string;
  value: string;
  isError?: boolean;
  isWarning?: boolean;
}

const MetricRow: React.FC<MetricRowProps> = ({ label, value, isError, isWarning }) => {
  let valueColor: 'default' | 'danger' | 'warning' = 'default';
  if (isError) valueColor = 'danger';
  else if (isWarning) valueColor = 'warning';

  return (
    <EuiFlexGroup
      justifyContent="spaceBetween"
      alignItems="center"
      gutterSize="s"
      responsive={false}
    >
      <EuiFlexItem grow={false}>
        <EuiText size="s" color="subdued">
          {label}
        </EuiText>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiText size="s" color={valueColor}>
          <strong>{value}</strong>
        </EuiText>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};

/**
 * Format a number with thousands separators
 */
function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return Math.round(num).toLocaleString();
}

/**
 * Format latency in milliseconds
 */
function formatLatency(ms: number): string {
  if (ms === 0 || isNaN(ms) || !isFinite(ms)) {
    return '-';
  }
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(2)}s`;
  }
  return `${Math.round(ms)}ms`;
}

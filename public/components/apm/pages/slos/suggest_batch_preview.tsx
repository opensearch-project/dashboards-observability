/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Batch preview body — renders inside the suggest page's right-dock flyout.
 * Renders the Prometheus rule group each selected draft would deploy plus
 * the live SLI signals for each draft. Calls `apiClient.preview` per draft
 * via `useLivePreview`, which handles bounded concurrency and per-row error
 * isolation.
 */

import React, { useState } from 'react';
import {
  EuiBadge,
  EuiButtonGroup,
  EuiFlexGroup,
  EuiFlexItem,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import type { SloApiClient } from './slo_api_client';
import type { Suggestion } from './suggest_engine';
import { WindowOption } from './suggest_live_queries';
import { SuggestPreviewRow } from './suggest_preview_row';
import { useLivePreview } from './suggest_use_live_preview';

const WINDOW_OPTIONS = [
  { id: '1h', label: '1h' },
  { id: '24h', label: '24h' },
  { id: '7d', label: '7d' },
] as const;

export interface SuggestBatchPreviewProps {
  apiClient: Pick<SloApiClient, 'preview'>;
  selectedSuggestions: Suggestion[];
  prometheusConnectionId?: string;
  prometheusConnectionMeta?: Record<string, unknown>;
}

export const SuggestBatchPreview: React.FC<SuggestBatchPreviewProps> = ({
  apiClient,
  selectedSuggestions,
  prometheusConnectionId,
  prometheusConnectionMeta,
}) => {
  const [windowChoice, setWindowChoice] = useState<WindowOption>('24h');

  const { previews, liveByKey } = useLivePreview({
    apiClient,
    selectedSuggestions,
    windowChoice,
    prometheusConnectionId,
    prometheusConnectionMeta,
  });

  const totalRuleCount = previews
    .filter((p) => p.status === 'success')
    .reduce((acc, p) => acc + (p.group?.rules.length ?? 0), 0);
  const successCount = previews.filter((p) => p.status === 'success').length;
  const errorCount = previews.filter((p) => p.status === 'error').length;
  const loadingCount = previews.filter((p) => p.status === 'loading').length;
  const breachCount = previews.reduce((acc, p) => {
    const live = liveByKey[p.key];
    if (live?.status !== 'success') return acc;
    if (!(typeof live.totalSamples === 'number' && live.totalSamples > 0)) return acc;
    const obj = p.suggestion.input.spec.objectives[0];
    // Latency objectives: compare observed p99 to the bound.
    if (typeof obj?.latencyThreshold === 'number') {
      return typeof live.p99Ms === 'number' && live.p99Ms > obj.latencyThreshold * 1000
        ? acc + 1
        : acc;
    }
    // Availability objectives: compare SLI to target fraction.
    return typeof live.sliRatio === 'number' &&
      typeof obj?.target === 'number' &&
      live.sliRatio < obj.target
      ? acc + 1
      : acc;
  }, 0);

  return (
    <div data-test-subj="slosSuggestPreview">
      <EuiText size="s" color="subdued">
        {i18n.translate('observability.apm.slo.suggest.batchPreview.descriptionPrefix', {
          defaultMessage:
            'Rule groups that will be deployed on Create — plus the current SLI evaluated against the APM Prometheus datasource. A red ',
        })}
        <strong>
          {i18n.translate('observability.apm.slo.suggest.batchPreview.breachingTerm', {
            defaultMessage: 'breaching',
          })}
        </strong>
        {i18n.translate('observability.apm.slo.suggest.batchPreview.descriptionSuffix', {
          defaultMessage:
            ' badge means the draft would already be firing, making it a good candidate to create and investigate.',
        })}
      </EuiText>
      <EuiSpacer size="s" />
      <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false} wrap>
        <EuiFlexItem grow={false}>
          <EuiText size="xs" color="subdued">
            {i18n.translate('observability.apm.slo.suggest.batchPreview.evaluateOver', {
              defaultMessage: 'Evaluate over',
            })}
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButtonGroup
            legend={i18n.translate('observability.apm.slo.suggest.batchPreview.windowLegend', {
              defaultMessage: 'SLI evaluation window',
            })}
            idSelected={windowChoice}
            onChange={(id) => setWindowChoice(id as WindowOption)}
            options={[...WINDOW_OPTIONS]}
            buttonSize="compressed"
            data-test-subj="slosSuggestPreviewWindow"
          />
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="xs" />
      <EuiFlexGroup gutterSize="xs" responsive={false} wrap>
        {loadingCount > 0 && (
          <EuiFlexItem grow={false}>
            <EuiBadge color="hollow">
              {i18n.translate('observability.apm.slo.suggest.batchPreview.loadingBadge', {
                defaultMessage: '{count} loading',
                values: { count: loadingCount },
              })}
            </EuiBadge>
          </EuiFlexItem>
        )}
        <EuiFlexItem grow={false}>
          <EuiBadge color="primary">
            {i18n.translate('observability.apm.slo.suggest.batchPreview.previewedBadge', {
              defaultMessage: '{count} previewed',
              values: { count: successCount },
            })}
          </EuiBadge>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiBadge color="primary">
            {i18n.translate('observability.apm.slo.suggest.batchPreview.totalRulesBadge', {
              defaultMessage: '{count} rules total',
              values: { count: totalRuleCount },
            })}
          </EuiBadge>
        </EuiFlexItem>
        {breachCount > 0 && (
          <EuiFlexItem grow={false}>
            <EuiBadge color="danger">
              {i18n.translate('observability.apm.slo.suggest.batchPreview.breachingBadge', {
                defaultMessage: '{count} breaching',
                values: { count: breachCount },
              })}
            </EuiBadge>
          </EuiFlexItem>
        )}
        {errorCount > 0 && (
          <EuiFlexItem grow={false}>
            <EuiBadge color="danger">
              {i18n.translate('observability.apm.slo.suggest.batchPreview.failedBadge', {
                defaultMessage: '{count} failed',
                values: { count: errorCount },
              })}
            </EuiBadge>
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
      <EuiSpacer size="m" />
      {previews.length === 0 ? (
        <EuiText size="s" color="subdued">
          {i18n.translate('observability.apm.slo.suggest.batchPreview.selectAtLeastOne', {
            defaultMessage: 'Select at least one draft to preview.',
          })}
        </EuiText>
      ) : (
        previews.map((p) => (
          <SuggestPreviewRow
            key={p.key}
            preview={p}
            live={liveByKey[p.key] ?? { status: 'loading' }}
            windowChoice={windowChoice}
          />
        ))
      )}
    </div>
  );
};

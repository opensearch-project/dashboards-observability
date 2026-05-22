/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Per-suggestion row inside the rule preview flyout. Renders the rule-group
 * preview status, live SLI signals, and the YAML accordion. Pure presentation
 * — fetches happen in `useLivePreview`.
 */

import React from 'react';
import {
  EuiAccordion,
  EuiBadge,
  EuiCallOut,
  EuiCode,
  EuiCodeBlock,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiPanel,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import type { LiveSli, PerPreview } from './suggest_use_live_preview';
import type { WindowOption } from './suggest_live_queries';
import { formatSamples } from './suggest_live_queries';

export const SuggestPreviewRow: React.FC<{
  preview: PerPreview;
  live: LiveSli;
  windowChoice: WindowOption;
}> = ({ preview, live, windowChoice }) => {
  const { suggestion, status, group, error } = preview;
  const spec = suggestion.input.spec;
  const target = spec.objectives[0]?.target;
  const latencyBoundSec = spec.objectives[0]?.latencyThreshold;
  const isLatencyObjective = typeof latencyBoundSec === 'number';
  const hasSli = typeof live.sliRatio === 'number';
  // Only flag breaching when we actually observed traffic in the window;
  // zero samples means "no data yet", not "the SLO is firing".
  const hasTraffic = typeof live.totalSamples === 'number' && live.totalSamples > 0;
  // For latency objectives, span-derived histogram buckets aren't cumulative,
  // so the fraction-under-threshold SLI is unreliable. Flag breaching when the
  // observed p99 exceeds the template's latency bound instead.
  const breaching = isLatencyObjective
    ? live.status === 'success' &&
      hasTraffic &&
      typeof live.p99Ms === 'number' &&
      live.p99Ms > latencyBoundSec! * 1000
    : live.status === 'success' &&
      hasSli &&
      hasTraffic &&
      typeof target === 'number' &&
      live.sliRatio! < target;
  return (
    <EuiPanel
      color="subdued"
      paddingSize="s"
      hasBorder
      style={{ marginBottom: 8 }}
      data-test-subj={`slosSuggestPreviewRow-${suggestion.key}`}
    >
      <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false} wrap>
        <EuiFlexItem grow={true}>
          <EuiText size="s">
            <strong>{spec.name}</strong>
          </EuiText>
          <EuiFlexGroup gutterSize="xs" responsive={false} wrap>
            <EuiFlexItem grow={false}>
              <EuiBadge color="hollow">{suggestion.kind}</EuiBadge>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiText size="xs" color="subdued">
                {i18n.translate('observability.apm.slo.suggest.previewRow.objectiveSummary', {
                  defaultMessage: '{name} · target {target}%{latencySuffix}',
                  values: {
                    name: spec.objectives[0]?.name,
                    target: (spec.objectives[0]?.target * 100).toFixed(2).replace(/\.?0+$/, ''),
                    latencySuffix:
                      spec.objectives[0]?.latencyThreshold !== undefined
                        ? ` · ≤ ${spec.objectives[0].latencyThreshold}s`
                        : '',
                  },
                })}
              </EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          {status === 'loading' && <EuiLoadingSpinner size="m" />}
          {status === 'success' && group && (
            <EuiBadge color="primary">
              {i18n.translate('observability.apm.slo.suggest.previewRow.ruleCountBadge', {
                defaultMessage: '{count, plural, one {# rule} other {# rules}}',
                values: { count: group.rules.length },
              })}
            </EuiBadge>
          )}
          {status === 'error' && (
            <EuiBadge color="danger">
              {i18n.translate('observability.apm.slo.suggest.previewRow.previewFailedBadge', {
                defaultMessage: 'preview failed',
              })}
            </EuiBadge>
          )}
        </EuiFlexItem>
      </EuiFlexGroup>

      {/* Live signal row — always visible when we have (or are fetching) live data. */}
      {live.status !== 'skipped' && (
        <>
          <EuiSpacer size="xs" />
          <EuiFlexGroup
            gutterSize="xs"
            alignItems="center"
            responsive={false}
            wrap
            data-test-subj={`slosSuggestPreviewLive-${suggestion.key}`}
          >
            <EuiFlexItem grow={false}>
              <EuiText size="xs" color="subdued">
                {i18n.translate('observability.apm.slo.suggest.previewRow.overLastLabel', {
                  defaultMessage: 'Over last {windowChoice}:',
                  values: { windowChoice },
                })}
              </EuiText>
            </EuiFlexItem>
            {live.status === 'loading' && (
              <EuiFlexItem grow={false}>
                <EuiLoadingSpinner size="s" />
              </EuiFlexItem>
            )}
            {live.status === 'success' && (
              <>
                {/* Availability templates: show the observed SLI fraction.
                    Latency templates skip this — Data Prepper span-derived
                    buckets aren't cumulative so the ratio isn't reliable. */}
                {!isLatencyObjective && hasSli && (
                  <EuiFlexItem grow={false}>
                    <EuiBadge color={breaching ? 'danger' : 'success'}>
                      {i18n.translate('observability.apm.slo.suggest.previewRow.sliBadge', {
                        defaultMessage: 'SLI {value}%',
                        values: {
                          value: (live.sliRatio! * 100).toFixed(2).replace(/\.?0+$/, ''),
                        },
                      })}
                    </EuiBadge>
                  </EuiFlexItem>
                )}
                {typeof live.p99Ms === 'number' && (
                  <EuiFlexItem grow={false}>
                    <EuiBadge
                      color={isLatencyObjective ? (breaching ? 'danger' : 'success') : 'hollow'}
                    >
                      {i18n.translate('observability.apm.slo.suggest.previewRow.p99Badge', {
                        defaultMessage: 'p99 {value} ms{vsSuffix}',
                        values: {
                          value: live.p99Ms.toFixed(0),
                          vsSuffix: isLatencyObjective
                            ? ` vs ${((latencyBoundSec as number) * 1000).toFixed(0)} ms`
                            : '',
                        },
                      })}
                    </EuiBadge>
                  </EuiFlexItem>
                )}
                {breaching && (
                  <EuiFlexItem grow={false}>
                    <EuiBadge color="danger" iconType="alert">
                      {i18n.translate('observability.apm.slo.suggest.previewRow.breachingBadge', {
                        defaultMessage: 'breaching',
                      })}
                    </EuiBadge>
                  </EuiFlexItem>
                )}
                {typeof live.totalSamples === 'number' && (
                  <EuiFlexItem grow={false}>
                    <EuiBadge color="hollow">
                      {i18n.translate('observability.apm.slo.suggest.previewRow.samplesBadge', {
                        defaultMessage: '{value} samples',
                        values: { value: formatSamples(live.totalSamples) },
                      })}
                    </EuiBadge>
                  </EuiFlexItem>
                )}
                {!hasSli &&
                  typeof live.p99Ms !== 'number' &&
                  typeof live.totalSamples !== 'number' && (
                    <EuiFlexItem grow={false}>
                      <EuiText size="xs" color="subdued">
                        {i18n.translate('observability.apm.slo.suggest.previewRow.noDataInWindow', {
                          defaultMessage: 'no data in window',
                        })}
                      </EuiText>
                    </EuiFlexItem>
                  )}
              </>
            )}
            {live.status === 'error' && (
              <EuiFlexItem grow={false}>
                <EuiText size="xs" color="subdued">
                  {i18n.translate(
                    'observability.apm.slo.suggest.previewRow.liveMetricsUnavailable',
                    { defaultMessage: 'live metrics unavailable' }
                  )}
                </EuiText>
              </EuiFlexItem>
            )}
          </EuiFlexGroup>
        </>
      )}

      {status === 'error' && (
        <>
          <EuiSpacer size="xs" />
          <EuiCallOut
            size="s"
            color="warning"
            iconType="alert"
            title={i18n.translate('observability.apm.slo.suggest.previewRow.errorTitle', {
              defaultMessage: 'Preview unavailable',
            })}
            data-test-subj={`slosSuggestPreviewError-${suggestion.key}`}
          >
            <EuiText size="xs">
              {error ??
                i18n.translate('observability.apm.slo.suggest.previewRow.errorFallback', {
                  defaultMessage: 'Unable to generate preview.',
                })}
            </EuiText>
          </EuiCallOut>
        </>
      )}
      {status === 'success' && group && (
        <>
          <EuiSpacer size="xs" />
          <EuiAccordion
            id={`slosSuggestPreviewYaml-${suggestion.key}`}
            buttonContent={
              <EuiText size="xs">
                {i18n.translate('observability.apm.slo.suggest.previewRow.yamlAccordion.prefix', {
                  defaultMessage: 'Show rule group ',
                })}
                <EuiCode>{group.groupName}</EuiCode>
                {i18n.translate('observability.apm.slo.suggest.previewRow.yamlAccordion.suffix', {
                  defaultMessage: ' (eval interval {interval}s)',
                  values: { interval: group.interval },
                })}
              </EuiText>
            }
            paddingSize="s"
            data-test-subj={`slosSuggestPreviewYamlToggle-${suggestion.key}`}
          >
            <EuiCodeBlock
              language="yaml"
              paddingSize="s"
              isCopyable
              overflowHeight={320}
              data-test-subj={`slosSuggestPreviewYaml-${suggestion.key}`}
            >
              {group.yaml}
            </EuiCodeBlock>
          </EuiAccordion>
        </>
      )}
    </EuiPanel>
  );
};

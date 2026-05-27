/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SLO detail visualizations.
 *
 * Layout (top → bottom):
 *   1. Per-objective selector      — surfaced only when > 1 objective
 *   2. Error-budget panel          — attainment / budget remaining / time-to-exhaustion
 *   3. Burn-rate panel             — MWMBR tier matrix (short × long windows)
 *   4. Error-budget-remaining      — rolling-window area chart with warning threshold
 *   5. Burn rate by tier           — one line per MWMBR tier with threshold markLine
 *   6. Latency overlay (latency SLIs only) — p50/p90/p99 vs the objective bound
 *   7. Request volume              — context for correlating burn to traffic
 *
 * All queries go through the APM-configured Prometheus datasource. Queries are
 * generated inline from the spec (same math as the rule generator) so the
 * charts work before the ruler evaluates the SLO's recording rules.
 */

import React, { useMemo, useState } from 'react';
import {
  EuiButtonGroup,
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import { euiThemeVars } from '@osd/ui-shared-deps/theme';
import { i18n } from '@osd/i18n';
import { PromQLLineChart } from '../../shared/components/promql_line_chart';
import { useApmConfig } from '../../config/apm_config_context';
import { TimeRange } from '../../common/types/service_types';
import type { Objective, SloDocument, SloLiveStatus } from '../../../../../common/slo/slo_types';
import { SloBurnRatePanel } from './slo_burn_rate_panel';
import { SloBudgetPanel } from './slo_budget_panel';
import { SloBudgetRemainingChart } from './slo_budget_remaining_chart';
import { SloBurnRateChart } from './slo_burn_rate_chart';
import {
  buildErrorRatioQuery,
  buildLatencyPercentileQuery,
  buildRequestRateQuery,
} from './slo_query_builders';

export interface SloVisualizationsProps {
  slo: SloDocument & { liveStatus: SloLiveStatus };
  timeRange: TimeRange;
  refreshTrigger: number;
  /**
   * Invoked when the MWMBR tier cards ask the operator to "view generated
   * rules". The detail page owns the Advanced-details accordion holding the
   * generated rule names, so it passes down the scroll/expand handler from
   * there. Undefined = link hidden (e.g. storybook / tests).
   */
  onViewRulesRequest?: () => void;
}

function formatSeconds(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (value < 1) return `${(value * 1000).toFixed(0)} ms`;
  return `${value.toFixed(2)} s`;
}

function formatRate(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K / s`;
  if (value >= 10) return `${value.toFixed(0)} / s`;
  return `${value.toFixed(2)} / s`;
}

export const SloVisualizations: React.FC<SloVisualizationsProps> = ({
  slo,
  timeRange,
  refreshTrigger,
  onViewRulesRequest,
}) => {
  const { config } = useApmConfig();
  const prometheusConnectionId = config?.prometheusDataSource?.name ?? '';

  // Multi-objective support — the server generates one rule set per objective,
  // so each needs its own visualization. Default to the first (tightest target
  // is usually the one users want to see first).
  const objectives = slo.spec.objectives;
  const [activeObjectiveName, setActiveObjectiveName] = useState<string>(objectives[0]?.name ?? '');
  const activeObjective: Objective | undefined =
    objectives.find((o) => o.name === activeObjectiveName) ?? objectives[0];

  // ========================================================================
  // All hooks must be called before any early returns to satisfy React's
  // "rules of hooks". Compute the queries up-front, returning null when
  // inputs aren't available — the render code handles the null branches.
  // ========================================================================

  const errorRatioQuery = useMemo(
    () => (activeObjective ? buildErrorRatioQuery(slo, activeObjective) : null),
    [slo, activeObjective]
  );
  const requestRateQuery = useMemo(() => buildRequestRateQuery(slo), [slo]);

  const p50Query = useMemo(() => buildLatencyPercentileQuery(slo, 0.5), [slo]);
  const p90Query = useMemo(() => buildLatencyPercentileQuery(slo, 0.9), [slo]);
  const p99Query = useMemo(() => buildLatencyPercentileQuery(slo, 0.99), [slo]);

  const isLatency =
    slo.spec.sli.type === 'single' &&
    slo.spec.sli.definition.backend === 'prometheus' &&
    slo.spec.sli.definition.type === 'latency_threshold';

  // ========================================================================
  // Early-exit states. Keep the error callouts terse — operators scanning the
  // page should know *why* there are no charts without reading three paragraphs.
  // ========================================================================

  if (!prometheusConnectionId) {
    return (
      <EuiCallOut
        size="s"
        color="warning"
        iconType="iInCircle"
        data-test-subj="slosVisualizationsNoDatasource"
        title={i18n.translate('observability.apm.slo.visualizations.noDatasource.title', {
          defaultMessage: 'Prometheus datasource not configured in APM',
        })}
      >
        <EuiText size="s">
          {i18n.translate('observability.apm.slo.visualizations.noDatasource.body', {
            defaultMessage:
              'Configure a Prometheus datasource in APM Settings to render live SLO visualizations.',
          })}
        </EuiText>
      </EuiCallOut>
    );
  }

  if (slo.spec.sli.type !== 'single') {
    return (
      <EuiCallOut
        size="s"
        color="warning"
        iconType="iInCircle"
        title={i18n.translate('observability.apm.slo.visualizations.composite.title', {
          defaultMessage: 'Composite SLO',
        })}
      >
        <EuiText size="s">
          {i18n.translate('observability.apm.slo.visualizations.composite.body', {
            defaultMessage: "Composite SLOs don't support pre-canned charts yet.",
          })}
        </EuiText>
      </EuiCallOut>
    );
  }

  if (!activeObjective || !errorRatioQuery) {
    return (
      <EuiCallOut
        size="s"
        color="warning"
        iconType="iInCircle"
        title={i18n.translate('observability.apm.slo.visualizations.noChart.title', {
          defaultMessage: 'Cannot build a chart for this SLI',
        })}
      >
        <EuiText size="s">
          {i18n.translate('observability.apm.slo.visualizations.noChart.body', {
            defaultMessage:
              'The SLI is missing the metric or custom expression needed to produce a query.',
          })}
        </EuiText>
      </EuiCallOut>
    );
  }

  return (
    <>
      {/* Objective selector — only renders when there's more than one. */}
      {objectives.length > 1 && (
        <>
          <EuiPanel paddingSize="s" hasBorder hasShadow={false}>
            <EuiFlexGroup alignItems="center" gutterSize="m" responsive={false} wrap>
              <EuiFlexItem grow={false}>
                <EuiText size="s">
                  <strong>
                    {i18n.translate('observability.apm.slo.visualizations.objectiveLabel', {
                      defaultMessage: 'Objective',
                    })}
                  </strong>
                </EuiText>
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiButtonGroup
                  legend={i18n.translate('observability.apm.slo.visualizations.objectiveLegend', {
                    defaultMessage: 'Select objective',
                  })}
                  name="objective"
                  idSelected={activeObjectiveName}
                  onChange={(id) => setActiveObjectiveName(id)}
                  color="primary"
                  options={objectives.map((o) => ({
                    id: o.name,
                    label: `${o.displayName ?? o.name} · ${(o.target * 100)
                      .toFixed(3)
                      .replace(/\.?0+$/, '')}%`,
                  }))}
                  buttonSize="compressed"
                  data-test-subj="slosObjectiveSelector"
                />
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiPanel>
          <EuiSpacer size="m" />
        </>
      )}

      {/* 2. Budget summary — the "am I safe?" panel above everything else. */}
      <SloBudgetPanel
        slo={slo}
        objective={activeObjective}
        liveStatus={slo.liveStatus}
        prometheusConnectionId={prometheusConnectionId}
        timeRange={timeRange}
        refreshTrigger={refreshTrigger}
      />

      <EuiSpacer size="m" />

      {/* 3. Burn-rate tier matrix. */}
      <SloBurnRatePanel
        slo={slo}
        objective={activeObjective}
        prometheusConnectionId={prometheusConnectionId}
        timeRange={timeRange}
        refreshTrigger={refreshTrigger}
        onViewRulesRequest={onViewRulesRequest}
      />

      <EuiSpacer size="m" />

      {/* 4. Error-budget-remaining over the rolling window — the "am I safe,
              and how close to breach?" chart SREs read first. Replaces the
              point-in-time error-ratio chart that used to sit here. */}
      <SloBudgetRemainingChart
        slo={slo}
        objective={activeObjective}
        prometheusConnectionId={prometheusConnectionId}
        timeRange={timeRange}
        refreshTrigger={refreshTrigger}
      />

      <EuiSpacer size="m" />

      {/* 5. Burn-rate-per-tier time series — the second chart SREs read:
              "are any of my burn-rate alarms about to page me?". The
              burn-rate alerts panel above it (SloBurnRatePanel) is the
              point-in-time matrix; this chart is the trajectory. */}
      <SloBurnRateChart
        slo={slo}
        objective={activeObjective}
        prometheusConnectionId={prometheusConnectionId}
        timeRange={timeRange}
        refreshTrigger={refreshTrigger}
      />

      <EuiSpacer size="m" />

      {/* 6. Latency percentile overlay — latency SLIs only. Ships p50, p90, p99
              together so tail-latency regressions are visible against the
              objective bound. */}
      {isLatency && p50Query && p90Query && p99Query && (
        <>
          <EuiFlexGroup gutterSize="m">
            <EuiFlexItem>
              <EuiPanel>
                <EuiText size="m">
                  <h4>
                    {i18n.translate('observability.apm.slo.visualizations.latency.heading', {
                      defaultMessage: 'Latency distribution',
                    })}
                  </h4>
                </EuiText>
                <EuiText size="xs" color="subdued">
                  {i18n.translate('observability.apm.slo.visualizations.latency.description', {
                    defaultMessage:
                      'p50 / p90 / p99 from the histogram buckets. Objective bound marks the tier where requests are considered "bad".',
                  })}
                </EuiText>
                <EuiSpacer size="s" />
                <PromQLLineChart
                  promqlQuery={p50Query}
                  timeRange={timeRange}
                  prometheusConnectionId={prometheusConnectionId}
                  chartType="line"
                  height={60}
                  refreshTrigger={refreshTrigger}
                  formatValue={formatSeconds}
                  seriesLabel="p50"
                  color={euiThemeVars.euiColorSuccessText}
                  showLegend={false}
                />
                <PromQLLineChart
                  promqlQuery={p90Query}
                  timeRange={timeRange}
                  prometheusConnectionId={prometheusConnectionId}
                  chartType="line"
                  height={60}
                  refreshTrigger={refreshTrigger}
                  formatValue={formatSeconds}
                  seriesLabel="p90"
                  color={euiThemeVars.euiColorWarningText}
                  showLegend={false}
                />
                <PromQLLineChart
                  promqlQuery={p99Query}
                  timeRange={timeRange}
                  prometheusConnectionId={prometheusConnectionId}
                  chartType="line"
                  height={60}
                  refreshTrigger={refreshTrigger}
                  formatValue={formatSeconds}
                  seriesLabel="p99"
                  color={euiThemeVars.euiColorDangerText}
                  showLegend={false}
                />
                {activeObjective.latencyThreshold !== undefined && (
                  <>
                    <EuiSpacer size="xs" />
                    <EuiText size="xs" color="subdued">
                      {i18n.translate(
                        'observability.apm.slo.visualizations.latency.objectiveBoundLabel',
                        { defaultMessage: 'objective bound: ' }
                      )}
                      <strong>
                        {formatSeconds(
                          (slo.spec.sli.type === 'single' &&
                          slo.spec.sli.definition.backend === 'prometheus' &&
                          slo.spec.sli.definition.type === 'latency_threshold' &&
                          slo.spec.sli.definition.latencyThresholdUnit === 'milliseconds'
                            ? activeObjective.latencyThreshold / 1000
                            : activeObjective.latencyThreshold) ?? 0
                        )}
                      </strong>
                    </EuiText>
                  </>
                )}
              </EuiPanel>
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiSpacer size="m" />
        </>
      )}

      {/* 7. Request volume context — throughput correlates with the error-ratio
              panel above so operators can distinguish "burn caused by traffic
              shift" from "burn caused by SLI regression". */}
      {requestRateQuery && (
        <EuiPanel>
          <EuiText size="m">
            <h4>
              {i18n.translate('observability.apm.slo.visualizations.requestVolume.heading', {
                defaultMessage: 'Request volume',
              })}
            </h4>
          </EuiText>
          <EuiText size="xs" color="subdued">
            {i18n.translate('observability.apm.slo.visualizations.requestVolume.description', {
              defaultMessage:
                'Total requests per second observed by the SLI. Spikes here usually explain bursts in the error-ratio chart above.',
            })}
          </EuiText>
          <EuiSpacer size="s" />
          <PromQLLineChart
            promqlQuery={requestRateQuery}
            timeRange={timeRange}
            prometheusConnectionId={prometheusConnectionId}
            chartType="line"
            height={200}
            refreshTrigger={refreshTrigger}
            formatValue={formatRate}
            seriesLabel={slo.spec.service}
            showLegend={false}
          />
        </EuiPanel>
      )}
    </>
  );
};

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Error-budget panel: the "am I safe?" summary for one SLO objective.
 *
 * Four tiles across the top:
 *   1. Attainment vs target — the headline SLI value over the SLO's own window
 *   2. Error budget remaining — how much of the allowed bad-event budget is left
 *   3. Time-to-exhaustion — linear forecast based on the current 1h burn rate
 *   4. Events (1h) — good/total counts + ratio, recent signal of SLI health
 *
 * Plus a budget bar showing consumed/remaining with a warning-threshold marker
 * and a thin 24h-consumption overlay so operators see "how fast am I burning
 * *right now*" against the overall window.
 *
 * Values come from the `SloLiveStatus` the server already computes plus a few
 * lightweight PromQL queries (1h burn ratio, 1h good/total counts, 24h error
 * ratio). Keeping the forecast tied to the 1h recorder means it reacts quickly
 * to incidents without being noisy on the 5m scale. "Rules provisioned" has
 * moved to the Advanced-details accordion since it's an implementation signal,
 * not an operator signal.
 */

import React, { useMemo } from 'react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiSpacer,
  EuiStat,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';
import { euiThemeVars } from '@osd/ui-shared-deps/theme';
import { i18n } from '@osd/i18n';
import { usePromQLChartData } from '../../shared/hooks/use_promql_chart_data';
import { TimeRange } from '../../common/types/service_types';
import type {
  BudgetWarningThreshold,
  Objective,
  SloDocument,
  SloLiveStatus,
} from '../../../../../common/slo/slo_types';
import {
  buildErrorRatioExprForWindow,
  buildGoodEventsCountQuery,
  buildTotalEventsCountQuery,
} from './slo_query_builders';
import { formatPct, SLO_PRECISION, TABULAR_NUMS_STYLE } from '../../../../../common/slo/format';

export interface SloBudgetPanelProps {
  slo: SloDocument;
  objective: Objective;
  liveStatus: SloLiveStatus;
  prometheusConnectionId: string;
  timeRange: TimeRange;
  refreshTrigger: number;
}

function parseDurationToMs(duration: string): number {
  const match = duration.match(/^(\d+)(s|m|h|d|w)$/);
  if (!match) return 0;
  const val = parseInt(match[1], 10);
  switch (match[2]) {
    case 's':
      return val * 1_000;
    case 'm':
      return val * 60_000;
    case 'h':
      return val * 3_600_000;
    case 'd':
      return val * 86_400_000;
    case 'w':
      return val * 604_800_000;
    default:
      return 0;
  }
}

function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

/**
 * Linear forecast: at the observed 1h burn rate, how long until the remaining
 * budget hits zero? Returns null when the burn rate is at or below the
 * sustainable rate (= error budget itself over the window).
 */
function estimateTimeToExhaustion(
  remaining: number,
  current1hErrorRatio: number | null,
  errorBudget: number,
  windowMs: number
): number | null {
  if (current1hErrorRatio === null || !Number.isFinite(current1hErrorRatio)) return null;
  if (remaining <= 0) return 0;
  if (errorBudget <= 0) return null;

  // The sustainable burn rate is "errorBudget per window" — anything at or
  // below that lasts forever in the linear model.
  const burnRate = current1hErrorRatio / errorBudget; // multiple of the sustainable rate
  if (burnRate <= 1) return null;

  // remaining (fraction of budget) * window / (burnRate - 1) — subtract 1 because
  // the window already "earns" budget at the sustainable rate.
  return (remaining * windowMs) / (burnRate - 1);
}

/**
 * Horizontal budget bar.
 *
 * Layout:
 *  - Main bar: three zone bands partition the [0, 1] budget universe — green
 *    (healthy) from 0 to warn-at-consumed, amber (warning) from warn to 100%,
 *    red (breach) past 100% when over budget. Zones act as a reference
 *    palette so the ticks read as true boundaries instead of decorations.
 *  - Warn-at-consumed tick (dashed): marks the green→amber transition.
 *  - 100% breach tick (dashed): marks the amber→red transition at the right
 *    edge of the allowed budget. Always rendered so "overflow is visible"
 *    holds even when consumption is below 100%.
 *  - 24h overlay: a thin bar beneath the main bar showing the last 24h of
 *    budget consumption as a proportion of total budget — answers "am I
 *    burning faster than the window allows?". Omitted when 24h data is
 *    unavailable rather than rendering a placeholder.
 *
 * Dark-mode safety: zone fills use 20% opacity so the zones tint the track
 * without shouting in either palette. Light-mode readability stays intact
 * because the dashed ticks and adjacent numeric copy carry the live signal.
 */
const BudgetBar: React.FC<{
  /** Fraction of budget remaining (0..1; can be negative). */
  remaining: number;
  /**
   * Warn-at-consumed fraction in [0, 1]. 0.5 = "warn once half the budget is
   * burned". If null, the threshold marker is omitted.
   */
  warnAtConsumed: number | null;
  /**
   * Fraction of budget consumed by the last 24h of burn, in [0, 1]. When null,
   * the 24h overlay is omitted.
   */
  last24hConsumed: number | null;
}> = ({ remaining, warnAtConsumed, last24hConsumed }) => {
  const consumed = Math.max(0, 1 - remaining);
  const overBudget = consumed > 1;
  const warnFraction =
    warnAtConsumed !== null && warnAtConsumed >= 0 && warnAtConsumed <= 1 ? warnAtConsumed : null;
  // Zone widths as % of the [0, 1] budget universe. If the spec carries no
  // warn-at-consumed, the amber band collapses and the 100% breach tick alone
  // anchors the boundary.
  const greenWidthPct = (warnFraction ?? 1) * 100;
  const amberWidthPct = warnFraction !== null ? (1 - warnFraction) * 100 : 0;
  // Cap the rendered breach zone at 20% of bar width so a 300% blow-through
  // doesn't stretch the layout; when the true overflow exceeds the cap, a
  // glyph at the right edge flags "off scale".
  const overflowAbs = overBudget ? consumed - 1 : 0;
  const overflowRenderedPct = Math.min(overflowAbs, 0.2) * 100;
  const overflowClipped = overflowAbs > 0.2;

  const show24h = last24hConsumed !== null && Number.isFinite(last24hConsumed);
  const last24hPct = show24h ? Math.min(100, Math.max(0, last24hConsumed as number) * 100) : 0;

  const zoneStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    bottom: 0,
    opacity: 0.2,
  };

  return (
    <>
      <div
        style={{
          position: 'relative',
          height: 14,
          background: euiThemeVars.euiColorLightestShade,
          borderRadius: 4,
          // Visible, not hidden: the breach zone and its 100% tick render past
          // the track's right edge when the SLO is over budget.
          overflow: 'visible',
        }}
        data-test-subj="slosBudgetBar"
      >
        <div
          style={{
            ...zoneStyle,
            left: 0,
            width: `${greenWidthPct}%`,
            background: euiThemeVars.euiColorSuccess,
            borderTopLeftRadius: 4,
            borderBottomLeftRadius: 4,
            borderTopRightRadius: amberWidthPct > 0 || overBudget ? 0 : 4,
            borderBottomRightRadius: amberWidthPct > 0 || overBudget ? 0 : 4,
          }}
          data-test-subj="slosBudgetBarZoneHealthy"
        />
        {amberWidthPct > 0 && (
          <div
            style={{
              ...zoneStyle,
              left: `${greenWidthPct}%`,
              width: `${amberWidthPct}%`,
              background: euiThemeVars.euiColorWarning,
              borderTopRightRadius: overBudget ? 0 : 4,
              borderBottomRightRadius: overBudget ? 0 : 4,
            }}
            data-test-subj="slosBudgetBarZoneWarning"
          />
        )}
        {overBudget && (
          <div
            style={{
              ...zoneStyle,
              left: '100%',
              width: `${overflowRenderedPct}%`,
              background: euiThemeVars.euiColorDanger,
              borderTopRightRadius: 4,
              borderBottomRightRadius: 4,
            }}
            data-test-subj="slosBudgetBarZoneBreach"
          />
        )}
        {warnFraction !== null && (
          <div
            style={{
              position: 'absolute',
              left: `${warnFraction * 100}%`,
              top: -2,
              bottom: -2,
              width: 0,
              borderLeft: `1px dashed ${euiThemeVars.euiColorDangerText}`,
            }}
            data-test-subj="slosBudgetBarThreshold"
          />
        )}
        <div
          style={{
            position: 'absolute',
            left: '100%',
            top: -2,
            bottom: -2,
            width: 0,
            borderLeft: `1px dashed ${euiThemeVars.euiColorDangerText}`,
          }}
          data-test-subj="slosBudgetBarBreachTick"
        />
        {overflowClipped && (
          <div
            style={{
              position: 'absolute',
              left: `${100 + overflowRenderedPct}%`,
              top: 0,
              bottom: 0,
              display: 'flex',
              alignItems: 'center',
              paddingLeft: 2,
              fontSize: 10,
              lineHeight: 1,
              color: euiThemeVars.euiColorDangerText,
            }}
            data-test-subj="slosBudgetBarOverflow"
            aria-label={i18n.translate('observability.apm.slo.budgetPanel.overflowAriaLabel', {
              defaultMessage: 'budget consumed far exceeds 100%',
            })}
          >
            ▶
          </div>
        )}
      </div>
      {show24h && (
        <div
          style={{
            position: 'relative',
            height: 3,
            marginTop: 2,
            background: euiThemeVars.euiColorLightestShade,
            borderRadius: 2,
            overflow: 'hidden',
          }}
          data-test-subj="slosBudgetBar24h"
        >
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: `${last24hPct}%`,
              background: euiThemeVars.euiColorVis5,
            }}
          />
        </div>
      )}
    </>
  );
};

/** Format an event count compactly (e.g. 12400 → "12.4k", 1_500_000 → "1.5M"). */
function formatCount(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  if (abs >= 10) return `${Math.round(n)}`;
  return n.toFixed(1);
}

/** Pick the tightest warning threshold the user configured (largest fraction
 *  remaining that triggers the warn band). Falls back to 50%-consumed when the
 *  SLO carries no budget-warning thresholds so the detail page still renders
 *  a meaningful marker — SloSpec carries budgetWarningThresholds as a list of
 *  "remaining" fractions, no dedicated "warn-at-consumed" field. */
function warnAtConsumedFromSpec(thresholds: BudgetWarningThreshold[] | undefined): number {
  if (!thresholds || thresholds.length === 0) return 0.5;
  const tightest = thresholds.reduce(
    (best, t) => (t.threshold > best ? t.threshold : best),
    -Infinity
  );
  if (!Number.isFinite(tightest)) return 0.5;
  return Math.min(1, Math.max(0, 1 - tightest));
}

export const SloBudgetPanel: React.FC<SloBudgetPanelProps> = ({
  slo,
  objective,
  liveStatus,
  prometheusConnectionId,
  timeRange,
  refreshTrigger,
}) => {
  const objectiveStatus =
    liveStatus.objectives.find((o) => o.objectiveName === objective.name) ??
    liveStatus.objectives[0];

  const target = objective.target;
  const errorBudget = 1 - target;
  const remaining = objectiveStatus?.errorBudgetRemaining ?? 1;
  const attainment = objectiveStatus?.attainment ?? target;

  // Drive the time-to-exhaustion off a 1h error ratio. We always query, but
  // the card renders "—" cleanly when no samples are returned.
  const burnRateQuery = useMemo(() => buildErrorRatioExprForWindow(slo, objective, '1h'), [
    slo,
    objective,
  ]);
  const { latestValue: oneHourErrorRatio } = usePromQLChartData({
    promqlQuery: burnRateQuery ?? '',
    timeRange,
    prometheusConnectionId,
    refreshTrigger,
    enabled: Boolean(burnRateQuery),
  });

  // Raw 1h good/total counts drive the Events stat. Custom SLIs return null
  // from the builders — the stat renders "—" / "waiting for samples".
  const goodEventsQuery = useMemo(() => buildGoodEventsCountQuery(slo, objective, '1h'), [
    slo,
    objective,
  ]);
  const totalEventsQuery = useMemo(() => buildTotalEventsCountQuery(slo, objective, '1h'), [
    slo,
    objective,
  ]);
  const { latestValue: goodEvents } = usePromQLChartData({
    promqlQuery: goodEventsQuery ?? '',
    timeRange,
    prometheusConnectionId,
    refreshTrigger,
    enabled: Boolean(goodEventsQuery),
  });
  const { latestValue: totalEvents } = usePromQLChartData({
    promqlQuery: totalEventsQuery ?? '',
    timeRange,
    prometheusConnectionId,
    refreshTrigger,
    enabled: Boolean(totalEventsQuery),
  });

  // 24h error ratio powers the thin secondary bar: "what fraction of the
  // total budget did the last 24h consume?". Sustains the "faster-than-
  // sustainable burn" visual cue without adding another scalar card.
  const twentyFourHourBurnQuery = useMemo(
    () => buildErrorRatioExprForWindow(slo, objective, '24h'),
    [slo, objective]
  );
  const { latestValue: twentyFourHourErrorRatio } = usePromQLChartData({
    promqlQuery: twentyFourHourBurnQuery ?? '',
    timeRange,
    prometheusConnectionId,
    refreshTrigger,
    enabled: Boolean(twentyFourHourBurnQuery),
  });

  const windowMs =
    slo.spec.window.type === 'rolling' ? parseDurationToMs(slo.spec.window.duration) : 0;
  const timeLeftMs = estimateTimeToExhaustion(remaining, oneHourErrorRatio, errorBudget, windowMs);

  const last24hConsumed =
    twentyFourHourErrorRatio !== null &&
    Number.isFinite(twentyFourHourErrorRatio) &&
    windowMs > 0 &&
    errorBudget > 0
      ? // Fraction of total budget consumed by 24h of this error rate.
        Math.max(0, (twentyFourHourErrorRatio * (24 * 3_600_000)) / (errorBudget * windowMs))
      : null;

  const warnAtConsumed = warnAtConsumedFromSpec(slo.spec.budgetWarningThresholds);

  const attainmentColor =
    attainment >= target
      ? euiThemeVars.euiColorSuccessText
      : attainment >= target - errorBudget * 0.5
      ? euiThemeVars.euiColorWarningText
      : euiThemeVars.euiColorDangerText;

  const remainingColor = remaining > 0.25 ? 'success' : remaining > 0 ? 'accent' : 'danger';

  // Events stat colour mirrors the attainment semantics: green when ratio is
  // at/above target, warning when below target but still above (target -
  // errorBudget), danger when below both.
  const eventsRatio =
    goodEvents !== null && totalEvents !== null && totalEvents > 0
      ? goodEvents / totalEvents
      : null;
  const eventsAvailable = eventsRatio !== null;
  const eventsColor =
    eventsRatio === null
      ? euiThemeVars.euiTextSubduedColor
      : eventsRatio >= target
      ? euiThemeVars.euiColorSuccessText
      : eventsRatio >= target - errorBudget
      ? euiThemeVars.euiColorWarningText
      : euiThemeVars.euiColorDangerText;

  return (
    <EuiPanel data-test-subj="slosBudgetPanel">
      <EuiFlexGroup alignItems="center">
        <EuiFlexItem>
          <EuiText size="m">
            <h4>
              {i18n.translate('observability.apm.slo.budgetPanel.heading', {
                defaultMessage: 'Error budget',
              })}
            </h4>
          </EuiText>
          <EuiText size="xs" color="subdued">
            {slo.spec.window.type === 'rolling' ? (
              <>
                {i18n.translate('observability.apm.slo.budgetPanel.rollingPrefix', {
                  defaultMessage: 'Rolling {duration} window — target ',
                  values: { duration: slo.spec.window.duration },
                })}
                <span style={TABULAR_NUMS_STYLE}>
                  {formatPct(target, { decimals: SLO_PRECISION.target })}
                </span>
              </>
            ) : (
              i18n.translate('observability.apm.slo.budgetPanel.calendarLabel', {
                defaultMessage: 'Calendar {period} window',
                values: { period: slo.spec.window.period },
              })
            )}
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="s" />

      <EuiFlexGroup gutterSize="m" responsive>
        <EuiFlexItem>
          <EuiStat
            titleSize="m"
            reverse
            titleColor={remainingColor as 'success' | 'accent' | 'danger'}
            description={
              <EuiToolTip
                content={i18n.translate('observability.apm.slo.budgetPanel.remaining.tooltip', {
                  defaultMessage:
                    'Fraction of the error budget still available. Negative means the SLO has been exceeded.',
                })}
              >
                <span>
                  {i18n.translate('observability.apm.slo.budgetPanel.remaining.label', {
                    defaultMessage: 'Budget remaining',
                  })}
                </span>
              </EuiToolTip>
            }
            title={
              <span style={TABULAR_NUMS_STYLE}>
                {formatPct(remaining, { decimals: SLO_PRECISION.budget })}
              </span>
            }
            data-test-subj="slosBudgetRemaining"
          />
          <EuiText size="xs" color="subdued">
            {i18n.translate('observability.apm.slo.budgetPanel.budgetTotalPrefix', {
              defaultMessage: 'budget ',
            })}
            <span style={TABULAR_NUMS_STYLE}>
              {formatPct(errorBudget, { decimals: SLO_PRECISION.budget })}
            </span>
            {i18n.translate('observability.apm.slo.budgetPanel.budgetTotalSuffix', {
              defaultMessage: ' total',
            })}
          </EuiText>
        </EuiFlexItem>

        <EuiFlexItem>
          <EuiStat
            titleSize="m"
            reverse
            description={
              <EuiToolTip
                content={i18n.translate('observability.apm.slo.budgetPanel.exhaustion.tooltip', {
                  defaultMessage:
                    "Linear forecast at the current 1h burn rate. '—' means burn is at or below the sustainable rate.",
                })}
              >
                <span>
                  {i18n.translate('observability.apm.slo.budgetPanel.exhaustion.label', {
                    defaultMessage: 'Time to exhaustion',
                  })}
                </span>
              </EuiToolTip>
            }
            title={
              <span style={TABULAR_NUMS_STYLE}>
                {timeLeftMs === null
                  ? '—'
                  : timeLeftMs === 0
                  ? i18n.translate('observability.apm.slo.budgetPanel.exhausted', {
                      defaultMessage: 'exhausted',
                    })
                  : formatDurationMs(timeLeftMs)}
              </span>
            }
            titleColor={
              timeLeftMs !== null && timeLeftMs < 3_600_000
                ? 'danger'
                : timeLeftMs !== null && timeLeftMs < 24 * 3_600_000
                ? 'accent'
                : 'subdued'
            }
            data-test-subj="slosBudgetExhaustion"
          />
          <EuiText size="xs" color="subdued">
            {i18n.translate('observability.apm.slo.budgetPanel.basedOn1hBurn', {
              defaultMessage: 'based on 1h burn',
            })}
          </EuiText>
        </EuiFlexItem>

        <EuiFlexItem>
          <EuiStat
            titleSize="m"
            reverse
            description={
              <EuiToolTip
                content={i18n.translate('observability.apm.slo.budgetPanel.attainment.tooltip', {
                  defaultMessage:
                    "Current SLI value over the SLO's window, compared to the target.",
                })}
              >
                <span>
                  {i18n.translate('observability.apm.slo.budgetPanel.attainment.label', {
                    defaultMessage: 'Attainment',
                  })}
                </span>
              </EuiToolTip>
            }
            title={
              <span style={{ color: attainmentColor, ...TABULAR_NUMS_STYLE }}>
                {formatPct(attainment, { decimals: SLO_PRECISION.attainment })}
              </span>
            }
            data-test-subj="slosBudgetAttainment"
          />
          <EuiText size="xs" color="subdued">
            {i18n.translate('observability.apm.slo.budgetPanel.attainment.targetPrefix', {
              defaultMessage: 'target ',
            })}
            <span style={TABULAR_NUMS_STYLE}>
              {formatPct(target, { decimals: SLO_PRECISION.target })}
            </span>
          </EuiText>
        </EuiFlexItem>

        <EuiFlexItem>
          <EuiStat
            titleSize="m"
            reverse
            description={
              <EuiToolTip
                content={i18n.translate('observability.apm.slo.budgetPanel.events.tooltip', {
                  defaultMessage:
                    'Good vs total events observed in the last hour. Colour tracks the attainment thresholds — green at/above target, warning below target but within the error budget, danger once below.',
                })}
              >
                <span>
                  {i18n.translate('observability.apm.slo.budgetPanel.events.label', {
                    defaultMessage: 'Events (1h)',
                  })}
                </span>
              </EuiToolTip>
            }
            title={
              <span style={{ color: eventsColor, ...TABULAR_NUMS_STYLE }}>
                {eventsAvailable ? (
                  <>
                    {formatCount(goodEvents)} / {formatCount(totalEvents)}
                  </>
                ) : (
                  '—'
                )}
              </span>
            }
            data-test-subj="slosBudgetEvents"
          />
          <EuiText size="xs" color="subdued">
            {eventsAvailable ? (
              <span style={TABULAR_NUMS_STYLE}>
                {formatPct(eventsRatio as number, { decimals: SLO_PRECISION.eventsRatio })}
              </span>
            ) : (
              i18n.translate('observability.apm.slo.budgetPanel.waitingForSamples', {
                defaultMessage: 'waiting for samples',
              })
            )}
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="m" />

      <EuiText size="xs" color="subdued">
        <strong>
          {i18n.translate('observability.apm.slo.budgetPanel.consumed.label', {
            defaultMessage: 'Budget consumed',
          })}
        </strong>
        {i18n.translate('observability.apm.slo.budgetPanel.consumed.dash', {
          defaultMessage: ' — ',
        })}
        <span style={TABULAR_NUMS_STYLE}>
          {formatPct(Math.max(0, 1 - remaining), { decimals: SLO_PRECISION.budget })}
        </span>
        {i18n.translate('observability.apm.slo.budgetPanel.consumed.suffix', {
          defaultMessage: ' of allowed',
        })}
      </EuiText>
      <EuiSpacer size="xs" />
      <BudgetBar
        remaining={remaining}
        warnAtConsumed={warnAtConsumed}
        last24hConsumed={last24hConsumed}
      />
    </EuiPanel>
  );
};

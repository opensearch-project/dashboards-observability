/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Aggregate health panel shown above the SLO catalog listing.
 *
 * Collapsed to a single horizontal strip so the listing table below the fold
 * stays visible. Three zones separated by thin vertical dividers:
 *
 *   Zone A — KPI tiles (aggregate budget, breached, warning, healthy, firing,
 *            no data / disabled). Each tile filters the listing on click.
 *   Zone B — Health rail: full-width stacked CSS bar with an inline count
 *            legend. Replaces the 140 px donut + legend without losing the
 *            proportional-mix signal. Segments are clickable filters.
 *   Zone C — At-risk chips: top 3 reporting SLOs by worst error-budget
 *            remaining, each with a mini budget bar. A "+N more" link opens
 *            the listing filtered to remaining < 25%.
 */

import React, { useMemo } from 'react';
import {
  EuiButtonEmpty,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiLink,
  EuiPanel,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';
import { euiThemeVars } from '@osd/ui-shared-deps/theme';
import { i18n } from '@osd/i18n';
import type { SloHealthState, SloSummary } from '../../../../../common/slo/slo_types';
import { formatPct, SLO_PRECISION, TABULAR_NUMS_STYLE } from '../../../../../common/slo/format';

export interface SloOverviewPanelProps {
  items: SloSummary[];
  /** Current active state filter — null means "all". Used to highlight the active tile. */
  activeStateFilter?: SloHealthState | 'firing' | null;
  /** Callback when a KPI tile is clicked. Pass null to clear. */
  onStateFilterChange?: (filter: SloHealthState | 'firing' | null) => void;
}

const STATE_DISPLAY: Record<SloHealthState, { label: string; color: string }> = {
  breached: {
    label: i18n.translate('observability.apm.slo.overviewPanel.state.breached', {
      defaultMessage: 'Breached',
    }),
    color: euiThemeVars.euiColorDanger,
  },
  warning: {
    label: i18n.translate('observability.apm.slo.overviewPanel.state.warning', {
      defaultMessage: 'Warning',
    }),
    color: euiThemeVars.euiColorWarning,
  },
  ok: {
    label: i18n.translate('observability.apm.slo.overviewPanel.state.ok', {
      defaultMessage: 'Healthy',
    }),
    color: euiThemeVars.euiColorSuccess,
  },
  no_data: {
    label: i18n.translate('observability.apm.slo.overviewPanel.state.noData', {
      defaultMessage: 'No data',
    }),
    color: euiThemeVars.euiColorMediumShade,
  },
  source_idle: {
    label: i18n.translate('observability.apm.slo.overviewPanel.state.sourceIdle', {
      defaultMessage: 'Source idle',
    }),
    color: euiThemeVars.euiColorMediumShade,
  },
  stale: {
    label: i18n.translate('observability.apm.slo.overviewPanel.state.stale', {
      defaultMessage: 'Stale',
    }),
    color: euiThemeVars.euiColorLightShade,
  },
  disabled: {
    label: i18n.translate('observability.apm.slo.overviewPanel.state.disabled', {
      defaultMessage: 'Disabled',
    }),
    color: euiThemeVars.euiColorDarkShade,
  },
  rules_missing: {
    label: i18n.translate('observability.apm.slo.overviewPanel.state.rulesMissing', {
      defaultMessage: 'Rules missing',
    }),
    color: euiThemeVars.euiColorDanger,
  },
};

/** Pick the worst objective's error-budget remaining for leaderboard ranking. */
function worstBudgetRemaining(summary: SloSummary): number {
  const objectives = summary.status.objectives;
  if (!objectives || objectives.length === 0) return 1;
  return objectives.reduce((acc, o) => Math.min(acc, o.errorBudgetRemaining), 1);
}

/** True iff this SLO is actually producing samples — not no-data and not disabled. */
function isReporting(summary: SloSummary): boolean {
  const state = summary.status.state;
  return (
    state !== 'no_data' && state !== 'source_idle' && state !== 'stale' && state !== 'disabled'
  );
}

/**
 * Color the aggregate-budget tile by how much headroom is left — this is the
 * first thing an operator sees on the page, so the gradient has to match the
 * same success/warning/danger thresholds used on the listing's budget column.
 */
function aggregateBudgetAccent(avgRemaining: number): string {
  if (avgRemaining >= 0.8) return euiThemeVars.euiColorSuccess;
  if (avgRemaining >= 0.4) return euiThemeVars.euiColorWarning;
  return euiThemeVars.euiColorDanger;
}

/** Compact budget bar used inside at-risk chips. */
const MiniBudgetBar: React.FC<{ remaining: number }> = ({ remaining }) => {
  const consumed = Math.max(0, 1 - remaining);
  const consumedPct = Math.min(100, consumed * 100);
  const overBudget = remaining < 0;
  return (
    <div
      style={{
        position: 'relative',
        height: 3,
        background: euiThemeVars.euiColorLightestShade,
        borderRadius: 2,
        overflow: 'hidden',
        width: '100%',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: `${consumedPct}%`,
          background: overBudget ? euiThemeVars.euiColorDanger : euiThemeVars.euiColorWarning,
        }}
      />
    </div>
  );
};

/**
 * Dense KPI tile. Single line: big number over small label, with a narrow
 * colored rail on the left to signal severity. Clicking toggles a state
 * filter; the active tile gets a tinted background.
 */
const KpiCell: React.FC<{
  value: React.ReactNode;
  label: string;
  accent: string;
  tooltip?: string;
  onClick?: () => void;
  active?: boolean;
  dataTestSubj?: string;
}> = ({ value, label, accent, tooltip, onClick, active, dataTestSubj }) => {
  const clickable = Boolean(onClick);
  const content = (
    <div
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (!clickable) return;
        if (e.key === 'Enter' || e.key === ' ') onClick?.();
      }}
      data-test-subj={dataTestSubj}
      style={{
        display: 'flex',
        alignItems: 'stretch',
        gap: 6,
        padding: '4px 8px',
        borderRadius: 3,
        cursor: clickable ? 'pointer' : 'default',
        background: active ? euiThemeVars.euiColorLightestShade : 'transparent',
        outline: active ? `1px solid ${euiThemeVars.euiColorPrimary}` : 'none',
        minWidth: 72,
      }}
    >
      <span
        style={{
          width: 3,
          borderRadius: 2,
          background: accent,
          flexShrink: 0,
        }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span
          style={{
            fontSize: 16,
            fontWeight: 600,
            lineHeight: 1.1,
            color: accent,
          }}
        >
          {value}
        </span>
        <span
          style={{
            fontSize: 10,
            color: euiThemeVars.euiColorDarkShade,
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </span>
      </div>
    </div>
  );
  return tooltip ? <EuiToolTip content={tooltip}>{content}</EuiToolTip> : content;
};

interface HealthCounts {
  breached: number;
  warning: number;
  ok: number;
  noData: number;
  disabled: number;
}

/**
 * CSS-only stacked bar that replaces the donut. Each segment is a flex child
 * with width = share-of-total %; segments with 0 count collapse out entirely
 * so the rail stays clean on small fleets. Labels live under the rail as a
 * wrap-friendly inline legend — no echarts centering / label-collision math
 * to worry about.
 */
const HealthRail: React.FC<{
  counts: HealthCounts;
  total: number;
  activeStateFilter?: SloHealthState | 'firing' | null;
  onStateFilterChange?: (filter: SloHealthState | 'firing' | null) => void;
}> = ({ counts, total, activeStateFilter, onStateFilterChange }) => {
  const segments = [
    { key: 'breached' as SloHealthState, value: counts.breached },
    { key: 'warning' as SloHealthState, value: counts.warning },
    { key: 'ok' as SloHealthState, value: counts.ok },
    { key: 'no_data' as SloHealthState, value: counts.noData },
    { key: 'disabled' as SloHealthState, value: counts.disabled },
  ];
  const nonEmpty = segments.filter((s) => s.value > 0);
  const denom = Math.max(1, total);
  const clickable = Boolean(onStateFilterChange);

  return (
    <div
      data-test-subj="slosOverviewHealthRail"
      style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}
    >
      <span
        style={{
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: 0.4,
          color: euiThemeVars.euiColorDarkShade,
        }}
      >
        {i18n.translate('observability.apm.slo.overviewPanel.healthMixLabel', {
          defaultMessage: 'Health mix · {total, plural, one {# SLO} other {# SLOs}}',
          values: { total },
        })}
      </span>
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: 10,
          borderRadius: 5,
          overflow: 'hidden',
          background: euiThemeVars.euiColorLightestShade,
        }}
      >
        {nonEmpty.map((s) => {
          const pct = (s.value / denom) * 100;
          const active = activeStateFilter === s.key;
          const dimmed = activeStateFilter && !active;
          const label = i18n.translate(
            'observability.apm.slo.overviewPanel.healthRailSegmentLabel',
            {
              defaultMessage: '{state}: {value} ({pct}%)',
              values: {
                state: STATE_DISPLAY[s.key].label,
                value: s.value,
                pct: Math.round(pct),
              },
            }
          );
          // Native title rather than EuiToolTip — the tooltip's inline-block
          // wrapper becomes the flex child and eats the `flex-grow: pct` we
          // set on the button, so segment widths collapse to the button
          // min-width and the rail looks dominantly grey.
          return (
            <button
              key={s.key}
              type="button"
              disabled={!clickable}
              aria-pressed={active}
              aria-label={label}
              title={label}
              onClick={() => onStateFilterChange?.(activeStateFilter === s.key ? null : s.key)}
              data-test-subj={`slosOverviewRailSegment-${s.key}`}
              style={{
                flex: `${pct} 0 0`,
                minWidth: 6,
                height: '100%',
                padding: 0,
                border: 'none',
                background: STATE_DISPLAY[s.key].color,
                opacity: dimmed ? 0.35 : 1,
                cursor: clickable ? 'pointer' : 'default',
                transition: 'opacity 120ms ease',
              }}
            />
          );
        })}
      </div>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          columnGap: 10,
          rowGap: 2,
          fontSize: 10,
          lineHeight: 1.3,
          color: euiThemeVars.euiColorDarkShade,
        }}
      >
        {segments.map((s) => (
          <span key={s.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 1,
                background: STATE_DISPLAY[s.key].color,
                flexShrink: 0,
              }}
            />
            <strong style={{ color: euiThemeVars.euiTextColor, fontSize: 11 }}>{s.value}</strong>
            <span>{STATE_DISPLAY[s.key].label}</span>
          </span>
        ))}
      </div>
    </div>
  );
};

export const SloOverviewPanel: React.FC<SloOverviewPanelProps> = ({
  items,
  activeStateFilter,
  onStateFilterChange,
}) => {
  const stats = useMemo(() => {
    let breached = 0;
    let warning = 0;
    let ok = 0;
    let noData = 0;
    let disabled = 0;
    let firing = 0;
    let reportingCount = 0;
    let budgetSum = 0;
    for (const s of items) {
      firing += s.status.firingCount;
      switch (s.status.state) {
        case 'breached':
          breached++;
          break;
        case 'warning':
          warning++;
          break;
        case 'ok':
          ok++;
          break;
        case 'disabled':
          disabled++;
          break;
        case 'no_data':
        case 'source_idle':
        case 'stale':
          noData++;
          break;
      }
      if (isReporting(s)) {
        // Weight each SLO equally; the worst-objective budget is the one
        // users already see in the listing, so reuse it as the contribution.
        reportingCount++;
        budgetSum += worstBudgetRemaining(s);
      }
    }
    const avgBudgetRemaining = reportingCount > 0 ? budgetSum / reportingCount : NaN;
    return {
      total: items.length,
      breached,
      warning,
      ok,
      noData,
      disabled,
      firing,
      reportingCount,
      avgBudgetRemaining,
    };
  }, [items]);

  /**
   * At-risk chips — the 3 reporting SLOs with the worst error-budget remaining.
   * No-data SLOs are intentionally excluded here; the KPI tiles + rail already
   * surface them, and showing "100% because it hasn't measured yet" as the
   * top at-risk entry is misleading on a fresh dev cluster.
   *
   * `anyAtRisk` is true when at least one reporting SLO has < 75% budget left;
   * below that bar the leaderboard collapses to a subdued all-green line so a
   * fresh cluster doesn't claim "worst first" under a row of 100%s. The 0.75
   * threshold sits safely above the `< 0.25 → critical` band already used in
   * the listing budget column.
   */
  const atRisk = useMemo(() => {
    const CHIP_COUNT = 3;
    const AT_RISK_THRESHOLD = 0.75;
    const rows = items
      .filter((s) => s.enabled && isReporting(s))
      .map((s) => ({ summary: s, remaining: worstBudgetRemaining(s) }))
      .sort((a, b) => a.remaining - b.remaining || a.summary.name.localeCompare(b.summary.name));
    return {
      shown: rows.slice(0, CHIP_COUNT),
      totalBurning: rows.filter((r) => r.remaining < 0.25).length,
      anyAtRisk: rows.some((r) => r.remaining < AT_RISK_THRESHOLD),
      hasReporting: rows.length > 0,
    };
  }, [items]);

  if (items.length === 0) return null;

  const toggle = (next: SloHealthState | 'firing' | null): (() => void) | undefined =>
    onStateFilterChange
      ? () => onStateFilterChange(activeStateFilter === next ? null : next)
      : undefined;

  const divider = (
    <div
      aria-hidden
      style={{
        width: 1,
        alignSelf: 'stretch',
        background: euiThemeVars.euiColorLightShade,
        margin: '0 4px',
      }}
    />
  );

  return (
    <EuiPanel paddingSize="s" data-test-subj="slosOverviewPanel">
      {/* Header: title on the left, clear-filter on the right */}
      <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
        <EuiFlexItem>
          <EuiText size="s">
            <h4 style={{ margin: 0 }}>
              {i18n.translate('observability.apm.slo.overviewPanel.heading', {
                defaultMessage: 'SLO health overview',
              })}
            </h4>
          </EuiText>
        </EuiFlexItem>
        {activeStateFilter && onStateFilterChange && (
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty
              size="xs"
              iconType="cross"
              onClick={() => onStateFilterChange(null)}
              data-test-subj="slosOverviewClearFilter"
            >
              {i18n.translate('observability.apm.slo.overviewPanel.clearFilter', {
                defaultMessage: 'Clear filter',
              })}
            </EuiButtonEmpty>
          </EuiFlexItem>
        )}
      </EuiFlexGroup>

      {/* Single horizontal strip: tiles | rail | at-risk. Zones flex-wrap on
          narrow viewports so nothing gets clipped. */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 8,
          marginTop: 6,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 2,
            // Size to content so the rail + at-risk absorb the remaining row
            // width on wide viewports. `1 1 auto` here caused the KPI group to
            // greedily consume whitespace and push siblings to a second row
            // at ≥1920 px — fixed by letting only the two data-dense zones grow.
            flex: '0 1 auto',
          }}
        >
          <KpiCell
            value={
              stats.reportingCount > 0 ? (
                <span style={TABULAR_NUMS_STYLE}>
                  {formatPct(stats.avgBudgetRemaining, { decimals: SLO_PRECISION.budget })}
                </span>
              ) : (
                '—'
              )
            }
            label={
              stats.reportingCount > 0
                ? i18n.translate('observability.apm.slo.overviewPanel.kpi.aggregateBudget', {
                    defaultMessage: 'Aggregate budget',
                  })
                : i18n.translate('observability.apm.slo.overviewPanel.kpi.noReportingSlos', {
                    defaultMessage: 'No reporting SLOs',
                  })
            }
            accent={
              stats.reportingCount > 0
                ? aggregateBudgetAccent(stats.avgBudgetRemaining)
                : euiThemeVars.euiColorMediumShade
            }
            tooltip={i18n.translate('observability.apm.slo.overviewPanel.kpi.aggregateTooltip', {
              defaultMessage:
                'Weighted-average error budget remaining across SLOs that are reporting samples ({reporting} of {total}).',
              values: { reporting: stats.reportingCount, total: stats.total },
            })}
            dataTestSubj="slosOverviewBudget"
          />
          <KpiCell
            value={stats.breached}
            label={i18n.translate('observability.apm.slo.overviewPanel.kpi.breachedLabel', {
              defaultMessage: 'Breached',
            })}
            accent={STATE_DISPLAY.breached.color}
            tooltip={i18n.translate('observability.apm.slo.overviewPanel.kpi.breachedTooltip', {
              defaultMessage: 'SLOs where error ratio exceeded the budget',
            })}
            onClick={toggle('breached')}
            active={activeStateFilter === 'breached'}
            dataTestSubj="slosOverviewBreached"
          />
          <KpiCell
            value={stats.warning}
            label={i18n.translate('observability.apm.slo.overviewPanel.kpi.warningLabel', {
              defaultMessage: 'Warning',
            })}
            accent={STATE_DISPLAY.warning.color}
            tooltip={i18n.translate('observability.apm.slo.overviewPanel.kpi.warningTooltip', {
              defaultMessage: 'SLOs where short-window burn has tripped a warning tier',
            })}
            onClick={toggle('warning')}
            active={activeStateFilter === 'warning'}
            dataTestSubj="slosOverviewWarning"
          />
          <KpiCell
            value={stats.ok}
            label={i18n.translate('observability.apm.slo.overviewPanel.kpi.healthyLabel', {
              defaultMessage: 'Healthy',
            })}
            accent={STATE_DISPLAY.ok.color}
            tooltip={i18n.translate('observability.apm.slo.overviewPanel.kpi.healthyTooltip', {
              defaultMessage: 'SLOs meeting their objective',
            })}
            onClick={toggle('ok')}
            active={activeStateFilter === 'ok'}
            dataTestSubj="slosOverviewOk"
          />
          <KpiCell
            value={stats.firing}
            label={i18n.translate('observability.apm.slo.overviewPanel.kpi.firingLabel', {
              defaultMessage: 'Firing',
            })}
            accent={
              stats.firing > 0 ? euiThemeVars.euiColorDanger : euiThemeVars.euiColorMediumShade
            }
            tooltip={i18n.translate('observability.apm.slo.overviewPanel.kpi.firingTooltip', {
              defaultMessage: 'Total MWMBR burn-rate alerts currently firing',
            })}
            onClick={toggle('firing')}
            active={activeStateFilter === 'firing'}
            dataTestSubj="slosOverviewFiring"
          />
          <KpiCell
            value={stats.noData + stats.disabled}
            label={i18n.translate('observability.apm.slo.overviewPanel.kpi.noDataDisabledLabel', {
              defaultMessage: 'No data / disabled',
            })}
            accent={euiThemeVars.euiColorMediumShade}
            tooltip={i18n.translate(
              'observability.apm.slo.overviewPanel.kpi.noDataDisabledTooltip',
              { defaultMessage: 'SLOs with no recent samples or explicitly disabled' }
            )}
            onClick={toggle('no_data')}
            active={activeStateFilter === 'no_data'}
            dataTestSubj="slosOverviewNoData"
          />
        </div>

        {divider}

        <div style={{ flex: '1 1 220px', minWidth: 200 }}>
          <HealthRail
            counts={{
              breached: stats.breached,
              warning: stats.warning,
              ok: stats.ok,
              noData: stats.noData,
              disabled: stats.disabled,
            }}
            total={stats.total}
            activeStateFilter={activeStateFilter}
            onStateFilterChange={onStateFilterChange}
          />
        </div>

        {divider}

        <div
          data-test-subj="slosOverviewAtRisk"
          style={{
            flex: '1 1 260px',
            minWidth: 220,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <span
            style={{
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: 0.4,
              color: euiThemeVars.euiColorDarkShade,
            }}
          >
            {atRisk.hasReporting && !atRisk.anyAtRisk
              ? i18n.translate('observability.apm.slo.overviewPanel.atRisk.titleAllGreen', {
                  defaultMessage: 'Error budget',
                })
              : i18n.translate('observability.apm.slo.overviewPanel.atRisk.titleAtRisk', {
                  defaultMessage: 'At risk · worst error budget first',
                })}
          </span>
          {atRisk.shown.length === 0 ? (
            <EuiText size="xs" color="subdued">
              {i18n.translate('observability.apm.slo.overviewPanel.atRisk.noReporting', {
                defaultMessage: 'No reporting SLOs.',
              })}
            </EuiText>
          ) : !atRisk.anyAtRisk ? (
            // Fallback when every reporting SLO has ≥75% budget — otherwise the
            // leaderboard would sit under a "worst first" caption showing a row
            // of 100%s, which reads as a ranking when there's nothing to rank.
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: 2 }}
              data-test-subj="slosOverviewAtRiskAllGreen"
            >
              <EuiText size="xs" color="subdued">
                {i18n.translate('observability.apm.slo.overviewPanel.atRisk.allGreen', {
                  defaultMessage: 'All reporting SLOs have >75% budget remaining.',
                })}
              </EuiText>
              {/*
                Lands on `#/slos` which now defaults to worst-budget-first
                (P1 #7). No explicit sort param needed; left plain so an
                already-filtered listing URL isn't clobbered if a user lands
                here mid-filter.
              */}
              <EuiLink
                href="#/slos"
                style={{ fontSize: 11, alignSelf: 'flex-start' }}
                data-test-subj="slosOverviewAtRiskViewByBudget"
              >
                {i18n.translate('observability.apm.slo.overviewPanel.atRisk.viewByBudget', {
                  defaultMessage: 'View by remaining budget',
                })}
              </EuiLink>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {atRisk.shown.map(({ summary: s, remaining }) => {
                const overBudget = remaining <= 0;
                const critical = remaining < 0.25;
                const color = overBudget
                  ? euiThemeVars.euiColorDangerText
                  : critical
                  ? euiThemeVars.euiColorAccentText
                  : euiThemeVars.euiColorSuccessText;
                return (
                  <div
                    key={s.id}
                    data-test-subj={`slosOverviewLeaderboardRow-reporting-${s.id}`}
                    style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        minWidth: 0,
                      }}
                    >
                      <EuiLink
                        href={`#/slos/${encodeURIComponent(s.id)}`}
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          flex: '1 1 auto',
                          minWidth: 0,
                        }}
                      >
                        {s.name}
                      </EuiLink>
                      {s.status.firingCount > 0 && (
                        <EuiToolTip
                          content={i18n.translate(
                            'observability.apm.slo.overviewPanel.atRisk.firingTooltip',
                            {
                              defaultMessage:
                                '{count, plural, one {# alert firing} other {# alerts firing}}',
                              values: { count: s.status.firingCount },
                            }
                          )}
                        >
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 2,
                              color: euiThemeVars.euiColorDangerText,
                              fontSize: 10,
                              flexShrink: 0,
                            }}
                          >
                            <EuiIcon type="bell" size="s" /> {s.status.firingCount}
                          </span>
                        </EuiToolTip>
                      )}
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color,
                          flexShrink: 0,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {overBudget
                          ? i18n.translate('observability.apm.slo.overviewPanel.atRisk.over', {
                              defaultMessage: 'over',
                            })
                          : `${Math.round(Math.max(0, remaining) * 100)}%`}
                      </span>
                    </div>
                    <MiniBudgetBar remaining={remaining} />
                  </div>
                );
              })}
              {atRisk.totalBurning > atRisk.shown.length && (
                <EuiLink
                  onClick={() => onStateFilterChange?.('breached')}
                  data-test-subj="slosOverviewAtRiskMore"
                  style={{ fontSize: 11, alignSelf: 'flex-start' }}
                >
                  {i18n.translate('observability.apm.slo.overviewPanel.atRisk.moreBurning', {
                    defaultMessage: '+{count} more burning budget',
                    values: { count: atRisk.totalBurning - atRisk.shown.length },
                  })}
                </EuiLink>
              )}
            </div>
          )}
        </div>
      </div>
    </EuiPanel>
  );
};

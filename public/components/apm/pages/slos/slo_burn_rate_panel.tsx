/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Burn-rate matrix for an SLO objective.
 *
 * Renders one card per MWMBR tier (PageQuick / PageSlow / TicketQuick / TicketSlow)
 * showing the short- and long-window error ratios alongside the threshold that
 * would fire the alert. Matches the rule generator so operators can reconcile
 * "why is alert X firing?" or "which tier is closest?" without leaving the page.
 *
 * Inline PromQL is used (rather than the generated recording rule names) so the
 * panel lights up immediately on services whose raw metrics are scraped, even
 * before the ruler has evaluated the SLO rules.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiHealth,
  EuiLink,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';
import { euiThemeVars } from '@osd/ui-shared-deps/theme';
import { i18n } from '@osd/i18n';
import { usePromQLChartData } from '../../shared/hooks/use_promql_chart_data';
import { TimeRange } from '../../common/types/service_types';
import type { BurnRateConfig, Objective, SloDocument } from '../../../../../common/slo/slo_types';
import { buildErrorRatioExprForWindow } from './slo_query_builders';
import { coreRefs } from '../../../../framework/core_refs';
import { observabilityAlertingID } from '../../../../../common/constants/shared';

export interface SloBurnRatePanelProps {
  slo: SloDocument;
  objective: Objective;
  prometheusConnectionId: string;
  timeRange: TimeRange;
  refreshTrigger: number;
  /**
   * Callback fired when a tier card asks the user to "view generated rules".
   * The detail page opens its Advanced-details accordion and scrolls to it.
   * When undefined, the link is not rendered — keeps the panel usable in
   * embedding contexts that don't own an accordion (e.g. storybook).
   */
  onViewRulesRequest?: () => void;
}

/** Friendly labels for the four default MWMBR tiers, in index order. */
const TIER_LABELS = [
  i18n.translate('observability.apm.slo.burnRatePanel.tier.pageQuick', {
    defaultMessage: 'Page · Quick',
  }),
  i18n.translate('observability.apm.slo.burnRatePanel.tier.pageSlow', {
    defaultMessage: 'Page · Slow',
  }),
  i18n.translate('observability.apm.slo.burnRatePanel.tier.ticketQuick', {
    defaultMessage: 'Ticket · Quick',
  }),
  i18n.translate('observability.apm.slo.burnRatePanel.tier.ticketSlow', {
    defaultMessage: 'Ticket · Slow',
  }),
] as const;

function formatPct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  if (Math.abs(value) < 0.0001) return '0%';
  return `${(value * 100).toFixed(3).replace(/\.?0+$/, '')}%`;
}

function formatMultiplier(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}x` : `${rounded.toFixed(1)}x`;
}

/**
 * Health of a single tier:
 *  - `firing`   — BOTH windows exceed the threshold (mirrors the alert
 *    expression `short > t AND long > t`).
 *  - `at_risk`  — exactly one window exceeds; the `and` prevents the alert from
 *    firing yet, but the tier is trending toward it.
 *  - `ok`       — both windows are under the threshold.
 *  - `no_data`  — at least one window has no (finite) sample. This MUST NOT read
 *    as healthy: absent data is not the same as a passing check.
 */
export type TierHealth = 'firing' | 'at_risk' | 'ok' | 'no_data';

/** A window value is usable only when it's a finite number. */
function isMissingWindow(value: number | null | undefined): boolean {
  return value === null || value === undefined || !Number.isFinite(value);
}

export function classifyTier(
  short: number | null,
  long: number | null,
  threshold: number
): TierHealth {
  // A missing window can never be coerced to 0 → "ok" → green. If either
  // window is absent we genuinely don't know the tier's health.
  if (isMissingWindow(short) || isMissingWindow(long)) return 'no_data';
  const s = short as number;
  const l = long as number;
  if (s > threshold && l > threshold) return 'firing';
  if (s > threshold || l > threshold) return 'at_risk';
  return 'ok';
}

export function healthColor(h: TierHealth): string {
  switch (h) {
    case 'firing':
      return 'danger';
    case 'at_risk':
      return 'warning';
    case 'ok':
      return 'success';
    default:
      // no_data — subdued/grey, never green.
      return 'subdued';
  }
}

export function healthLabel(h: TierHealth): string {
  switch (h) {
    case 'firing':
      return i18n.translate('observability.apm.slo.burnRatePanel.health.firing', {
        defaultMessage: 'Firing',
      });
    case 'at_risk':
      return i18n.translate('observability.apm.slo.burnRatePanel.health.atRisk', {
        defaultMessage: 'At risk',
      });
    case 'ok':
      return i18n.translate('observability.apm.slo.burnRatePanel.health.healthy', {
        defaultMessage: 'Healthy',
      });
    default:
      return i18n.translate('observability.apm.slo.burnRatePanel.health.noData', {
        defaultMessage: 'No data',
      });
  }
}

/**
 * Map a raw burn-rate severity token to a user-facing label. Severity is an
 * open string (orgs use critical/warning, page/ticket, sev1..sev4), so unknown
 * values fall through to the raw token rather than being dropped.
 */
export function severityLabel(severity: string): string {
  switch (severity.toLowerCase()) {
    case 'critical':
      return i18n.translate('observability.apm.slo.burnRatePanel.severity.critical', {
        defaultMessage: 'Critical',
      });
    case 'warning':
      return i18n.translate('observability.apm.slo.burnRatePanel.severity.warning', {
        defaultMessage: 'Warning',
      });
    case 'page':
      return i18n.translate('observability.apm.slo.burnRatePanel.severity.page', {
        defaultMessage: 'Page',
      });
    case 'ticket':
      return i18n.translate('observability.apm.slo.burnRatePanel.severity.ticket', {
        defaultMessage: 'Ticket',
      });
    default:
      return severity;
  }
}

/**
 * Horizontal bar visualising `ratio / threshold`. Caps at 150% so an extreme
 * burst doesn't make the other tiers illegible.
 */
const BurnBar: React.FC<{ ratio: number | null; threshold: number }> = ({ ratio, threshold }) => {
  const pct =
    ratio === null || !Number.isFinite(ratio) || threshold <= 0
      ? 0
      : Math.min(150, (ratio / threshold) * 100);
  const thresholdPct = Math.min(100, (threshold / (threshold * 1.5)) * 100); // always 66.6%
  const exceeded = ratio !== null && ratio > threshold;
  const fillColor = exceeded ? euiThemeVars.euiColorDanger : euiThemeVars.euiColorSuccess;
  // WCAG 1.4.1: the exceeded (danger) fill also carries a diagonal hatch so it's
  // distinguishable from the healthy fill without relying on the red/green hue.
  const exceededTexture = `repeating-linear-gradient(45deg, rgba(255,255,255,0.45) 0, rgba(255,255,255,0.45) 2px, transparent 2px, transparent 4px)`;

  return (
    <div
      style={{
        position: 'relative',
        height: 6,
        background: euiThemeVars.euiColorLightestShade,
        borderRadius: 3,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: `${Math.min(100, pct / 1.5)}%`,
          height: '100%',
          background: fillColor,
          backgroundImage: exceeded ? exceededTexture : undefined,
          transition: 'width 200ms ease',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: `${thresholdPct}%`,
          top: -2,
          bottom: -2,
          width: 1,
          background: euiThemeVars.euiColorMediumShade,
        }}
      />
    </div>
  );
};

interface TierCardProps {
  tier: BurnRateConfig;
  label: string;
  threshold: number;
  slo: SloDocument;
  objective: Objective;
  prometheusConnectionId: string;
  timeRange: TimeRange;
  refreshTrigger: number;
  /**
   * When true AND this tier has no samples yet, collapse the short/long/for
   * readout into a single waiting-for-data block with a "view generated
   * rules" affordance. Only applied by the parent when ≥2 tiers are no_data
   * so we don't visually isolate a single card.
   */
  collapseWhenNoData: boolean;
  onViewRulesRequest?: () => void;
  /**
   * Stable key passed back to the parent on every health change so it can
   * bucket tiers without the TierCard having to know how the parent indexes
   * them.
   */
  reportKey: string;
  /**
   * Reports tier health back to the parent so it can decide whether enough
   * tiers are in no_data to justify collapsing them into the waiting-for-data
   * layout.
   */
  onHealthChange: (key: string, health: TierHealth) => void;
}

/**
 * One tier card. Fetches the short-window and long-window error ratios
 * separately (two lightweight scalar queries) so the cards update independently
 * and a slow long-window query doesn't block the page.
 */
const TierCard: React.FC<TierCardProps> = ({
  tier,
  label,
  threshold,
  slo,
  objective,
  prometheusConnectionId,
  timeRange,
  refreshTrigger,
  collapseWhenNoData,
  onViewRulesRequest,
  reportKey,
  onHealthChange,
}) => {
  const shortQuery = useMemo(
    () => buildErrorRatioExprForWindow(slo, objective, tier.shortWindow),
    [slo, objective, tier.shortWindow]
  );
  const longQuery = useMemo(
    () => buildErrorRatioExprForWindow(slo, objective, tier.longWindow),
    [slo, objective, tier.longWindow]
  );

  const shortData = usePromQLChartData({
    promqlQuery: shortQuery ?? '',
    timeRange,
    prometheusConnectionId,
    refreshTrigger,
    enabled: Boolean(shortQuery),
  });
  const longData = usePromQLChartData({
    promqlQuery: longQuery ?? '',
    timeRange,
    prometheusConnectionId,
    refreshTrigger,
    enabled: Boolean(longQuery),
  });

  const short = shortData.latestValue;
  const long = longData.latestValue;
  const health = classifyTier(short, long, threshold);
  const loading = shortData.isLoading || longData.isLoading;

  useEffect(() => {
    onHealthChange(reportKey, health);
  }, [reportKey, health, onHealthChange]);

  const waiting = collapseWhenNoData && health === 'no_data' && !loading;

  // Deep-link into Alert Manager filtered to this SLO's `slo_id` + this
  // tier's `slo_burn_rate_multiplier` so operators land on the single rule
  // that corresponds to this card. Gated on `createAlarm` (tier deploys an
  // alerting rule) AND `mode !== 'shadow'` (shadow SLOs skip alert rules
  // entirely). `tier.burnRateMultiplier` is matched against the label as
  // written by the rule generator — integers render as "14", decimals as
  // "14.4", etc. (see common/slo/slo_promql_generator.ts).
  //
  // The alarms page parses `?q=…` from the hash and seeds MonitorsTable's
  // search box (alarms_page.tsx :: parseAlarmsHashRoute). matchesSearch
  // splits the query on whitespace and treats each `label:value` term as
  // an AND predicate against `rule.labels`, so we land on the single
  // burn-rate rule for this tier rather than the whole SLO's rule list.
  const deployAlarm = tier.createAlarm && slo.spec.mode !== 'shadow';
  const handleViewInAlertManager = () => {
    const q = `slo_id:${slo.id} slo_burn_rate_multiplier:${tier.burnRateMultiplier}`;
    const params = new URLSearchParams({ q });
    coreRefs?.application?.navigateToApp(observabilityAlertingID, {
      path: `#/rules?${params.toString()}`,
    });
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  };

  return (
    <EuiPanel
      paddingSize="s"
      hasBorder
      hasShadow={false}
      data-test-subj={`slosBurnrateTier-${tier.severity}-${tier.shortWindow}-${tier.longWindow}`}
    >
      <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
        <EuiFlexItem>
          <EuiText size="s">
            <strong>{label}</strong>
          </EuiText>
          <EuiText size="xs" color="subdued">
            {i18n.translate('observability.apm.slo.burnRatePanel.tierSubtitle', {
              defaultMessage: '{multiplier} burn · {severity}',
              values: {
                multiplier: formatMultiplier(tier.burnRateMultiplier),
                severity: severityLabel(tier.severity),
              },
            })}
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiHealth color={healthColor(health)}>{healthLabel(health)}</EuiHealth>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="s" />

      {waiting ? (
        <div data-test-subj="slosBurnrateTierWaiting">
          <EuiText size="xs" color="subdued">
            {i18n.translate('observability.apm.slo.burnRatePanel.waitingForSamples', {
              defaultMessage: 'Waiting for Prometheus samples · evaluates every 1m.',
            })}
          </EuiText>
          {onViewRulesRequest && (
            <>
              <EuiSpacer size="xs" />
              <EuiLink
                onClick={onViewRulesRequest}
                data-test-subj="slosBurnrateTierWaitingViewRules"
              >
                {i18n.translate('observability.apm.slo.burnRatePanel.viewGeneratedRules', {
                  defaultMessage: 'View generated rules',
                })}
              </EuiLink>
            </>
          )}
        </div>
      ) : (
        <>
          <EuiFlexGroup gutterSize="m" alignItems="center" responsive={false}>
            <EuiFlexItem>
              <EuiText size="xs" color="subdued">
                {i18n.translate('observability.apm.slo.burnRatePanel.shortWindow', {
                  defaultMessage: 'short ({window})',
                  values: { window: tier.shortWindow },
                })}
              </EuiText>
              <EuiText size="s">
                <strong
                  style={{
                    color:
                      short !== null && short > threshold ? euiThemeVars.euiColorDanger : undefined,
                  }}
                >
                  {loading ? '…' : formatPct(short)}
                </strong>
              </EuiText>
              <EuiSpacer size="xs" />
              <BurnBar ratio={short} threshold={threshold} />
            </EuiFlexItem>
            <EuiFlexItem>
              <EuiText size="xs" color="subdued">
                {i18n.translate('observability.apm.slo.burnRatePanel.longWindow', {
                  defaultMessage: 'long ({window})',
                  values: { window: tier.longWindow },
                })}
              </EuiText>
              <EuiText size="s">
                <strong
                  style={{
                    color:
                      long !== null && long > threshold ? euiThemeVars.euiColorDanger : undefined,
                  }}
                >
                  {loading ? '…' : formatPct(long)}
                </strong>
              </EuiText>
              <EuiSpacer size="xs" />
              <BurnBar ratio={long} threshold={threshold} />
            </EuiFlexItem>
          </EuiFlexGroup>

          <EuiSpacer size="xs" />
          <EuiToolTip
            content={i18n.translate('observability.apm.slo.burnRatePanel.thresholdTooltip', {
              defaultMessage:
                'Fires when BOTH windows exceed {threshold} (burn rate × error budget). For: {forDuration}.',
              values: {
                threshold: formatPct(threshold),
                forDuration: tier.forDuration,
              },
            })}
          >
            <EuiText size="xs" color="subdued">
              {i18n.translate('observability.apm.slo.burnRatePanel.thresholdSummary', {
                defaultMessage: 'threshold {threshold} · for {forDuration}',
                values: {
                  threshold: formatPct(threshold),
                  forDuration: tier.forDuration,
                },
              })}
            </EuiText>
          </EuiToolTip>
          {deployAlarm && (
            <>
              <EuiSpacer size="xs" />
              <EuiLink
                onClick={handleViewInAlertManager}
                data-test-subj={`slosBurnrateTierViewInAlertManager-${tier.shortWindow}-${tier.longWindow}`}
              >
                {i18n.translate('observability.apm.slo.burnRatePanel.viewInAlertManager', {
                  defaultMessage: 'View in Alert Manager ↗',
                })}
              </EuiLink>
            </>
          )}
        </>
      )}
    </EuiPanel>
  );
};

export const SloBurnRatePanel: React.FC<SloBurnRatePanelProps> = ({
  slo,
  objective,
  prometheusConnectionId,
  timeRange,
  refreshTrigger,
  onViewRulesRequest,
}) => {
  const tiers = slo.spec.alerting.strategy === 'mwmbr' ? slo.spec.alerting.burnRates : [];
  const errorBudget = 1 - objective.target;

  // Each tier card reports its health up here so we can decide whether to
  // collapse no_data tiers into the inline waiting state. Keyed by the
  // tier's (short, long) pair — unique per tier in P0 since the wizard
  // rejects duplicates.
  const [tierHealths, setTierHealths] = useState<Record<string, TierHealth>>({});
  const handleHealthChange = useCallback((key: string, health: TierHealth) => {
    setTierHealths((prev) => (prev[key] === health ? prev : { ...prev, [key]: health }));
  }, []);

  if (tiers.length === 0) {
    return null;
  }

  const noDataCount = Object.values(tierHealths).filter((h) => h === 'no_data').length;
  const collapseWhenNoData = noDataCount >= 2;

  return (
    <EuiPanel data-test-subj="slosBurnratePanel">
      <EuiFlexGroup alignItems="center" gutterSize="s">
        <EuiFlexItem>
          <EuiText size="m">
            <h4>
              {i18n.translate('observability.apm.slo.burnRatePanel.heading', {
                defaultMessage: 'Burn-rate alerts',
              })}
            </h4>
          </EuiText>
          <EuiText size="xs" color="subdued">
            {i18n.translate('observability.apm.slo.burnRatePanel.description', {
              defaultMessage:
                'Each tier fires when its short- and long-window error ratios both exceed burn × budget (= {budget}). Mirrors the deployed MWMBR rules.',
              values: { budget: formatPct(errorBudget) },
            })}
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="s" />

      <EuiFlexGroup gutterSize="s" wrap>
        {tiers.map((tier, i) => {
          const threshold = tier.burnRateMultiplier * errorBudget;
          const label =
            TIER_LABELS[i] ??
            i18n.translate('observability.apm.slo.burnRatePanel.tierFallback', {
              defaultMessage: 'Tier {index}',
              values: { index: i + 1 },
            });
          const key = `${tier.shortWindow}-${tier.longWindow}`;
          return (
            <EuiFlexItem key={key} style={{ minWidth: 260 }}>
              <TierCard
                tier={tier}
                label={label}
                threshold={threshold}
                slo={slo}
                objective={objective}
                prometheusConnectionId={prometheusConnectionId}
                timeRange={timeRange}
                refreshTrigger={refreshTrigger}
                collapseWhenNoData={collapseWhenNoData}
                onViewRulesRequest={onViewRulesRequest}
                reportKey={key}
                onHealthChange={handleHealthChange}
              />
            </EuiFlexItem>
          );
        })}
      </EuiFlexGroup>
    </EuiPanel>
  );
};

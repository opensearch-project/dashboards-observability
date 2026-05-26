/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Probe SLI wizard control — explicit "dry-run this SLI against Prometheus"
 * button with an inline result panel. Answers the "does my PromQL match
 * data" question before the user commits the SLO and waits for the ruler to
 * report `no_data` minutes later.
 *
 * Fires only on click: probes hit the cluster (rate() + histogram ops are
 * not free) and auto-running on every keystroke would let a live query pass
 * for a typing user. State is preserved across keystrokes so editing after
 * a probe doesn't wipe the previous result.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  EuiButton,
  EuiCallOut,
  EuiCode,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiSelect,
  EuiSpacer,
  EuiStat,
  EuiText,
} from '@elastic/eui';
import { euiThemeVars } from '@osd/ui-shared-deps/theme';
import { i18n } from '@osd/i18n';
import type {
  ProbeSliLookback,
  ProbeSliRequest,
  ProbeSliResponse,
} from '../../../../../common/slo/slo_types';
import { formatPct } from '../../../../../common/slo/format';
import type { SloApiClient } from './slo_api_client';
import { MetricSparkline, MetricDataPoint } from '../../shared/components/metric_sparkline';

const LOOKBACK_OPTIONS: Array<{ value: ProbeSliLookback; text: string }> = [
  {
    value: '1h',
    text: i18n.translate('observability.apm.slo.wizard.probeSli.lookback1h', {
      defaultMessage: 'Last 1h',
    }),
  },
  {
    value: '24h',
    text: i18n.translate('observability.apm.slo.wizard.probeSli.lookback24h', {
      defaultMessage: 'Last 24h',
    }),
  },
  {
    value: '7d',
    text: i18n.translate('observability.apm.slo.wizard.probeSli.lookback7d', {
      defaultMessage: 'Last 7d',
    }),
  },
];

/** Minimum ms between successive probe clicks — shields the cluster from a
 *  click-happy user or an accidental double-fire. */
const DEBOUNCE_MS = 300;

export interface ProbeSliPanelProps {
  apiClient: Pick<SloApiClient, 'probeSli'>;
  /**
   * Resolved PromQL the ruler will deploy. `null` / empty = button disabled.
   * The caller (wizard) derives these via `buildProbeQueries()` so probes
   * match rules 1:1 — no separate substitution here.
   */
  goodQuery: string | null;
  totalQuery: string | null;
  datasourceId: string;
}

interface ProbeState {
  status: 'idle' | 'loading' | 'success' | 'error';
  response?: ProbeSliResponse;
  /** Top-level request/transport error — distinct from per-query errors. */
  error?: string;
  /** Lookback that produced the rendered response; lets the user tell "I
   *  re-ran at 7d" vs "stale 1h result". */
  lookback?: ProbeSliLookback;
}

function formatCount(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return '—';
  // Large values → compact; small values keep full precision.
  if (Math.abs(value) >= 1000) {
    return Intl.NumberFormat(undefined, {
      notation: 'compact',
      maximumFractionDigits: 2,
    }).format(value);
  }
  return Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

/** Ratio color matches the detail page's events-stat scheme (commit da3fc593):
 *  >= 99% primary, >= 95% accent, anything lower is danger. */
function ratioColor(ratio: number | undefined): 'primary' | 'accent' | 'danger' | 'subdued' {
  if (ratio === undefined || !Number.isFinite(ratio)) return 'subdued';
  if (ratio >= 0.99) return 'primary';
  if (ratio >= 0.95) return 'accent';
  return 'danger';
}

export const ProbeSliPanel: React.FC<ProbeSliPanelProps> = ({
  apiClient,
  goodQuery,
  totalQuery,
  datasourceId,
}) => {
  const [lookback, setLookback] = useState<ProbeSliLookback>('1h');
  const [state, setState] = useState<ProbeState>({ status: 'idle' });
  const lastClickRef = useRef(0);

  const disabled =
    !goodQuery?.trim() ||
    !totalQuery?.trim() ||
    !datasourceId?.trim() ||
    state.status === 'loading';

  const onProbe = useCallback(async () => {
    if (disabled) return;
    const now = Date.now();
    if (now - lastClickRef.current < DEBOUNCE_MS) return;
    lastClickRef.current = now;

    const body: ProbeSliRequest = {
      datasourceId,
      goodQuery: goodQuery!,
      totalQuery: totalQuery!,
      lookback,
    };
    setState({ status: 'loading', lookback });
    try {
      const response = await apiClient.probeSli(body);
      setState({ status: 'success', response, lookback });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setState({ status: 'error', error: message, lookback });
    }
  }, [apiClient, datasourceId, goodQuery, totalQuery, lookback, disabled]);

  return (
    <EuiPanel paddingSize="m" hasShadow={false} hasBorder data-test-subj="slosWizardProbePanel">
      <EuiText size="s">
        <h4>
          {i18n.translate('observability.apm.slo.wizard.probeSli.heading', {
            defaultMessage: 'Probe SLI',
          })}
        </h4>
        <p>
          {i18n.translate('observability.apm.slo.wizard.probeSli.description', {
            defaultMessage:
              'Run this SLI against the target Prometheus backend to verify your queries match data before you create the SLO.',
          })}
        </p>
      </EuiText>
      <EuiSpacer size="s" />
      <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiButton
            size="s"
            iconType="inspect"
            fill
            isLoading={state.status === 'loading'}
            disabled={disabled}
            onClick={onProbe}
            data-test-subj="slosWizardProbeButton"
          >
            {i18n.translate('observability.apm.slo.wizard.probeSli.button', {
              defaultMessage: 'Probe SLI',
            })}
          </EuiButton>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiSelect
            options={LOOKBACK_OPTIONS}
            value={lookback}
            onChange={(e) => setLookback(e.target.value as ProbeSliLookback)}
            compressed
            aria-label={i18n.translate('observability.apm.slo.wizard.probeSli.lookbackAriaLabel', {
              defaultMessage: 'Probe lookback window',
            })}
            data-test-subj="slosWizardProbeLookback"
          />
        </EuiFlexItem>
      </EuiFlexGroup>
      <ProbeResult state={state} />
    </EuiPanel>
  );
};

interface ProbeResultProps {
  state: ProbeState;
}

const ProbeResult: React.FC<ProbeResultProps> = ({ state }) => {
  const sparklineData = useMemo<MetricDataPoint[]>(() => {
    const pts = state.response?.samplePoints;
    if (!pts) return [];
    return pts.map((p) => ({ timestamp: p.t, value: p.v }));
  }, [state.response]);

  if (state.status === 'idle') return null;

  if (state.status === 'error') {
    return (
      <>
        <EuiSpacer size="s" />
        <EuiCallOut
          color="danger"
          iconType="alert"
          title={i18n.translate('observability.apm.slo.wizard.probeSli.requestErrorTitle', {
            defaultMessage: 'Probe failed',
          })}
          size="s"
          data-test-subj="slosWizardProbeRequestError"
        >
          <EuiText size="s">
            {state.error ??
              i18n.translate('observability.apm.slo.wizard.probeSli.unknownError', {
                defaultMessage: 'Unknown error.',
              })}
          </EuiText>
        </EuiCallOut>
      </>
    );
  }

  if (state.status === 'loading' && !state.response) {
    return null;
  }

  const response = state.response;
  if (!response) return null;

  const { goodCount, totalCount, sliRatio, emptyVector, errors } = response;
  // A zero-denominator is the same failure mode as an empty vector — either
  // way the user needs to see "this SLI will record no_data".
  const zeroDenominator = totalCount === 0;
  const showEmpty = emptyVector === true || zeroDenominator;

  return (
    <>
      <EuiSpacer size="s" />
      <EuiPanel
        paddingSize="s"
        hasShadow={false}
        hasBorder
        data-test-subj="slosWizardProbeResult"
        color="subdued"
      >
        <EuiFlexGroup gutterSize="l" alignItems="center" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiStat
              title={formatCount(goodCount)}
              description={i18n.translate('observability.apm.slo.wizard.probeSli.goodLabel', {
                defaultMessage: 'Good',
              })}
              titleSize="s"
              data-test-subj="slosWizardProbeGoodStat"
            />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiStat
              title={formatCount(totalCount)}
              description={i18n.translate('observability.apm.slo.wizard.probeSli.totalLabel', {
                defaultMessage: 'Total',
              })}
              titleSize="s"
              data-test-subj="slosWizardProbeTotalStat"
            />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiStat
              title={sliRatio !== undefined ? formatPct(sliRatio, { decimals: 2 }) : '—'}
              description={i18n.translate('observability.apm.slo.wizard.probeSli.ratioLabel', {
                defaultMessage: 'SLI ratio ({lookback})',
                values: { lookback: state.lookback ?? '1h' },
              })}
              titleSize="s"
              titleColor={ratioColor(sliRatio)}
              data-test-subj="slosWizardProbeRatioStat"
            />
          </EuiFlexItem>
          <EuiFlexItem>
            <div style={{ height: 36 }} data-test-subj="slosWizardProbeSparkline">
              <MetricSparkline data={sparklineData} height={36} color={euiThemeVars.euiColorVis0} />
            </div>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>

      {errors?.good && (
        <>
          <EuiSpacer size="s" />
          <EuiCallOut
            color="warning"
            iconType="alert"
            size="s"
            title={i18n.translate('observability.apm.slo.wizard.probeSli.goodErrorTitle', {
              defaultMessage: 'Good query returned an error',
            })}
            data-test-subj="slosWizardProbeErrorGood"
          >
            <EuiText size="s">
              <EuiCode>{errors.good}</EuiCode>
            </EuiText>
          </EuiCallOut>
        </>
      )}
      {errors?.total && (
        <>
          <EuiSpacer size="s" />
          <EuiCallOut
            color="warning"
            iconType="alert"
            size="s"
            title={i18n.translate('observability.apm.slo.wizard.probeSli.totalErrorTitle', {
              defaultMessage: 'Total query returned an error',
            })}
            data-test-subj="slosWizardProbeErrorTotal"
          >
            <EuiText size="s">
              <EuiCode>{errors.total}</EuiCode>
            </EuiText>
          </EuiCallOut>
        </>
      )}

      {showEmpty && (
        <>
          <EuiSpacer size="s" />
          <EuiCallOut
            color="danger"
            iconType="alert"
            size="s"
            title={i18n.translate('observability.apm.slo.wizard.probeSli.emptyVectorTitle', {
              defaultMessage: 'No samples match this query',
            })}
            data-test-subj="slosWizardProbeEmptyVector"
          >
            <EuiText size="s">
              {zeroDenominator && !emptyVector ? (
                <p>
                  {i18n.translate('observability.apm.slo.wizard.probeSli.zeroDenominator.prefix', {
                    defaultMessage: 'The total-events query returned ',
                  })}
                  <strong>0</strong>
                  {i18n.translate('observability.apm.slo.wizard.probeSli.zeroDenominator.middle', {
                    defaultMessage: ' — the SLO will record',
                  })}
                  <EuiCode>no_data</EuiCode>
                  {i18n.translate('observability.apm.slo.wizard.probeSli.zeroDenominator.suffix', {
                    defaultMessage:
                      ' once deployed. Broaden the selector or check that the target service is emitting the metric.',
                  })}
                </p>
              ) : (
                <p>
                  {i18n.translate('observability.apm.slo.wizard.probeSli.noSeries.prefix', {
                    defaultMessage:
                      'At least one of the two queries returned no series against this datasource over the {lookback} window. The SLO will show ',
                    values: { lookback: state.lookback ?? '1h' },
                  })}
                  <EuiCode>no_data</EuiCode>{' '}
                  {i18n.translate('observability.apm.slo.wizard.probeSli.noSeries.suffix', {
                    defaultMessage: 'until data appears.',
                  })}
                </p>
              )}
            </EuiText>
          </EuiCallOut>
        </>
      )}
    </>
  );
};

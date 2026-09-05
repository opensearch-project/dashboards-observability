/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * QueryPreviewResults — the "Run preview" results block shared by the
 * Metrics page "Create alert rule" flyout and the Alert Manager
 * "Create metrics rule" flyout.
 *
 * Runs the current PromQL expression as a live range query via
 * `AlertingPromResourcesService.runQueryPreview` and renders the returned time
 * series. When a `timeRange` is supplied (e.g. the Explore time picker the user
 * came from) the query runs over that window; otherwise it defaults to the last
 * hour at a 60s step. Shows a loading spinner while the query runs, an error
 * callout on failure, and an empty-state when the query returns no data.
 * `runToken` changes on each "Run preview" click to force a re-fetch.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  EuiAccordion,
  EuiBadge,
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingChart,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import { FormattedMessage } from '@osd/i18n/react';
import { i18n } from '@osd/i18n';
import { EchartsRender } from './echarts_render';
import { AlertingPromResourcesService } from './query_services/alerting_prom_resources_service';
import { ConditionOp } from './create_monitor/prom_condition';

interface PreviewPoint {
  timestamp: number;
  value: number;
}

/** The alert condition parsed from the query, used to overlay the threshold. */
export interface PreviewCondition {
  op: ConditionOp;
  thresholdA?: number;
  thresholdB?: number;
}

/** The threshold value(s) to draw as horizontal marker line(s). */
function thresholdValues(condition?: PreviewCondition): number[] {
  if (!condition || condition.op === 'none') return [];
  const a = condition.thresholdA;
  if (condition.op === 'outside' || condition.op === 'within') {
    return [a, condition.thresholdB].filter((v): v is number => Number.isFinite(v as number));
  }
  return Number.isFinite(a as number) ? [a as number] : [];
}

/** Would the alert fire, given the most recent sample value? */
function conditionMet(value: number, condition: PreviewCondition): boolean {
  const a = condition.thresholdA ?? 0;
  const b = condition.thresholdB ?? 0;
  switch (condition.op) {
    case 'gt':
      return value > a;
    case 'gte':
      return value >= a;
    case 'lt':
      return value < a;
    case 'lte':
      return value <= a;
    case 'eq':
      return value === a;
    case 'neq':
      return value !== a;
    case 'outside':
      return value < a || value > b;
    case 'within':
      return value >= a && value <= b;
    default:
      return false;
  }
}

/** Build the echarts line-chart spec from live range-query points. */
function buildChartOption(points: PreviewPoint[], thresholds: number[]): Record<string, unknown> {
  const timeLabels = points.map((p) =>
    new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  );
  const values = points.map((p) => p.value);
  return {
    grid: { left: 48, right: 16, top: 16, bottom: 32 },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: timeLabels },
    yAxis: { type: 'value' },
    series: [
      {
        type: 'line',
        data: values,
        smooth: true,
        showSymbol: false,
        itemStyle: { color: '#006BB4' },
        areaStyle: { color: 'rgba(0,107,180,0.1)' },
        // Dashed red threshold line(s) so the user sees where the condition
        // trips relative to the plotted metric.
        ...(thresholds.length > 0
          ? {
              markLine: {
                silent: true,
                symbol: 'none',
                data: thresholds.map((v) => ({ yAxis: v })),
                lineStyle: { color: '#BD271E', type: 'dashed' },
                label: {
                  formatter: i18n.translate(
                    'observability.alerting.queryPreviewResults.thresholdLineLabel',
                    { defaultMessage: 'threshold' }
                  ),
                },
              },
            }
          : {}),
      },
    ],
  };
}

interface PreviewState {
  loading: boolean;
  error: string | null;
  points: PreviewPoint[];
  /** The query that was actually previewed (snapshot at fetch time). */
  requestedQuery: string;
  /** The effective expression the server plotted (comparison stripped). */
  plottedQuery: string;
  /** How many series the expression matched (only the first is charted). */
  seriesCount: number;
  /**
   * True before any query has been run, or when Run preview was clicked with no
   * expression / datasource. Distinguishes "nothing ran" from "ran and got zero
   * rows" so the empty-result warning isn't shown for missing input.
   */
  noInput: boolean;
}

const EMPTY_STATE: PreviewState = {
  loading: false,
  error: null,
  points: [],
  requestedQuery: '',
  plottedQuery: '',
  seriesCount: 0,
  noInput: true,
};

/**
 * Preview range in epoch seconds. When present the query runs over
 * `[start, end]`; the step is derived to target a readable point count.
 */
export interface PreviewTimeRange {
  start: number;
  end: number;
}

/**
 * Derive a range-query step (seconds) that keeps the preview under the route's
 * point budget while staying readable — ~500 points, floored at 15s.
 */
function deriveStep(range: PreviewTimeRange): number {
  const span = Math.max(1, range.end - range.start);
  return Math.max(15, Math.ceil(span / 500));
}

export const QueryPreviewResults: React.FC<{
  /** The PromQL expression to preview. */
  query: string;
  /** Datasource the query runs against; without it no preview can run. */
  datasourceId?: string;
  /**
   * Time window to preview over (epoch seconds). When omitted the server
   * defaults to the last hour at a 60s step.
   */
  timeRange?: PreviewTimeRange;
  /** Bumped on each "Run preview" click to re-run the query. */
  runToken?: number;
  /**
   * Parsed alert condition (from the current query). When present, its
   * threshold(s) are drawn on the chart and the latest sample is evaluated
   * into a "would fire now" badge.
   */
  condition?: PreviewCondition;
  /** Unique accordion id — pass a distinct one per mount point. */
  id?: string;
}> = ({ query, datasourceId, timeRange, runToken, condition, id = 'prom-preview-results' }) => {
  const [state, setState] = useState<PreviewState>(EMPTY_STATE);

  // Snapshot the live query in a ref so editing it does NOT re-fire the range
  // query on every keystroke. The fetch is deliberately keyed on `runToken`
  // (bumped by the "Run preview" button) and the datasource, so a preview
  // reflects the query as of the last explicit Run preview click.
  const queryRef = useRef(query);
  queryRef.current = query;
  // Same treatment for the range: read it at fetch time so a re-render with a
  // new object identity doesn't re-fire the query (only runToken/ds do).
  const timeRangeRef = useRef(timeRange);
  timeRangeRef.current = timeRange;

  useEffect(() => {
    const trimmed = (queryRef.current || '').trim();
    if (!datasourceId || !trimmed) {
      setState(EMPTY_STATE);
      return;
    }
    let stale = false;
    setState({ ...EMPTY_STATE, loading: true, requestedQuery: trimmed, noInput: false });
    const range = timeRangeRef.current;
    const previewRange = range
      ? { start: range.start, end: range.end, step: deriveStep(range) }
      : undefined;
    new AlertingPromResourcesService(datasourceId)
      .runQueryPreview(trimmed, previewRange)
      .then(({ points, query: plotted, seriesCount }) => {
        if (!stale) {
          setState({
            loading: false,
            error: null,
            points: points || [],
            requestedQuery: trimmed,
            plottedQuery: plotted || trimmed,
            seriesCount: seriesCount ?? (points && points.length ? 1 : 0),
            noInput: false,
          });
        }
      })
      .catch((err) => {
        if (!stale) {
          setState({
            ...EMPTY_STATE,
            error: err instanceof Error ? err.message : String(err),
            requestedQuery: trimmed,
            noInput: false,
          });
        }
      });
    return () => {
      stale = true;
    };
    // `query` is intentionally read from a ref (not a dep) — see note above.
  }, [datasourceId, runToken]);

  const resultCount = state.points.length;
  // A trailing comparison (e.g. `> 0.5`) is stripped server-side so the chart
  // plots the metric series rather than a 0/1 boolean. Surface that so the
  // caption isn't mistaken for a threshold-applied series.
  const comparisonStripped = !!state.plottedQuery && state.plottedQuery !== state.requestedQuery;

  const thresholds = thresholdValues(condition);
  // Evaluate the most recent plotted sample against the condition for the
  // "would fire now" badge. Only meaningful once we have data and a condition.
  const latestValue = resultCount > 0 ? state.points[resultCount - 1].value : undefined;
  const wouldFire =
    condition && condition.op !== 'none' && latestValue !== undefined
      ? conditionMet(latestValue, condition)
      : undefined;

  return (
    <EuiAccordion
      id={id}
      buttonContent={
        <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
          <EuiFlexItem grow={false}>
            <strong>
              <FormattedMessage
                id="observability.alerting.queryPreviewResults.resultsTitle"
                defaultMessage="Samples ({count})"
                values={{ count: resultCount }}
              />
            </strong>
          </EuiFlexItem>
          {wouldFire !== undefined && (
            <EuiFlexItem grow={false}>
              <EuiBadge
                color={wouldFire ? 'danger' : 'hollow'}
                data-test-subj="previewWouldFireBadge"
              >
                {wouldFire
                  ? i18n.translate('observability.alerting.queryPreviewResults.wouldFire', {
                      defaultMessage: 'Would fire now',
                    })
                  : i18n.translate('observability.alerting.queryPreviewResults.wouldNotFire', {
                      defaultMessage: 'Would not fire',
                    })}
              </EuiBadge>
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
      }
      initialIsOpen
      paddingSize="s"
    >
      {!state.noInput && (
        <>
          <EuiText size="xs" color="subdued">
            {state.plottedQuery || query}
          </EuiText>
          {state.seriesCount > 1 && (
            <EuiText size="xs" color="subdued">
              <em>
                {i18n.translate('observability.alerting.queryPreviewResults.multiSeriesNote', {
                  defaultMessage:
                    'Matched {count} series — charting the first. The alert evaluates every matching series.',
                  values: { count: state.seriesCount },
                })}
              </em>
            </EuiText>
          )}
          {comparisonStripped && (
            <EuiText size="xs" color="subdued">
              <em>
                {i18n.translate(
                  'observability.alerting.queryPreviewResults.comparisonStrippedNote',
                  {
                    defaultMessage: 'Comparison removed to plot the underlying metric series.',
                  }
                )}
              </em>
            </EuiText>
          )}
        </>
      )}
      <EuiSpacer size="s" />
      {state.noInput ? (
        // Nothing has been run (or Run preview was clicked with no expression /
        // datasource). Neutral prompt — NOT the "returned no data" warning,
        // which would wrongly blame a valid metric for missing input.
        <EuiCallOut
          size="s"
          color="primary"
          iconType="iInCircle"
          title={i18n.translate('observability.alerting.queryPreviewResults.notRunTitle', {
            defaultMessage: 'Nothing to preview yet',
          })}
        >
          <EuiText size="xs">
            {i18n.translate('observability.alerting.queryPreviewResults.notRunBody', {
              defaultMessage:
                'Enter a PromQL expression and select a datasource, then click Run preview.',
            })}
          </EuiText>
        </EuiCallOut>
      ) : state.loading ? (
        <EuiFlexGroup justifyContent="center" alignItems="center" style={{ height: 200 }}>
          <EuiFlexItem grow={false}>
            <EuiLoadingChart size="l" mono />
          </EuiFlexItem>
        </EuiFlexGroup>
      ) : state.error ? (
        <EuiCallOut
          size="s"
          color="danger"
          iconType="alert"
          title={i18n.translate('observability.alerting.queryPreviewResults.errorTitle', {
            defaultMessage: 'Could not run preview',
          })}
        >
          <EuiText size="xs">{state.error}</EuiText>
        </EuiCallOut>
      ) : resultCount === 0 ? (
        // An empty result is ambiguous: the range genuinely had no data, OR the
        // datasource degraded a query it couldn't evaluate to an empty response
        // (the PromQL strategy doesn't always throw on a rejected query). Word
        // this so the user doesn't wrongly conclude the metric has no data and
        // build a rule on a broken expression.
        <EuiCallOut
          size="s"
          color="warning"
          iconType="iInCircle"
          title={i18n.translate('observability.alerting.queryPreviewResults.noDataTitle', {
            defaultMessage: 'No results for this time range',
          })}
        >
          <EuiText size="xs">
            {i18n.translate('observability.alerting.queryPreviewResults.noDataBody', {
              defaultMessage:
                'The query returned no data for this time range, or the data source could not evaluate it. Double-check the expression before saving.',
            })}
          </EuiText>
        </EuiCallOut>
      ) : (
        <EchartsRender spec={buildChartOption(state.points, thresholds)} height={200} />
      )}
    </EuiAccordion>
  );
};

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  EuiBadge,
  EuiBasicTable,
  EuiBasicTableColumn,
  EuiButton,
  EuiButtonEmpty,
  EuiEmptyPrompt,
  EuiFieldSearch,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHealth,
  EuiIcon,
  EuiLink,
  EuiLoadingContent,
  EuiPage,
  EuiPageBody,
  EuiPageContent,
  EuiPageContentBody,
  EuiPanel,
  EuiResizableContainer,
  EuiSelect,
  EuiSpacer,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';
import { euiThemeVars } from '@osd/ui-shared-deps/theme';
import { i18n } from '@osd/i18n';
import { useHistory, useLocation } from 'react-router-dom';
import { ChromeStart, HttpStart, NotificationsStart } from '../../../../../../../src/core/public';
import { HeaderControlledComponentsWrapper } from '../../../../plugin_helpers/plugin_headerControl';
import { ActiveFilterBadges, FilterBadge } from '../../shared/components/active_filter_badges';
import { SloOverviewPanel } from './slo_overview_panel';
import { SloNoSlosEmptyState } from './slo_no_slos_empty_state';
import { SloSuggestHeaderButton } from './slo_suggest_header_button';
import { DATASOURCE_SELECTION_CAP, SloListFilterPanel } from './slo_list_filter_panel';
import { usePrometheusDatasources } from './use_prometheus_datasources';
import {
  datasourceScopeCacheKey,
  readDatasourceScope,
  scopeFromFilter,
  writeDatasourceScope,
} from './slo_datasource_scope_cache';
import {
  deserializeCursorFromSearch,
  deserializeFiltersFromSearch,
  filtersEqual,
  serializeFiltersToSearch,
} from './slo_list_filter_url';
import type { SloApiClient } from './slo_api_client';
import type {
  SloHealthState,
  SloListFilters,
  SloSummary,
} from '../../../../../common/slo/slo_types';
import { formatPct, SLO_PRECISION, TABULAR_NUMS_STYLE } from '../../../../../common/slo/format';
import { getSloHealthColor, getSloHealthLabel } from '../../../../../common/slo/state';
import { templateIconFor } from './template_icons';
import { KIND_LABEL } from './suggest_engine';

export interface SloListingPageProps {
  apiClient: SloApiClient;
  http: HttpStart;
  chrome: ChromeStart;
  notifications: NotificationsStart;
  parentBreadcrumb: { text: string; href: string };
}

// Fixed precision (M4): a per-row `toFixed(target >= 0.999 ? 2 : 1)` made the
// decimal count vary between rows so the target column never lined up. Route
// through the shared `formatPct` at the shared `SLO_PRECISION.target` so every
// target renders with the same number of decimals.
function formatTargetPct(target: number): string {
  return formatPct(target, { decimals: SLO_PRECISION.target });
}

/**
 * Pick the worst objective's remaining budget for the SLO summary — lines up
 * with the overview panel's leaderboard ranking so the column values match.
 */
function worstBudgetRemaining(summary: SloSummary): number {
  const objectives = summary.status.objectives;
  if (!objectives || objectives.length === 0) return 1;
  return objectives.reduce((acc, o) => Math.min(acc, o.errorBudgetRemaining), 1);
}

// Initial page size for cursor-paginated listings. The selector lets users
// pick a different size at runtime; the value also rides the URL as
// `?pageSize=N` so a deep-linked page restores the same density.
const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

/** Compact budget bar for the table column. Identical visual language to the overview leaderboard. */
const BudgetColumnBar: React.FC<{ remaining: number; width?: number }> = ({
  remaining,
  width = 160,
}) => {
  const consumed = Math.max(0, 1 - remaining);
  const consumedPct = Math.min(100, consumed * 100);
  const overBudget = remaining < 0;
  return (
    <div
      style={{
        position: 'relative',
        height: 6,
        background: euiThemeVars.euiColorLightestShade,
        borderRadius: 3,
        overflow: 'hidden',
        width,
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
 * Single combined cell for state + remaining budget + firing count. The old
 * layout dedicated three columns to this information (Status, Budget left,
 * Firing); visually scanning the listing took three separate eye fixations
 * per row. Stacking them in one cell keeps the budget % as the dominant
 * signal and the firing badge as an exception indicator.
 */
const SloHealthCell: React.FC<{ row: SloSummary }> = ({ row }) => {
  const state = row.status.state;
  // For SLOs that aren't producing samples, `worstBudgetRemaining` falls back
  // to 1 (100%), which paints a full green bar and reads as "healthy" at a
  // glance. Suppress the budget text + bar in those states — the state chip
  // already carries the correct signal. `rules_missing` folds into the same
  // category: the ruler has no samples, so the 100% fallback is just as
  // misleading as in `no_data`.
  const isReporting =
    state !== 'no_data' &&
    state !== 'source_idle' &&
    state !== 'stale' &&
    state !== 'disabled' &&
    state !== 'rules_missing';
  const remaining = worstBudgetRemaining(row);
  const overBudget = remaining < 0;
  const budgetLabel = overBudget
    ? i18n.translate('observability.apm.slo.listing.budgetOver', {
        defaultMessage: 'over budget',
      })
    : formatPct(Math.max(0, remaining), { decimals: 0 });
  const budgetColor: 'danger' | 'warning' | 'default' = overBudget
    ? 'danger'
    : remaining < 0.25
      ? 'warning'
      : 'default';
  const firing = row.status.firingCount;
  return (
    <div data-test-subj={`slosHealthCell-${row.id}`} style={{ width: 180 }}>
      <EuiFlexGroup
        gutterSize="xs"
        alignItems="center"
        responsive={false}
        justifyContent="flexStart"
      >
        <EuiFlexItem grow={false}>
          <EuiToolTip
            content={i18n.translate('observability.apm.slo.listing.stateTooltip', {
              defaultMessage: 'State: {state}',
              // Human, localized label (M3/CLAR7) — never the raw machine enum
              // (`breached`, `at_risk`, …). Routed through the shared, localized
              // `getSloHealthLabel` (common/slo/state.ts) — the single source of
              // truth — which also maps an out-of-union state to "Unknown"
              // rather than leaking the raw token.
              values: { state: getSloHealthLabel(state) },
            })}
          >
            <EuiHealth color={getSloHealthColor(state)}>
              <span style={{ fontSize: 12 }}>{getSloHealthLabel(state)}</span>
            </EuiHealth>
          </EuiToolTip>
        </EuiFlexItem>
        {isReporting ? (
          <EuiFlexItem grow={true} style={{ textAlign: 'right' }}>
            <EuiToolTip
              content={i18n.translate('observability.apm.slo.listing.budgetRemainingTooltip', {
                defaultMessage: 'Remaining error budget (worst objective).',
              })}
            >
              <EuiText
                size="s"
                color={budgetColor === 'default' ? 'default' : budgetColor}
                style={{ fontWeight: 600, ...TABULAR_NUMS_STYLE }}
              >
                {budgetLabel}
              </EuiText>
            </EuiToolTip>
          </EuiFlexItem>
        ) : null}
        {firing > 0 ? (
          <EuiFlexItem grow={false}>
            <EuiToolTip
              content={i18n.translate('observability.apm.slo.listing.firingTooltip', {
                defaultMessage: '{firing, plural, one {# alert firing} other {# alerts firing}}',
                values: { firing },
              })}
            >
              <EuiBadge color="danger" iconType="bell" data-test-subj={`slosFiringBadge-${row.id}`}>
                {firing}
              </EuiBadge>
            </EuiToolTip>
          </EuiFlexItem>
        ) : null}
      </EuiFlexGroup>
      {isReporting ? (
        <div style={{ marginTop: 4 }}>
          <BudgetColumnBar remaining={remaining} width={160} />
        </div>
      ) : null}
    </div>
  );
};

/**
 * Translate the overview panel's KPI-tile state into a listing filter delta.
 * The tile's "firing" pseudo-state stays client-side — we don't have a
 * server-side `firingCount > 0` filter, but we do have state=breached which
 * is the closest real facet, so a firing tile click maps to it.
 */
function stateTileToFilterState(
  tile: SloHealthState | 'firing' | null
): SloHealthState[] | undefined {
  if (tile === null) return undefined;
  if (tile === 'firing') return ['breached'];
  return [tile];
}

function filterStateToTile(state: SloHealthState[] | undefined): SloHealthState | 'firing' | null {
  if (!state || state.length !== 1) return null;
  return state[0];
}

/**
 * Derives the "Rules" column badge from the server-computed `status.state`
 * (priority-merged to include 'rules_missing'). We intentionally do NOT make a
 * per-row `getRuleHealth` call here — the listing must remain a single
 * round-trip, and the server has already folded ruler health into the state
 * facet so the summary carries everything we need.
 */
type RuleBadgeKind = 'missing' | 'disabled' | 'no-data' | 'healthy';

interface RuleBadgeSpec {
  kind: RuleBadgeKind;
  label: string;
  color: 'danger' | 'hollow' | 'warning' | 'success';
  iconType?: string;
  tooltip: string;
}

function ruleBadgeSpecFor(state: SloHealthState): RuleBadgeSpec {
  if (state === 'rules_missing') {
    return {
      kind: 'missing',
      label: i18n.translate('observability.apm.slo.listing.rulesBadge.missing.label', {
        defaultMessage: 'Missing',
      }),
      color: 'danger',
      iconType: 'alert',
      tooltip: i18n.translate('observability.apm.slo.listing.rulesBadge.missing.tooltip', {
        defaultMessage:
          'One or more Prometheus rule groups for this SLO are missing from the ruler. Visit the detail page to restore or delete.',
      }),
    };
  }
  if (state === 'disabled') {
    return {
      kind: 'disabled',
      label: i18n.translate('observability.apm.slo.listing.rulesBadge.disabled.label', {
        defaultMessage: 'Disabled',
      }),
      color: 'hollow',
      tooltip: i18n.translate('observability.apm.slo.listing.rulesBadge.disabled.tooltip', {
        defaultMessage: 'SLO is paused; rule groups are intentionally absent.',
      }),
    };
  }
  if (state === 'no_data' || state === 'stale') {
    return {
      kind: 'no-data',
      label: i18n.translate('observability.apm.slo.listing.rulesBadge.noData.label', {
        defaultMessage: 'No data',
      }),
      color: 'warning',
      tooltip: i18n.translate('observability.apm.slo.listing.rulesBadge.noData.tooltip', {
        defaultMessage: 'Rule groups exist but no samples have arrived yet.',
      }),
    };
  }
  if (state === 'source_idle') {
    return {
      kind: 'no-data',
      label: i18n.translate('observability.apm.slo.listing.rulesBadge.sourceIdle.label', {
        defaultMessage: 'Source idle',
      }),
      color: 'warning',
      tooltip: i18n.translate('observability.apm.slo.listing.rulesBadge.sourceIdle.tooltip', {
        defaultMessage:
          'Rule groups are evaluating but the source metric has no traffic in the window. Check the upstream metric pipeline.',
      }),
    };
  }
  return {
    kind: 'healthy',
    label: i18n.translate('observability.apm.slo.listing.rulesBadge.active.label', {
      defaultMessage: 'Active',
    }),
    color: 'success',
    tooltip: i18n.translate('observability.apm.slo.listing.rulesBadge.active.tooltip', {
      defaultMessage: 'Rule groups deployed and actively evaluating samples.',
    }),
  };
}

const SloRulesBadge: React.FC<{ row: SloSummary }> = ({ row }) => {
  const spec = ruleBadgeSpecFor(row.status.state);
  return (
    <EuiToolTip content={spec.tooltip}>
      <EuiBadge
        color={spec.color}
        iconType={spec.iconType}
        data-test-subj={`slosRulesBadge-${row.id}`}
        data-test-rule-state={spec.kind}
      >
        {spec.label}
      </EuiBadge>
    </EuiToolTip>
  );
};

const MODE_LABEL: Record<'active' | 'shadow', string> = {
  active: i18n.translate('observability.apm.slo.listing.modeLabel.active', {
    defaultMessage: 'Active',
  }),
  shadow: i18n.translate('observability.apm.slo.listing.modeLabel.shadow', {
    defaultMessage: 'Shadow',
  }),
};

/**
 * Dominant-value summary for a single trait. If ≥95% of rows share one value
 * we treat it as the workspace default; the majority is suppressed per-row and
 * surfaced once at the page level.
 */
interface TraitMajority {
  /** The dominant value, if any row has one set. */
  value: string | null;
  /** Whether the dominant value covers at least the threshold share. */
  isDominant: boolean;
}

const MAJORITY_THRESHOLD = 0.95;

function computeMajority(values: Array<string | null | undefined>): TraitMajority {
  const counts = new Map<string, number>();
  let defined = 0;
  for (const v of values) {
    if (v === null || v === undefined || v === '') continue;
    defined++;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  if (defined === 0) return { value: null, isDominant: false };
  let top: string | null = null;
  let topN = 0;
  counts.forEach((n, v) => {
    if (n > topN) {
      top = v;
      topN = n;
    }
  });
  return { value: top, isDominant: top !== null && topN / defined >= MAJORITY_THRESHOLD };
}

/**
 * Compact badge row for Tier / Mode / Enabled. When the dataset has a single
 * dominant value (≥95%) for a trait, we hide that badge on majority rows and
 * only show it when a row deviates — exceptions visually pop.
 */
interface SloTraitsCellProps {
  row: SloSummary;
  majorities: {
    tier: TraitMajority;
    mode: TraitMajority;
    enabled: TraitMajority;
  };
}

const SloTraitsCell: React.FC<SloTraitsCellProps> = ({ row, majorities }) => {
  const enabledValue = row.enabled ? 'yes' : 'no';
  const badges: React.ReactNode[] = [];
  if (row.tier && !(majorities.tier.isDominant && majorities.tier.value === row.tier)) {
    badges.push(
      <EuiBadge key="tier" color="hollow">
        {row.tier}
      </EuiBadge>
    );
  }
  if (!(majorities.mode.isDominant && majorities.mode.value === row.mode)) {
    badges.push(
      <EuiBadge key="mode" color="hollow">
        {row.mode}
      </EuiBadge>
    );
  }
  if (!(majorities.enabled.isDominant && majorities.enabled.value === enabledValue)) {
    badges.push(
      <EuiBadge key="enabled" color={row.enabled ? 'hollow' : 'warning'}>
        {row.enabled
          ? i18n.translate('observability.apm.slo.listing.traitsCell.enabled', {
              defaultMessage: 'enabled',
            })
          : i18n.translate('observability.apm.slo.listing.traitsCell.disabled', {
              defaultMessage: 'disabled',
            })}
      </EuiBadge>
    );
  }
  if (badges.length === 0) {
    return (
      <EuiText size="xs" color="subdued" data-test-subj={`slosTraitsCell-${row.id}`}>
        —
      </EuiText>
    );
  }
  return (
    <EuiFlexGroup
      gutterSize="xs"
      alignItems="center"
      responsive={false}
      wrap
      data-test-subj={`slosTraitsCell-${row.id}`}
    >
      {badges.map((b, i) => (
        <EuiFlexItem grow={false} key={i}>
          {b}
        </EuiFlexItem>
      ))}
    </EuiFlexGroup>
  );
};

// Module-level memoized table panel. EuiResizableContainer re-runs its render
// prop on every mousemove; memoizing keeps pagination and sort stable. Project
// memory references the same pattern from services_home.tsx.
interface SlosTablePanelProps {
  items: SloSummary[];
  columns: Array<EuiBasicTableColumn<SloSummary>>;
  loading: boolean;
  resultCount: number;
  total: number;
  pageSize: number;
  hasMore: boolean;
  hasPrev: boolean;
  filteredToZero: boolean;
  /** Zero results specifically because the user unchecked every datasource. */
  datasourceScopeEmpty: boolean;
  /** Total Prometheus datasources available (drives the recovery button label). */
  datasourceCount: number;
  onClearAllFilters: () => void;
  onShowAllDatasources: () => void;
  onPrev: () => void;
  onNext: () => void;
  onPageSizeChange: (next: number) => void;
  defaultsLine: string | null;
}

const SlosTablePanelUI: React.FC<SlosTablePanelProps> = ({
  items,
  columns,
  loading,
  resultCount,
  total,
  pageSize,
  hasMore,
  hasPrev,
  filteredToZero,
  datasourceScopeEmpty,
  datasourceCount,
  onClearAllFilters,
  onShowAllDatasources,
  onPrev,
  onNext,
  onPageSizeChange,
  defaultsLine,
}) => {
  if (filteredToZero) {
    // Distinguish "you deselected every datasource" from a generic over-narrow
    // filter set: the fix for the former is to pick a datasource (or show all),
    // not to widen unrelated facets.
    if (datasourceScopeEmpty) {
      return (
        <EuiPanel data-test-subj="slosEmptyNoDatasource">
          <EuiEmptyPrompt
            iconType="database"
            title={
              <h2>
                {i18n.translate('observability.apm.slo.listing.emptyNoDatasource.title', {
                  defaultMessage: 'No datasources selected',
                })}
              </h2>
            }
            body={
              <p>
                {i18n.translate('observability.apm.slo.listing.emptyNoDatasource.body', {
                  defaultMessage:
                    'Select at least one Prometheus datasource in the filters to see its SLOs, or show all datasources.',
                })}
              </p>
            }
            actions={
              <EuiButton
                onClick={onShowAllDatasources}
                data-test-subj="slosEmptyNoDatasourceShowAll"
              >
                {datasourceCount > DATASOURCE_SELECTION_CAP
                  ? i18n.translate('observability.apm.slo.listing.emptyNoDatasource.showCapped', {
                      defaultMessage:
                        'Show {count, plural, one {# datasource} other {# datasources}}',
                      values: { count: DATASOURCE_SELECTION_CAP },
                    })
                  : i18n.translate(
                      'observability.apm.slo.listing.emptyNoDatasource.showAllButton',
                      {
                        defaultMessage: 'Show all datasources',
                      }
                    )}
              </EuiButton>
            }
          />
        </EuiPanel>
      );
    }
    return (
      <EuiPanel data-test-subj="slosEmptyFilteredZero">
        <EuiEmptyPrompt
          iconType="search"
          title={
            <h2>
              {i18n.translate('observability.apm.slo.listing.emptyFiltered.title', {
                defaultMessage: 'No SLOs match your filters',
              })}
            </h2>
          }
          body={
            <p>
              {i18n.translate('observability.apm.slo.listing.emptyFiltered.body', {
                defaultMessage:
                  'Try widening the filters, or clear them to see every SLO in this workspace.',
              })}
            </p>
          }
          actions={
            <EuiButton onClick={onClearAllFilters} data-test-subj="slosEmptyFilteredClear">
              {i18n.translate('observability.apm.slo.listing.emptyFiltered.clearButton', {
                defaultMessage: 'Clear filters',
              })}
            </EuiButton>
          }
        />
      </EuiPanel>
    );
  }
  const sizeOptions = PAGE_SIZE_OPTIONS.map((n) => ({ value: String(n), text: String(n) }));
  return (
    <EuiPanel>
      <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
        <EuiFlexItem grow={false}>
          <EuiText size="m">
            <h4>
              {i18n.translate('observability.apm.slo.listing.catalogTitle', {
                defaultMessage: 'SLO catalog',
              })}
            </h4>
          </EuiText>
          {defaultsLine ? (
            <EuiText size="xs" color="subdued" data-test-subj="slosListingDefaults">
              {defaultsLine}
            </EuiText>
          ) : null}
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiFlexGroup gutterSize="m" alignItems="center" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiText size="s" color="subdued" data-test-subj="slosListingResultCount">
                {i18n.translate('observability.apm.slo.listing.resultCountTotal', {
                  defaultMessage: '{resultCount, plural, one {# SLO} other {# SLOs}} of {total}',
                  values: { resultCount, total },
                })}
              </EuiText>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiSelect
                compressed
                aria-label={i18n.translate('observability.apm.slo.listing.pageSizeLabel', {
                  defaultMessage: 'Rows per page',
                })}
                value={String(pageSize)}
                options={sizeOptions}
                onChange={(e) => onPageSizeChange(parseInt(e.target.value, 10))}
                data-test-subj="slosPaginationPageSize"
              />
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="s" />
      <EuiBasicTable<SloSummary>
        items={items}
        columns={columns}
        loading={loading}
        data-test-subj="slosTable"
      />
      <EuiSpacer size="s" />
      <EuiFlexGroup justifyContent="flexEnd" alignItems="center" gutterSize="s" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiButtonEmpty
            size="s"
            iconType="arrowLeft"
            isDisabled={!hasPrev || loading}
            onClick={onPrev}
            data-test-subj="slosPaginationPrev"
          >
            {i18n.translate('observability.apm.slo.listing.prev', { defaultMessage: 'Previous' })}
          </EuiButtonEmpty>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButtonEmpty
            size="s"
            iconType="arrowRight"
            iconSide="right"
            isDisabled={!hasMore || loading}
            onClick={onNext}
            data-test-subj="slosPaginationNext"
          >
            {i18n.translate('observability.apm.slo.listing.next', { defaultMessage: 'Next' })}
          </EuiButtonEmpty>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPanel>
  );
};

const SlosTablePanel = React.memo(SlosTablePanelUI);

export const SloListingPage: React.FC<SloListingPageProps> = ({
  apiClient,
  http,
  chrome,
  notifications,
  parentBreadcrumb: _parentBreadcrumb,
}) => {
  const history = useHistory();
  const location = useLocation();

  const {
    datasources: promDatasources,
    loading: promDatasourcesLoading,
    error: promDatasourcesError,
  } = usePrometheusDatasources(http);

  // Hash-query round-trip: on mount and on hash changes, hydrate filters from
  // the URL so sharing a link preserves the view.
  const [filters, setFilters] = useState<SloListFilters>(() =>
    deserializeFiltersFromSearch(location.search)
  );
  const [cursor, setCursor] = useState<string | null>(() =>
    deserializeCursorFromSearch(location.search)
  );
  const [items, setItems] = useState<SloSummary[]>([]);
  const [totalUnfiltered, setTotalUnfiltered] = useState<number | null>(null);
  const [total, setTotal] = useState<number>(0);
  const [pageSize, setPageSize] = useState<number>(
    () => deserializeFiltersFromSearch(location.search).pageSize ?? DEFAULT_PAGE_SIZE
  );
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [prevCursor, setPrevCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    chrome.setBreadcrumbs([
      {
        text: i18n.translate('observability.apm.slo.listing.breadcrumb', {
          defaultMessage: 'SLO/SLI',
        }),
      },
    ]);
  }, [chrome]);

  // Filter+cursor ↔ URL sync. Single effect, guarded by a ref that stores the
  // last serialized string we reconciled. Writing to URL via history.replace
  // intentionally does NOT re-trigger a setFilters/setCursor, and an external
  // URL change (paste, back button) does NOT re-write the URL we just
  // received. Without this guard the two effects form a loop: write URL →
  // read URL → parse → setState(newObj) → compare → write URL → ...
  const filtersForUrl = useMemo<SloListFilters>(
    () => ({ ...filters, pageSize: pageSize !== DEFAULT_PAGE_SIZE ? pageSize : undefined }),
    [filters, pageSize]
  );
  const lastSyncedSearch = useRef<string>(serializeFiltersToSearch(filtersForUrl, cursor));
  useEffect(() => {
    const rawUrl = location.search.startsWith('?') ? location.search.slice(1) : location.search;
    const fromState = serializeFiltersToSearch(filtersForUrl, cursor);

    if (fromState === rawUrl) {
      lastSyncedSearch.current = fromState;
      return;
    }

    if (rawUrl !== lastSyncedSearch.current) {
      const parsed = deserializeFiltersFromSearch(location.search);
      const parsedCursor = deserializeCursorFromSearch(location.search);
      const parsedSize = parsed.pageSize ?? DEFAULT_PAGE_SIZE;
      if (
        !filtersEqual(parsed, filtersForUrl) ||
        parsedCursor !== cursor ||
        parsedSize !== pageSize
      ) {
        lastSyncedSearch.current = rawUrl;
        const { pageSize: _ignored, ...rest } = parsed;
        setFilters(rest);
        setCursor(parsedCursor);
        setPageSize(parsedSize);
      }
      return;
    }

    lastSyncedSearch.current = fromState;
    history.replace({
      pathname: location.pathname,
      search: fromState.length ? `?${fromState}` : '',
    });
  }, [filtersForUrl, cursor, pageSize, location.search, location.pathname, history]);

  // True once the landing datasource-scope has resolved (URL / cache / auto-
  // select). The first fetch waits on this so we never flash an unscoped list
  // before the scope applies. See the scope-resolve effect below.
  const [scopeReady, setScopeReady] = useState(false);

  // Explicit empty datasource scope (user unchecked every datasource): show
  // nothing. Distinct from "no datasource filter at all" (undefined = show
  // everything). Shared by `load` (server short-circuit) and the empty-state.
  const datasourceScopeEmpty =
    Array.isArray(filters.datasourceId) && filters.datasourceId.length === 0;

  const load = useCallback(
    async (isCurrent: () => boolean) => {
      setLoading(true);
      setError(null);
      // Empty datasource scope → show nothing. Short-circuit without hitting
      // the server (which treats an empty datasource filter as "no filter").
      if (datasourceScopeEmpty) {
        setItems([]);
        setTotal(0);
        setNextCursor(null);
        setPrevCursor(null);
        setLoading(false);
        return;
      }
      try {
        // Listing is Prometheus-scoped by default — the SLI backend facet was
        // dropped from the sidebar in favor of a single-backend default. URL
        // callers can still override via `?sliBackend=opensearch`.
        const effectiveFilters: SloListFilters = {
          ...filters,
          sliBackend: filters.sliBackend?.length ? filters.sliBackend : ['prometheus'],
          pageSize,
        };
        const result = await apiClient.list(effectiveFilters, cursor);
        if (!isCurrent()) return;
        setItems(result.results);
        setTotal(result.total);
        setNextCursor(result.nextCursor);
        setPrevCursor(result.prevCursor);
        // `totalUnfiltered` only reflects an empty-filters fetch — when the
        // user has filters applied, the cached value persists from earlier.
        // Used solely for the "no SLOs at all" empty-state branch.
        if (Object.keys(filters).length === 0 && cursor === null) {
          setTotalUnfiltered(result.total);
        }
      } catch (e) {
        if (!isCurrent()) return;
        const err = e instanceof Error ? e : new Error(String(e));
        setError(err);
        notifications.toasts.addDanger({
          title: i18n.translate('observability.apm.slo.listing.loadFailedToast', {
            defaultMessage: 'Failed to load SLOs',
          }),
          text: err.message,
        });
      } finally {
        if (isCurrent()) setLoading(false);
      }
    },
    [apiClient, filters, cursor, pageSize, notifications, datasourceScopeEmpty]
  );

  useEffect(() => {
    // Hold the first fetch until the landing datasource scope has resolved, so
    // the initial render doesn't flash an unscoped list before auto-select /
    // cache applies. `loading` stays true meanwhile (the spinner shows).
    if (!scopeReady) return undefined;
    // Stale-fetch guard: rapid filter clicks can fire overlapping `apiClient.list()`
    // requests, and whichever resolves last wins. The flag pins each effect's
    // request to its render cycle so a slower stale response can't clobber the
    // newer state.
    let cancelled = false;
    load(() => !cancelled);
    return () => {
      cancelled = true;
    };
  }, [load, scopeReady]);

  // Manual refresh from the toolbar button + error retry. Guarded by a render
  // counter so a follow-up auto-refresh can't override a manual fetch.
  const refresh = useCallback(() => {
    let cancelled = false;
    load(() => !cancelled);
    return () => {
      cancelled = true;
    };
  }, [load]);

  // Majority-value analysis for the three low-cardinality traits. Computed once
  // per render over the current items; badges for the dominant value are then
  // suppressed per-row and surfaced as a single page-level "Defaults —" line.
  const traitMajorities = useMemo(() => {
    return {
      tier: computeMajority(items.map((s) => s.tier ?? null)),
      mode: computeMajority(items.map((s) => s.mode)),
      enabled: computeMajority(items.map((s) => (s.enabled ? 'yes' : 'no'))),
    };
  }, [items]);

  // M7: we intentionally render rows in the *server's* order rather than
  // re-sorting the current page.
  //
  // The previous implementation re-sorted only the visible page by
  // `worstBudgetRemaining` (worst first). Error-budget-remaining is a
  // *derived* value — it's recomputed from live status on every read and is
  // not stored or indexed on the saved object, so the backend genuinely
  // cannot sort on it (see the sort-field note in
  // `common/slo/slo_query_service.ts`, which sorts on the stable `_id`
  // keyword). Sorting a single page client-side implied a global "worst
  // first" ordering the paginated list never actually had: a breached SLO
  // sitting on page 2+ would never surface on page 1. That is a correctness
  // bug, so rather than fake an ordering we don't have, we drop the page-local
  // re-sort and present the real, stable server order. The per-row health
  // cell still carries the budget/breach signal so an operator can spot the
  // worst rows on whatever page they land on.
  const defaultsLine = useMemo(() => {
    const parts: string[] = [];
    if (traitMajorities.tier.isDominant && traitMajorities.tier.value) {
      parts.push(
        i18n.translate('observability.apm.slo.listing.defaults.tier', {
          defaultMessage: 'tier: {value}',
          values: { value: traitMajorities.tier.value },
        })
      );
    }
    if (traitMajorities.mode.isDominant && traitMajorities.mode.value) {
      parts.push(
        i18n.translate('observability.apm.slo.listing.defaults.mode', {
          defaultMessage: 'mode: {value}',
          values: { value: traitMajorities.mode.value },
        })
      );
    }
    if (traitMajorities.enabled.isDominant && traitMajorities.enabled.value) {
      parts.push(
        i18n.translate('observability.apm.slo.listing.defaults.enabled', {
          defaultMessage: 'enabled: {value}',
          values: { value: traitMajorities.enabled.value },
        })
      );
    }
    return parts.length > 0
      ? i18n.translate('observability.apm.slo.listing.defaults.prefix', {
          defaultMessage: 'Defaults — {parts}',
          values: { parts: parts.join(' · ') },
        })
      : null;
  }, [traitMajorities]);

  // EuiBasicTable render signature:
  //   - with `field`:    render(value, row)
  //   - without `field`: render(row)
  // Every column below omits `field` and takes `row` as the only argument.
  const columns = useMemo<Array<EuiBasicTableColumn<SloSummary>>>(
    () => [
      {
        name: i18n.translate('observability.apm.slo.listing.column.name', {
          defaultMessage: 'Name',
        }),
        // Give Name a real share of the table so it isn't the squeeze victim of
        // auto-layout, and truncate to a single line (full name on hover +
        // detail link) so long names don't word-break into 3-4 line rows on
        // narrower screens.
        width: '30%',
        truncateText: true,
        render: (row: SloSummary) => (
          // Plain flex + explicit ellipsis styles (rather than EUI flex + the
          // eui-textTruncate class alone): in a fixed-layout table the tooltip
          // anchor otherwise grows to its nowrap min-content width and overflows
          // into the next column. `overflow:hidden` + `minWidth:0` on the text
          // wrapper forces it to shrink to the cell and clip with an ellipsis.
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <EuiIcon
              type={templateIconFor(row)}
              size="m"
              color="subdued"
              style={{ flexShrink: 0 }}
              data-test-subj={`slosNameIcon-${row.id}`}
            />
            <div style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden' }}>
              <EuiToolTip content={row.name} anchorClassName="eui-textTruncate" display="block">
                <EuiLink
                  href={`#/slos/${encodeURIComponent(row.id)}`}
                  data-test-subj={`slosLink-${row.id}`}
                >
                  <span
                    style={{
                      display: 'block',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontWeight: 700,
                      fontSize: '0.875rem',
                    }}
                  >
                    {row.name}
                  </span>
                </EuiLink>
              </EuiToolTip>
            </div>
          </div>
        ),
      },
      {
        name: i18n.translate('observability.apm.slo.listing.column.service', {
          defaultMessage: 'Service',
        }),
        // Deterministic widths + single-line truncation on the secondary text
        // columns so the extra room Name gives up doesn't just move the wrapping
        // problem onto Service/Owner/Objectives.
        width: '15%',
        truncateText: true,
        render: (row: SloSummary) => (
          <EuiToolTip content={row.service} anchorClassName="eui-textTruncate" display="block">
            <EuiText size="s" className="eui-textTruncate">
              {row.service}
            </EuiText>
          </EuiToolTip>
        ),
      },
      {
        name: i18n.translate('observability.apm.slo.listing.column.owner', {
          defaultMessage: 'Owner',
        }),
        width: '13%',
        truncateText: true,
        render: (row: SloSummary) => {
          const owner = row.owner.teams.join(', ') || '—';
          return (
            <EuiToolTip content={owner} anchorClassName="eui-textTruncate" display="block">
              <EuiText size="s" className="eui-textTruncate">
                {owner}
              </EuiText>
            </EuiToolTip>
          );
        },
      },
      {
        name: i18n.translate('observability.apm.slo.listing.column.objectives', {
          defaultMessage: 'Objectives',
        }),
        width: '120px',
        render: (row: SloSummary) => (
          <EuiText size="s" style={{ whiteSpace: 'nowrap', ...TABULAR_NUMS_STYLE }}>
            {row.objectiveCount} • {formatTargetPct(row.worstTarget)}
          </EuiText>
        ),
      },
      {
        name: i18n.translate('observability.apm.slo.listing.column.traits', {
          defaultMessage: 'Traits',
        }),
        width: '140px',
        render: (row: SloSummary) => <SloTraitsCell row={row} majorities={traitMajorities} />,
      },
      {
        name: i18n.translate('observability.apm.slo.listing.column.rules', {
          defaultMessage: 'Rules',
        }),
        width: '110px',
        render: (row: SloSummary) => <SloRulesBadge row={row} />,
      },
      {
        name: i18n.translate('observability.apm.slo.listing.column.health', {
          defaultMessage: 'Health',
        }),
        width: '200px',
        render: (row: SloSummary) => <SloHealthCell row={row} />,
      },
    ],
    [traitMajorities]
  );

  const hasAnyFilter = useMemo(
    () =>
      Object.keys(filters).some((k) => {
        const v = (filters as Record<string, unknown>)[k];
        if (Array.isArray(v)) return v.length > 0;
        return v !== undefined && v !== '';
      }),
    [filters]
  );

  // Filter changes always reset the cursor to page 1 — the cursor is bound
  // to the filter fingerprint (server-side), and stale cursors silently
  // reset to page 1 anyway. Resetting client-side keeps the URL clean.
  const setFiltersAndResetCursor = useCallback<typeof setFilters>((next) => {
    setCursor(null);
    setFilters(next);
  }, []);

  const clearAllFilters = useCallback(
    () => setFiltersAndResetCursor({}),
    [setFiltersAndResetCursor]
  );

  // Rank the available datasources by SLO count (highest first, count > 0),
  // capped at DATASOURCE_SELECTION_CAP. A lightweight per-datasource `total`
  // probe (pageSize=1) drives the ranking; a failed probe counts as 0 so one
  // bad datasource can't block the rest. Shared by the landing auto-select and
  // the empty-state "Show all" recovery so both pick the same set.
  const rankTopDatasourceNames = useCallback(async (): Promise<string[]> => {
    const counts = await Promise.all(
      promDatasources.map(async (d) => {
        try {
          const res = await apiClient.list(
            { datasourceId: [d.name], sliBackend: ['prometheus'], pageSize: 1 },
            null
          );
          return { name: d.name, total: res.total };
        } catch {
          return { name: d.name, total: 0 };
        }
      })
    );
    return counts
      .filter((c) => c.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, DATASOURCE_SELECTION_CAP)
      .map((c) => c.name);
  }, [apiClient, promDatasources]);

  // Recovery from the empty-scope state: actually *check* the datasource boxes
  // (the top ones by SLO count, matching the landing auto-select) rather than
  // clearing the filter — the checked state must match what's displayed. Falls
  // back to the first cap datasources when none report SLOs so the button
  // always yields a non-empty scope. Preserves any other active facets.
  const showAllDatasources = useCallback(() => {
    void (async () => {
      const ranked = await rankTopDatasourceNames();
      const names = ranked.length
        ? ranked
        : promDatasources.slice(0, DATASOURCE_SELECTION_CAP).map((d) => d.name);
      setFiltersAndResetCursor((f) => ({ ...f, datasourceId: names }));
    })();
  }, [rankTopDatasourceNames, promDatasources, setFiltersAndResetCursor]);

  // Datasource scope on landing (runs once): honor an explicit URL filter
  // (shared/bookmarked link) first; else restore this tab's remembered
  // selection; else auto-select the (up to DATASOURCE_SELECTION_CAP)
  // datasources with the most SLOs. Flips `scopeReady` at every terminal branch
  // so the first fetch is held until the scope is settled (no unscoped flash).
  // See slo_datasource_scope_cache.
  const dsScopeKey = useMemo(() => datasourceScopeCacheKey(), []);
  const dsScopeResolvedRef = useRef(false);
  useEffect(() => {
    if (dsScopeResolvedRef.current) return;
    // Wait for the datasource catalog before ranking / restoring.
    if (promDatasourcesLoading) return;
    dsScopeResolvedRef.current = true;

    // URL wins: an explicit ?datasourceId= is honored as-is, but heal a legacy
    // link that carries data-connection saved-object ids — map any id to its
    // connection name (what the facet, badge, and server all key on) so the
    // scope resolves to real results and the checkbox state stays consistent.
    // Unknown values pass through unchanged.
    const urlDatasourceId = deserializeFiltersFromSearch(location.search).datasourceId;
    if (urlDatasourceId?.length) {
      const nameById = new Map(promDatasources.map((d) => [d.id, d.name]));
      const normalized = Array.from(new Set(urlDatasourceId.map((v) => nameById.get(v) ?? v)));
      const differs =
        normalized.length !== urlDatasourceId.length ||
        normalized.some((v, i) => v !== urlDatasourceId[i]);
      if (differs) {
        setFiltersAndResetCursor((f) => ({ ...f, datasourceId: normalized }));
      }
      setScopeReady(true);
      return;
    }

    // Remembered scope for this tab/workspace. `all` leaves the filter unset
    // (show everything); `scope` restores the exact selection — including an
    // empty one, which means the user deliberately unchecked everything (show
    // nothing). Either way, don't re-run the auto-select.
    const cached = readDatasourceScope(dsScopeKey);
    if (cached) {
      if (cached.kind === 'scope') {
        setFiltersAndResetCursor((f) => ({ ...f, datasourceId: cached.ids }));
      }
      setScopeReady(true);
      return;
    }

    // Nothing to rank if the catalog is empty.
    if (promDatasources.length === 0) {
      setScopeReady(true);
      return;
    }

    let cancelled = false;
    (async () => {
      const top = await rankTopDatasourceNames();
      if (cancelled) return;
      if (top.length > 0) {
        setFiltersAndResetCursor((f) => ({ ...f, datasourceId: top }));
      }
      setScopeReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    promDatasourcesLoading,
    promDatasources,
    dsScopeKey,
    rankTopDatasourceNames,
    location.search,
    setFiltersAndResetCursor,
  ]);

  // Persist the datasource selection for this tab after the initial resolve, so
  // a return visit in the same tab restores it instead of re-auto-selecting.
  // Gated on the resolve ref so the initial (pre-resolve) empty state isn't
  // written as a deliberate "show all".
  useEffect(() => {
    if (!dsScopeResolvedRef.current) return;
    writeDatasourceScope(dsScopeKey, scopeFromFilter(filters.datasourceId));
  }, [filters.datasourceId, dsScopeKey]);

  const onPrev = useCallback(() => {
    if (prevCursor) setCursor(prevCursor);
  }, [prevCursor]);
  const onNext = useCallback(() => {
    if (nextCursor) setCursor(nextCursor);
  }, [nextCursor]);
  const onPageSizeChange = useCallback((next: number) => {
    setPageSize(next);
    setCursor(null);
  }, []);

  // Build the shared ActiveFilterBadges rows. Each badge clears all values for
  // its category at once — mirrors services_home.
  const activeFilters: FilterBadge[] = useMemo(() => {
    const badges: FilterBadge[] = [];
    const clearKey = (key: keyof SloListFilters) =>
      setFiltersAndResetCursor((f) => {
        const next = { ...f };
        delete next[key];
        return next;
      });
    if (filters.datasourceId?.length) {
      // `filters.datasourceId` now holds datasource *names* (see DatasourceFacet).
      // Tolerate a legacy id from an old URL by falling back to an id→name map.
      const nameById = new Map(promDatasources.map((d) => [d.id, d.name]));
      badges.push({
        key: 'datasourceId',
        category: i18n.translate('observability.apm.slo.listing.activeFilter.datasource', {
          defaultMessage: 'Datasource',
        }),
        values: filters.datasourceId.map((value) => nameById.get(value) ?? value),
        onRemove: () => clearKey('datasourceId'),
      });
    }
    if (filters.state?.length) {
      badges.push({
        key: 'state',
        category: i18n.translate('observability.apm.slo.listing.activeFilter.state', {
          defaultMessage: 'State',
        }),
        values: filters.state.map((v) => getSloHealthLabel(v)),
        onRemove: () => clearKey('state'),
      });
    }
    if (filters.sliLeafType?.length) {
      badges.push({
        key: 'sliLeafType',
        category: i18n.translate('observability.apm.slo.listing.activeFilter.sliType', {
          defaultMessage: 'SLI type',
        }),
        values: filters.sliLeafType,
        onRemove: () => clearKey('sliLeafType'),
      });
    }
    if (filters.service?.length) {
      badges.push({
        key: 'service',
        category: i18n.translate('observability.apm.slo.listing.activeFilter.service', {
          defaultMessage: 'Service',
        }),
        values: filters.service,
        onRemove: () => clearKey('service'),
      });
    }
    if (filters.team?.length) {
      badges.push({
        key: 'team',
        category: i18n.translate('observability.apm.slo.listing.activeFilter.team', {
          defaultMessage: 'Team',
        }),
        values: filters.team,
        onRemove: () => clearKey('team'),
      });
    }
    if (filters.tier?.length) {
      badges.push({
        key: 'tier',
        category: i18n.translate('observability.apm.slo.listing.activeFilter.tier', {
          defaultMessage: 'Tier',
        }),
        values: filters.tier,
        onRemove: () => clearKey('tier'),
      });
    }
    if (filters.canonicalKind?.length) {
      badges.push({
        key: 'canonicalKind',
        category: i18n.translate('observability.apm.slo.listing.activeFilter.canonicalKind', {
          defaultMessage: 'Canonical kind',
        }),
        values: filters.canonicalKind.map((k) => KIND_LABEL[k] ?? k),
        onRemove: () => clearKey('canonicalKind'),
      });
    }
    if (filters.mode?.length) {
      badges.push({
        key: 'mode',
        category: i18n.translate('observability.apm.slo.listing.activeFilter.mode', {
          defaultMessage: 'Mode',
        }),
        values: filters.mode.map((v) => MODE_LABEL[v] ?? v),
        onRemove: () => clearKey('mode'),
      });
    }
    if (filters.enabled !== undefined) {
      badges.push({
        key: 'enabled',
        category: i18n.translate('observability.apm.slo.listing.activeFilter.enabled', {
          defaultMessage: 'Enabled',
        }),
        values: [
          filters.enabled
            ? i18n.translate('observability.apm.slo.listing.activeFilter.enabledYes', {
                defaultMessage: 'Yes',
              })
            : i18n.translate('observability.apm.slo.listing.activeFilter.enabledNo', {
                defaultMessage: 'No',
              }),
        ],
        onRemove: () => clearKey('enabled'),
      });
    }
    if (filters.search && filters.search.trim().length > 0) {
      badges.push({
        key: 'search',
        category: i18n.translate('observability.apm.slo.listing.activeFilter.search', {
          defaultMessage: 'Search',
        }),
        values: [`"${filters.search}"`],
        onRemove: () => clearKey('search'),
      });
    }
    return badges;
  }, [filters, promDatasources, setFiltersAndResetCursor]);

  const createButton = (
    <EuiButton
      fill
      href="#/slos/create"
      data-test-subj="slosCreate"
      size="s"
      iconType="plusInCircle"
    >
      {i18n.translate('observability.apm.slo.listing.createButton', {
        defaultMessage: 'Create SLO',
      })}
    </EuiButton>
  );

  const refreshButton = (
    <EuiButtonEmpty
      onClick={refresh}
      data-test-subj="slosRefresh"
      size="s"
      iconType="refresh"
      isLoading={loading}
    >
      {i18n.translate('observability.apm.slo.listing.refreshButton', {
        defaultMessage: 'Refresh',
      })}
    </EuiButtonEmpty>
  );

  // Overview panel tile-click: map the tile to a state filter slice so the
  // strip + chips stay in sync with the tile highlight.
  const overviewActive = filterStateToTile(filters.state);
  const setOverviewStateFilter = useCallback(
    (tile: SloHealthState | 'firing' | null) => {
      setFiltersAndResetCursor((prev) => ({ ...prev, state: stateTileToFilterState(tile) }));
    },
    [setFiltersAndResetCursor]
  );

  const onSearchChange = useCallback(
    (next: string) => {
      setFiltersAndResetCursor((f) => ({ ...f, search: next || undefined }));
    },
    [setFiltersAndResetCursor]
  );

  // --- Render states ---
  // An explicit empty datasource scope (all boxes unchecked) counts as an
  // active filter for empty-state purposes (see `datasourceScopeEmpty` above),
  // so we show the tailored "No datasources selected" prompt rather than the
  // "create your first SLO" onboarding prompt.
  const isFirstLoad = loading && items.length === 0 && totalUnfiltered === null;
  const noSlosExist =
    !loading &&
    !hasAnyFilter &&
    !datasourceScopeEmpty &&
    items.length === 0 &&
    (totalUnfiltered ?? 0) === 0;
  const filteredToZero = !loading && (hasAnyFilter || datasourceScopeEmpty) && items.length === 0;

  return (
    <EuiPage data-test-subj="slosPage">
      <EuiPageBody component="main">
        <HeaderControlledComponentsWrapper
          components={
            // Surface Suggest SLOs in the toolbar (left of Create) once the
            // workspace already has SLOs — it's the easier path than the manual
            // create wizard. Hidden only in the zero-SLO onboarding state (where
            // the empty state already leads with Suggest) and during first load /
            // error, so it still shows when the user arrives with a filter active.
            !isFirstLoad && !error && !noSlosExist
              ? [refreshButton, <SloSuggestHeaderButton key="suggest" />, createButton]
              : [refreshButton, createButton]
          }
        />
        <EuiPageContent color="transparent" hasBorder={false} paddingSize="none">
          <EuiPageContentBody>
            {isFirstLoad ? (
              // m5: first load previously swapped the whole region for a single
              // centered spinner, so the table jumped in when data arrived.
              // Render skeleton rows in a panel of the same shape as the table
              // panel instead, so the layout stays put. This EUI version has no
              // EuiSkeleton; EuiLoadingContent is the shipped skeleton primitive
              // (animated placeholder lines) and is used elsewhere in the repo.
              <EuiPanel data-test-subj="slosLoadingSkeleton">
                <EuiText size="m">
                  <h4>
                    {i18n.translate('observability.apm.slo.listing.catalogTitle', {
                      defaultMessage: 'SLO catalog',
                    })}
                  </h4>
                </EuiText>
                <EuiSpacer size="s" />
                <EuiLoadingContent lines={8} />
              </EuiPanel>
            ) : error ? (
              <EuiPanel>
                <EuiEmptyPrompt
                  iconType="alert"
                  color="danger"
                  title={
                    <h2>
                      {i18n.translate('observability.apm.slo.listing.errorState.title', {
                        defaultMessage: 'Unable to load SLOs',
                      })}
                    </h2>
                  }
                  body={<p>{error.message}</p>}
                  actions={
                    <EuiButton onClick={refresh}>
                      {i18n.translate('observability.apm.slo.listing.errorState.retry', {
                        defaultMessage: 'Retry',
                      })}
                    </EuiButton>
                  }
                />
              </EuiPanel>
            ) : noSlosExist ? (
              <SloNoSlosEmptyState />
            ) : (
              <EuiResizableContainer style={{ marginTop: '8px' }}>
                {(EuiResizablePanel, EuiResizableButton) => (
                  <>
                    <EuiResizablePanel
                      id="slosFilterSidebar"
                      initialSize={18}
                      minSize="12%"
                      paddingSize="none"
                      style={{ paddingTop: '8px', paddingRight: '8px' }}
                    >
                      <EuiPanel style={{ height: '100%', overflowY: 'auto' }} paddingSize="s">
                        <EuiText size="xs">
                          <strong>
                            {i18n.translate('observability.apm.slo.listing.filtersTitle', {
                              defaultMessage: 'Filters',
                            })}
                          </strong>
                        </EuiText>
                        <EuiSpacer size="xs" />
                        <SloListFilterPanel
                          filters={filters}
                          onChange={setFiltersAndResetCursor}
                          items={items}
                          datasources={promDatasources}
                          datasourcesLoading={promDatasourcesLoading}
                          datasourcesError={promDatasourcesError}
                          onDatasourceCapReached={() =>
                            notifications.toasts.addWarning({
                              title: i18n.translate(
                                'observability.apm.slo.listing.datasourceCapToast.title',
                                { defaultMessage: 'Datasource selection limit reached' }
                              ),
                              text: i18n.translate(
                                'observability.apm.slo.listing.datasourceCapToast.text',
                                {
                                  defaultMessage:
                                    'You can select at most {cap} datasources at a time.',
                                  values: { cap: DATASOURCE_SELECTION_CAP },
                                }
                              ),
                            })
                          }
                        />
                      </EuiPanel>
                    </EuiResizablePanel>

                    <EuiResizableButton />

                    <EuiResizablePanel
                      initialSize={82}
                      minSize="50%"
                      paddingSize="none"
                      scrollable={false}
                      style={{ padding: '8px 0 0 8px' }}
                    >
                      {items.length > 0 && (
                        <>
                          <SloOverviewPanel
                            items={items}
                            activeStateFilter={overviewActive}
                            onStateFilterChange={setOverviewStateFilter}
                          />
                          <EuiSpacer size="m" />
                        </>
                      )}

                      <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
                        <EuiFlexItem>
                          <EuiFieldSearch
                            placeholder={i18n.translate(
                              'observability.apm.slo.listing.searchPlaceholder',
                              { defaultMessage: 'Filter by name or description' }
                            )}
                            value={filters.search ?? ''}
                            onChange={(e) => onSearchChange(e.target.value)}
                            isClearable
                            compressed
                            fullWidth
                            data-test-subj="slosListingFilterSearch"
                          />
                        </EuiFlexItem>
                      </EuiFlexGroup>
                      {activeFilters.length > 0 && (
                        <>
                          <EuiSpacer size="xs" />
                          <ActiveFilterBadges
                            filters={activeFilters}
                            onClearAll={clearAllFilters}
                          />
                        </>
                      )}
                      <EuiSpacer size="s" />

                      <SlosTablePanel
                        items={items}
                        columns={columns}
                        loading={loading}
                        resultCount={items.length}
                        total={total}
                        pageSize={pageSize}
                        hasMore={nextCursor !== null}
                        hasPrev={prevCursor !== null}
                        filteredToZero={filteredToZero}
                        datasourceScopeEmpty={datasourceScopeEmpty}
                        datasourceCount={promDatasources.length}
                        onClearAllFilters={clearAllFilters}
                        onShowAllDatasources={showAllDatasources}
                        onPrev={onPrev}
                        onNext={onNext}
                        onPageSizeChange={onPageSizeChange}
                        defaultsLine={defaultsLine}
                      />
                    </EuiResizablePanel>
                  </>
                )}
              </EuiResizableContainer>
            )}
          </EuiPageContentBody>
        </EuiPageContent>
      </EuiPageBody>
    </EuiPage>
  );
};

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  EuiBadge,
  EuiBasicTableColumn,
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiEmptyPrompt,
  EuiFieldSearch,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHealth,
  EuiIcon,
  EuiInMemoryTable,
  EuiLink,
  EuiLoadingSpinner,
  EuiPage,
  EuiPageBody,
  EuiPageContent,
  EuiPageContentBody,
  EuiPanel,
  EuiResizableContainer,
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
import { navigateToServicesList } from '../../shared/utils/navigation_utils';
import { SloOverviewPanel } from './slo_overview_panel';
import { DATASOURCE_SELECTION_CAP, SloListFilterPanel } from './slo_list_filter_panel';
import { usePrometheusDatasources } from './use_prometheus_datasources';
import {
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
import { formatPct } from '../../../../../common/slo/format';
import { getSloHealthColor } from '../../../../../common/slo/state';
import { templateIconFor } from './template_icons';
import { KIND_LABEL } from './suggest_engine';

export interface SloListingPageProps {
  apiClient: SloApiClient;
  http: HttpStart;
  chrome: ChromeStart;
  notifications: NotificationsStart;
  parentBreadcrumb: { text: string; href: string };
}

function formatTargetPct(target: number): string {
  return `${(target * 100).toFixed(target >= 0.999 ? 2 : 1)}%`;
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

// Server-side cap on a single listing fetch. The listing has no pagination
// UI yet; rows beyond this cap are dropped on the floor unless filters
// narrow the result set. Surface the truncation via a callout when it
// happens so users aren't silently missing data.
const LISTING_PAGE_SIZE = 100;

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
    ? 'over budget'
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
          <EuiToolTip content={`State: ${state}`}>
            <EuiHealth color={getSloHealthColor(state)}>
              <span style={{ fontSize: 12 }}>{state}</span>
            </EuiHealth>
          </EuiToolTip>
        </EuiFlexItem>
        {isReporting ? (
          <EuiFlexItem grow={true} style={{ textAlign: 'right' }}>
            <EuiToolTip content="Remaining error budget (worst objective).">
              <EuiText
                size="s"
                color={budgetColor === 'default' ? 'default' : budgetColor}
                style={{ fontWeight: 600 }}
              >
                {budgetLabel}
              </EuiText>
            </EuiToolTip>
          </EuiFlexItem>
        ) : null}
        {firing > 0 ? (
          <EuiFlexItem grow={false}>
            <EuiToolTip content={`${firing} alert${firing === 1 ? '' : 's'} firing`}>
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

const STATE_LABEL: Record<SloHealthState, string> = {
  breached: 'Breached',
  warning: 'Warning',
  ok: 'Healthy',
  no_data: 'No data',
  source_idle: 'Source idle',
  stale: 'Stale',
  disabled: 'Disabled',
  rules_missing: 'Rules missing',
};

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
      label: 'Missing',
      color: 'danger',
      iconType: 'alert',
      tooltip:
        'One or more Prometheus rule groups for this SLO are missing from the ruler. Visit the detail page to restore or delete.',
    };
  }
  if (state === 'disabled') {
    return {
      kind: 'disabled',
      label: 'Disabled',
      color: 'hollow',
      tooltip: 'SLO is paused; rule groups are intentionally absent.',
    };
  }
  if (state === 'no_data' || state === 'stale') {
    return {
      kind: 'no-data',
      label: 'No data',
      color: 'warning',
      tooltip: 'Rule groups exist but no samples have arrived yet.',
    };
  }
  if (state === 'source_idle') {
    return {
      kind: 'no-data',
      label: 'Source idle',
      color: 'warning',
      tooltip:
        'Rule groups are evaluating but the source metric has no traffic in the window. Check the upstream metric pipeline.',
    };
  }
  return {
    kind: 'healthy',
    label: 'Active',
    color: 'success',
    tooltip: 'Rule groups deployed and actively evaluating samples.',
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
  active: 'Active',
  shadow: 'Shadow',
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
        {row.enabled ? 'enabled' : 'disabled'}
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
  /** Server-reported total when it exceeds the page; null when not truncated. */
  truncatedTotal: number | null;
  filteredToZero: boolean;
  onClearAllFilters: () => void;
  defaultsLine: string | null;
}

const SlosTablePanelUI: React.FC<SlosTablePanelProps> = ({
  items,
  columns,
  loading,
  resultCount,
  truncatedTotal,
  filteredToZero,
  onClearAllFilters,
  defaultsLine,
}) => {
  if (filteredToZero) {
    return (
      <EuiPanel data-test-subj="slosEmptyFilteredZero">
        <EuiEmptyPrompt
          iconType="search"
          title={<h2>No SLOs match your filters</h2>}
          body={<p>Try widening the filters, or clear them to see every SLO in this workspace.</p>}
          actions={
            <EuiButton onClick={onClearAllFilters} data-test-subj="slosEmptyFilteredClear">
              Clear filters
            </EuiButton>
          }
        />
      </EuiPanel>
    );
  }
  return (
    <EuiPanel>
      <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
        <EuiFlexItem grow={false}>
          <EuiText size="m">
            <h4>SLO catalog</h4>
          </EuiText>
          {defaultsLine ? (
            <EuiText size="xs" color="subdued" data-test-subj="slosListingDefaults">
              {defaultsLine}
            </EuiText>
          ) : null}
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiText size="s" color="subdued" data-test-subj="slosListingResultCount">
            {resultCount} SLO{resultCount === 1 ? '' : 's'}
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="s" />
      {truncatedTotal !== null ? (
        <>
          <EuiCallOut
            size="s"
            color="warning"
            iconType="alert"
            title={`Showing ${resultCount} of ${truncatedTotal} SLOs — narrow the filters to see the rest.`}
            data-test-subj="slosListingTruncated"
          />
          <EuiSpacer size="s" />
        </>
      ) : null}
      <EuiInMemoryTable<SloSummary>
        items={items}
        columns={columns}
        pagination={{
          initialPageSize: 20,
          pageSizeOptions: [10, 20, 50, 100],
        }}
        sorting={{ sort: { field: 'name', direction: 'asc' } }}
        loading={loading}
        data-test-subj="slosTable"
      />
    </EuiPanel>
  );
};

const SlosTablePanel = React.memo(SlosTablePanelUI);

export const SloListingPage: React.FC<SloListingPageProps> = ({
  apiClient,
  http,
  chrome,
  notifications,
  parentBreadcrumb,
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
  const [items, setItems] = useState<SloSummary[]>([]);
  const [totalUnfiltered, setTotalUnfiltered] = useState<number | null>(null);
  // Server returns up to LISTING_PAGE_SIZE rows; if `total` exceeds the page,
  // the listing is silently truncated. Surface that to the user — pagination
  // UI is the longer-term fix; this prevents silent data loss in the meantime.
  const [truncatedTotal, setTruncatedTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    chrome.setBreadcrumbs([parentBreadcrumb, { text: 'SLO/SLI' }]);
  }, [chrome, parentBreadcrumb]);

  // Filter ↔ URL sync. Single effect, guarded by a ref that stores the last
  // serialized string we reconciled. Writing to URL via history.replace
  // intentionally does NOT re-trigger a setFilters, and an external URL
  // change (paste, back button) does NOT re-write the URL we just received.
  // Without this guard the two effects form a loop: write URL → read URL →
  // parse → setFilters(newObj) → compare → write URL → ...
  const lastSyncedSearch = useRef<string>(serializeFiltersToSearch(filters));
  useEffect(() => {
    const rawUrl = location.search.startsWith('?') ? location.search.slice(1) : location.search;
    const fromState = serializeFiltersToSearch(filters);

    if (fromState === rawUrl) {
      lastSyncedSearch.current = fromState;
      return;
    }

    if (rawUrl !== lastSyncedSearch.current) {
      const parsed = deserializeFiltersFromSearch(location.search);
      if (!filtersEqual(parsed, filters)) {
        lastSyncedSearch.current = rawUrl;
        setFilters(parsed);
      }
      return;
    }

    lastSyncedSearch.current = fromState;
    history.replace({
      pathname: location.pathname,
      search: fromState.length ? `?${fromState}` : '',
    });
  }, [filters, location.search, location.pathname, history]);

  const load = useCallback(
    async (isCurrent: () => boolean) => {
      setLoading(true);
      setError(null);
      try {
        // Listing is Prometheus-scoped by default — the SLI backend facet was
        // dropped from the sidebar in favor of a single-backend default. URL
        // callers can still override via `?sliBackend=opensearch`.
        const effectiveFilters: SloListFilters = {
          ...filters,
          sliBackend: filters.sliBackend?.length ? filters.sliBackend : ['prometheus'],
          pageSize: LISTING_PAGE_SIZE,
        };
        const result = await apiClient.list(effectiveFilters);
        if (!isCurrent()) return;
        setItems(result.results);
        setTruncatedTotal(result.total > result.results.length ? result.total : null);
        if (Object.keys(filters).length === 0) {
          setTotalUnfiltered(result.total);
        }
      } catch (e) {
        if (!isCurrent()) return;
        const err = e instanceof Error ? e : new Error(String(e));
        setError(err);
        notifications.toasts.addDanger({
          title: 'Failed to load SLOs',
          text: err.message,
        });
      } finally {
        if (isCurrent()) setLoading(false);
      }
    },
    [apiClient, filters, notifications]
  );

  useEffect(() => {
    // Stale-fetch guard: rapid filter clicks can fire overlapping `apiClient.list()`
    // requests, and whichever resolves last wins. The flag pins each effect's
    // request to its render cycle so a slower stale response can't clobber the
    // newer state.
    let cancelled = false;
    load(() => !cancelled);
    return () => {
      cancelled = true;
    };
  }, [load]);

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

  // Default sort for the listing: worst remaining budget first (P1 #7).
  // EuiInMemoryTable's sorting={{ field: 'name' }} config takes over as soon as
  // the user clicks a column header — until then, EUI renders items in input
  // order, so pre-sorting here makes "what's burning" the first row instead of
  // whatever's alphabetically first. Stable tiebreaker on name keeps the
  // no-data cluster (every row returns `remaining = 1`) reading alphabetically.
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      const diff = worstBudgetRemaining(a) - worstBudgetRemaining(b);
      if (diff !== 0) return diff;
      return a.name.localeCompare(b.name);
    });
  }, [items]);

  const defaultsLine = useMemo(() => {
    const parts: string[] = [];
    if (traitMajorities.tier.isDominant && traitMajorities.tier.value) {
      parts.push(`tier: ${traitMajorities.tier.value}`);
    }
    if (traitMajorities.mode.isDominant && traitMajorities.mode.value) {
      parts.push(`mode: ${traitMajorities.mode.value}`);
    }
    if (traitMajorities.enabled.isDominant && traitMajorities.enabled.value) {
      parts.push(`enabled: ${traitMajorities.enabled.value}`);
    }
    return parts.length > 0 ? `Defaults — ${parts.join(' · ')}` : null;
  }, [traitMajorities]);

  // EuiBasicTable render signature:
  //   - with `field`:    render(value, row)
  //   - without `field`: render(row)
  // Every column below omits `field` and takes `row` as the only argument.
  const columns = useMemo<Array<EuiBasicTableColumn<SloSummary>>>(
    () => [
      {
        name: 'Name',
        render: (row: SloSummary) => (
          <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiIcon
                type={templateIconFor(row)}
                size="m"
                color="subdued"
                data-test-subj={`slosNameIcon-${row.id}`}
              />
            </EuiFlexItem>
            <EuiFlexItem>
              <EuiLink
                href={`#/slos/${encodeURIComponent(row.id)}`}
                data-test-subj={`slosLink-${row.id}`}
              >
                <EuiText size="s">
                  <strong>{row.name}</strong>
                </EuiText>
              </EuiLink>
            </EuiFlexItem>
          </EuiFlexGroup>
        ),
      },
      {
        name: 'Service',
        render: (row: SloSummary) => <EuiText size="s">{row.service}</EuiText>,
      },
      {
        name: 'Owner',
        render: (row: SloSummary) => (
          <EuiText size="s">{row.owner.teams.join(', ') || '—'}</EuiText>
        ),
      },
      {
        name: 'Objectives',
        render: (row: SloSummary) => (
          <EuiText size="s">
            {row.objectiveCount} • {formatTargetPct(row.worstTarget)}
          </EuiText>
        ),
      },
      {
        name: 'Traits',
        width: '140px',
        render: (row: SloSummary) => <SloTraitsCell row={row} majorities={traitMajorities} />,
      },
      {
        name: 'Rules',
        width: '110px',
        render: (row: SloSummary) => <SloRulesBadge row={row} />,
      },
      {
        name: 'Health',
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

  const clearAllFilters = useCallback(() => setFilters({}), []);

  // Build the shared ActiveFilterBadges rows. Each badge clears all values for
  // its category at once — mirrors services_home.
  const activeFilters: FilterBadge[] = useMemo(() => {
    const badges: FilterBadge[] = [];
    const clearKey = (key: keyof SloListFilters) =>
      setFilters((f) => {
        const next = { ...f };
        delete next[key];
        return next;
      });
    if (filters.datasourceId?.length) {
      const nameById = new Map(promDatasources.map((d) => [d.id, d.name]));
      badges.push({
        key: 'datasourceId',
        category: 'Datasource',
        values: filters.datasourceId.map((id) => nameById.get(id) ?? id),
        onRemove: () => clearKey('datasourceId'),
      });
    }
    if (filters.state?.length) {
      badges.push({
        key: 'state',
        category: 'State',
        values: filters.state.map((v) => STATE_LABEL[v] ?? v),
        onRemove: () => clearKey('state'),
      });
    }
    if (filters.sliLeafType?.length) {
      badges.push({
        key: 'sliLeafType',
        category: 'SLI type',
        values: filters.sliLeafType,
        onRemove: () => clearKey('sliLeafType'),
      });
    }
    if (filters.service?.length) {
      badges.push({
        key: 'service',
        category: 'Service',
        values: filters.service,
        onRemove: () => clearKey('service'),
      });
    }
    if (filters.team?.length) {
      badges.push({
        key: 'team',
        category: 'Team',
        values: filters.team,
        onRemove: () => clearKey('team'),
      });
    }
    if (filters.tier?.length) {
      badges.push({
        key: 'tier',
        category: 'Tier',
        values: filters.tier,
        onRemove: () => clearKey('tier'),
      });
    }
    if (filters.canonicalKind?.length) {
      badges.push({
        key: 'canonicalKind',
        category: 'Canonical kind',
        values: filters.canonicalKind.map((k) => KIND_LABEL[k] ?? k),
        onRemove: () => clearKey('canonicalKind'),
      });
    }
    if (filters.mode?.length) {
      badges.push({
        key: 'mode',
        category: 'Mode',
        values: filters.mode.map((v) => MODE_LABEL[v] ?? v),
        onRemove: () => clearKey('mode'),
      });
    }
    if (filters.enabled !== undefined) {
      badges.push({
        key: 'enabled',
        category: 'Enabled',
        values: [filters.enabled ? 'Yes' : 'No'],
        onRemove: () => clearKey('enabled'),
      });
    }
    if (filters.search && filters.search.trim().length > 0) {
      badges.push({
        key: 'search',
        category: 'Search',
        values: [`"${filters.search}"`],
        onRemove: () => clearKey('search'),
      });
    }
    return badges;
  }, [filters, promDatasources]);

  const createButton = (
    <EuiButton
      fill
      href="#/slos/create"
      data-test-subj="slosCreate"
      size="s"
      iconType="plusInCircle"
    >
      Create SLO
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
      Refresh
    </EuiButtonEmpty>
  );

  // Overview panel tile-click: map the tile to a state filter slice so the
  // strip + chips stay in sync with the tile highlight.
  const overviewActive = filterStateToTile(filters.state);
  const setOverviewStateFilter = useCallback((tile: SloHealthState | 'firing' | null) => {
    setFilters((prev) => ({ ...prev, state: stateTileToFilterState(tile) }));
  }, []);

  const onSearchChange = useCallback((next: string) => {
    setFilters((f) => ({ ...f, search: next || undefined }));
  }, []);

  // --- Render states ---
  const isFirstLoad = loading && items.length === 0 && totalUnfiltered === null;
  const noSlosExist =
    !loading && !hasAnyFilter && items.length === 0 && (totalUnfiltered ?? 0) === 0;
  const filteredToZero = !loading && hasAnyFilter && items.length === 0;

  return (
    <EuiPage data-test-subj="slosPage">
      <EuiPageBody component="main">
        <HeaderControlledComponentsWrapper components={[refreshButton, createButton]} />
        <EuiPageContent color="transparent" hasBorder={false} paddingSize="none">
          <EuiPageContentBody>
            {isFirstLoad ? (
              <EuiFlexGroup alignItems="center" justifyContent="center" style={{ minHeight: 200 }}>
                <EuiFlexItem grow={false}>
                  <EuiLoadingSpinner size="xl" />
                </EuiFlexItem>
              </EuiFlexGroup>
            ) : error ? (
              <EuiPanel>
                <EuiEmptyPrompt
                  iconType="alert"
                  color="danger"
                  title={<h2>Unable to load SLOs</h2>}
                  body={<p>{error.message}</p>}
                  actions={<EuiButton onClick={refresh}>Retry</EuiButton>}
                />
              </EuiPanel>
            ) : noSlosExist ? (
              <EuiPanel style={{ marginTop: '8px' }} data-test-subj="slosEmptyNoSlos">
                <EuiEmptyPrompt
                  iconType="visualizeApp"
                  title={
                    <h2>
                      {i18n.translate('observability.apm.slo.listing.emptyState.title', {
                        defaultMessage: 'No SLOs yet',
                      })}
                    </h2>
                  }
                  body={
                    <p>
                      {i18n.translate('observability.apm.slo.listing.emptyState.body', {
                        defaultMessage:
                          'Track reliability objectives for your APM services. Visit the Services view to see which services are missing SLOs and create them directly from there.',
                      })}
                    </p>
                  }
                  actions={[
                    <EuiButton
                      key="services"
                      fill
                      onClick={navigateToServicesList}
                      data-test-subj="slosEmptyGoToServices"
                    >
                      {i18n.translate('observability.apm.slo.listing.emptyState.goToServices', {
                        defaultMessage: 'Go to Services',
                      })}
                    </EuiButton>,
                    <EuiButtonEmpty
                      key="create"
                      href="#/slos/create"
                      data-test-subj="slosCreateEmpty"
                    >
                      {i18n.translate('observability.apm.slo.listing.emptyState.createManually', {
                        defaultMessage: 'Create manually',
                      })}
                    </EuiButtonEmpty>,
                  ]}
                />
              </EuiPanel>
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
                          <strong>Filters</strong>
                        </EuiText>
                        <EuiSpacer size="xs" />
                        <SloListFilterPanel
                          filters={filters}
                          onChange={setFilters}
                          items={items}
                          datasources={promDatasources}
                          datasourcesLoading={promDatasourcesLoading}
                          datasourcesError={promDatasourcesError}
                          onDatasourceCapReached={() =>
                            notifications.toasts.addWarning({
                              title: 'Datasource selection limit reached',
                              text: `You can select at most ${DATASOURCE_SELECTION_CAP} datasources at a time.`,
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
                            placeholder="Filter by name, service, or description"
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
                        items={sortedItems}
                        columns={columns}
                        loading={loading}
                        resultCount={items.length}
                        truncatedTotal={truncatedTotal}
                        filteredToZero={filteredToZero}
                        onClearAllFilters={clearAllFilters}
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

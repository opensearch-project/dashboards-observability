/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Enhanced Monitors Table — search, filter, sort, saved searches, and bulk
 * delete.
 *
 * This file is the top-level component and state owner. Sub-files in this
 * folder:
 *   - `monitors_table_columns.tsx`  — ColumnId, DEFAULT_VISIBLE, cell renderers
 *   - `monitors_table_filters.tsx`  — FilterState + search/filter/label helpers
 *   - `monitors_table_helpers.ts`   — constants + SavedSearch type
 *   - `resizable_columns.ts`        — DEFAULT_WIDTHS + `useResizableColumns`
 *   - `monitors_eui_table.tsx`      — memoized EuiInMemoryTable wrapper
 *   - `monitors_filters_panel.tsx`  — left-hand filters-panel render
 *   - `monitors_main_panel.tsx`     — right-hand table-panel render
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EuiResizableContainer } from '@elastic/eui';
import semver from 'semver';
import { Datasource, UnifiedRuleSummary } from '../../../../common/types/alerting';
import { coreRefs } from '../../../framework/core_refs';
import { useFacetCollapse } from '../facet_filter_panel';
import { BASE_PPL_ALERTING_SUPPORTED_VERSION } from '../shared_constants';
import {
  buildTableColumns,
  DEFAULT_VISIBLE,
  isSelectableRuleDefinition,
} from './monitors_table_columns';
import {
  buildSuggestions,
  collectLabelKeys,
  collectUniqueValues,
  emptyFilters,
  FilterState,
  matchesFilters,
  matchesSearch,
} from './monitors_table_filters';
import { SavedSearch } from './monitors_table_helpers';
import { DEFAULT_WIDTHS, useResizableColumns } from './resizable_columns';
import { MonitorsFiltersPanel } from './monitors_filters_panel';
import { MonitorsMainPanel } from './monitors_main_panel';
import '../alerting.scss';

interface MonitorsTableProps {
  rules: UnifiedRuleSummary[];
  datasources: Datasource[];
  loading: boolean;
  onDelete: (ids: string[]) => void;
  onClone?: (monitor: UnifiedRuleSummary) => void;
  onEdit?: (monitor: UnifiedRuleSummary) => void;
  onEditDetectorSettings?: (detector: UnifiedRuleSummary) => void;
  onEditDetectorFeatures?: (detector: UnifiedRuleSummary) => void;
  onEditForecaster?: (forecaster: UnifiedRuleSummary) => void;
  onStartResources?: (resources: UnifiedRuleSummary[]) => Promise<void> | void;
  onStopResources?: (resources: UnifiedRuleSummary[]) => Promise<void> | void;
  /**
   * Optional Disable / Enable handler. Forwarded to the detail flyout.
   * Wired only for PPL monitors at the page layer.
   */
  onToggleEnabled?: (monitor: UnifiedRuleSummary) => Promise<void> | void;
  onCreateMonitor?: (
    type: 'logs' | 'prometheus' | 'metrics' | 'slo' | 'detector' | 'forecaster'
  ) => void;
  /** Currently selected datasource IDs */
  selectedDsIds: string[];
  /** Callback when datasource selection changes */
  onDatasourceChange: (ids: string[]) => void;
  /** Cap on concurrently selected datasources (from uiSettings). */
  maxDatasources: number;
  /** Callback fired when user tries to exceed `maxDatasources`. */
  onDatasourceCapReached: () => void;
  /**
   * Optional pre-fill for the search box. Used by deep links from the SLO
   * detail page so users can jump straight to a specific recording rule
   * without typing it. Empty / undefined leaves the box blank.
   */
  initialSearchQuery?: string;
}

interface AlertingSettingsResponse {
  ok?: boolean;
  resp?: {
    transient?: { cluster?: { pluggable?: Record<string, unknown> } };
    persistent?: { cluster?: { pluggable?: Record<string, unknown> } };
    defaults?: { cluster?: { pluggable?: Record<string, unknown> } };
  };
}

// ============================================================================
// Main Component
// ============================================================================

export const MonitorsTable: React.FC<MonitorsTableProps> = ({
  rules,
  datasources,
  loading,
  onDelete,
  onClone,
  onEdit,
  onEditDetectorSettings,
  onEditDetectorFeatures,
  onEditForecaster,
  onStartResources,
  onStopResources,
  onToggleEnabled,
  onCreateMonitor,
  selectedDsIds,
  onDatasourceChange,
  maxDatasources,
  onDatasourceCapReached,
  initialSearchQuery,
}) => {
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery ?? '');
  // Re-seed the search box whenever the parent supplies a fresh
  // `initialSearchQuery`. The page propagates a hashchange-driven
  // `deepLink.q` into this prop so cross-tab deep-links from inside the
  // alerting app (alert-flyout "Open monitor" — BUG-14) update the
  // filter live. Falsy values (empty string / undefined) don't clobber
  // the user's typed query — only an actual deep-link update overrides.
  useEffect(() => {
    if (initialSearchQuery && initialSearchQuery.trim() !== '') {
      setSearchQuery(initialSearchQuery);
    }
  }, [initialSearchQuery]);
  const [filters, setFilters] = useState<FilterState>(emptyFilters());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({ ...DEFAULT_WIDTHS });
  const [selectedMonitor, setSelectedMonitor] = useState<UnifiedRuleSummary | null>(null);
  // Keep `selectedMonitor` in sync with the latest version of itself in the
  // rules list. Without this, an optimistic update at the page level (e.g.
  // toggling `enabled` from the detail flyout) wouldn't reflect back into
  // the flyout's button label / status pill — the flyout would render off
  // a stale snapshot until the user closes and reopens it.
  useEffect(() => {
    if (!selectedMonitor) return;
    const fresh = rules.find((r) => r.id === selectedMonitor.id);
    if (!fresh) return;
    if (fresh !== selectedMonitor) setSelectedMonitor(fresh);
  }, [rules, selectedMonitor]);
  const [showCreatePopover, setShowCreatePopover] = useState(false);
  const [showSaveSearchInput, setShowSaveSearchInput] = useState(false);
  const [saveSearchName, setSaveSearchName] = useState('');
  const searchRef = useRef<HTMLDivElement>(null);
  const tableWrapperRef = useRef<HTMLDivElement>(null);

  // Column-customization UI was removed — render the default visible set.
  const visibleColumns = useMemo(() => new Set(DEFAULT_VISIBLE), []);

  const rowProps = useCallback(
    (item: UnifiedRuleSummary) => ({
      style: selectedIds.has(item.id) ? { backgroundColor: '#F0F5FF' } : undefined,
    }),
    [selectedIds]
  );

  const dsNameMap = useMemo(() => new Map(datasources.map((d) => [d.id, d.name])), [datasources]);

  // Prefetch AnalyticEngine status for OpenSearch datasources.
  // An AnalyticEngine domain has cluster.pluggable.dataformat.enabled === true.
  const [analyticEngineCache, setAnalyticEngineCache] = useState<Map<string, boolean>>(new Map());
  useEffect(() => {
    const http = coreRefs.http;
    if (!http) return;
    const osDs = datasources.filter(
      (d) => d.type === 'opensearch' && d.engineType !== 'OpenSearch Serverless' && d.mdsId
    );
    if (osDs.length === 0) return;
    let cancelled = false;
    (async () => {
      const cache = new Map<string, boolean>();
      await Promise.all(
        osDs.map(async (ds) => {
          try {
            const resp = await http.get<AlertingSettingsResponse>('../api/alerting/_settings', {
              query: { dataSourceId: ds.mdsId },
            });
            if (resp?.ok && resp.resp) {
              const val =
                resp.resp.transient?.cluster?.pluggable?.['dataformat.enabled'] ??
                resp.resp.persistent?.cluster?.pluggable?.['dataformat.enabled'] ??
                resp.resp.defaults?.cluster?.pluggable?.['dataformat.enabled'];
              cache.set(ds.id, val === 'true' || val === true);
            } else {
              cache.set(ds.id, false);
            }
          } catch {
            cache.set(ds.id, false);
          }
        })
      );
      if (!cancelled) setAnalyticEngineCache(cache);
    })();
    return () => {
      cancelled = true;
    };
  }, [datasources]);

  const isAnalyticEngineEnabled = useCallback(
    (datasourceId: string) => analyticEngineCache.get(datasourceId) || false,
    [analyticEngineCache]
  );

  const selectedDatasources = useMemo(
    () =>
      selectedDsIds
        .map((id) => datasources.find((d) => d.id === id))
        .filter((d): d is Datasource => !!d),
    [datasources, selectedDsIds]
  );

  // Logs / Metrics popover entries are grayed out when the parent's selection
  // can't satisfy them: Logs needs at least one OpenSearch datasource with
  // version >= 3.5.0 (or serverless), Metrics needs at least one Prometheus.
  // The empty-selection case used to fall through to "both enabled", but the
  // spec is "no datasource selected → no create options viable" — Logs without
  // a supported OS DS is undefined, Metrics without a Prometheus DS is
  // undefined. Gate both so the user can't enter a flyout that will silently
  // re-default the datasource on them.
  const [logsCreateDisabled] = useMemo(() => {
    if (selectedDatasources.length === 0) return [true, 'no_selection'] as const;
    const osSelected = selectedDatasources.filter((d) => d.type === 'opensearch');
    if (osSelected.length === 0) return [true, 'no_os_datasource'] as const;
    // Check if any selected OS datasource supports PPL alerting
    const hasSupportedDs = osSelected.some((d) => {
      if (!d.mdsId) return true; // Local cluster — no version metadata available
      if (d.engineType === 'OpenSearch Serverless') return true;
      if (isAnalyticEngineEnabled(d.id)) return true;
      if (!d.version) return false;
      const coerced = semver.coerce(d.version);
      return coerced ? semver.gte(coerced, BASE_PPL_ALERTING_SUPPORTED_VERSION) : false;
    });
    if (!hasSupportedDs) return [true, 'version_unsupported'] as const;
    return [false, ''] as const;
  }, [selectedDatasources, isAnalyticEngineEnabled]);

  const metricsCreateDisabled = useMemo(() => {
    if (selectedDatasources.length === 0) return true;
    // Always allow Metrics creation when at least one datasource is selected —
    // the Prometheus data-connection may exist on the cluster without a
    // corresponding MDS saved object (discovered via SQL plugin API, not SO).
    return false;
  }, [selectedDatasources]);

  const detectorCreateDisabled = useMemo(() => {
    return !selectedDatasources.some((d) => d.type === 'opensearch');
  }, [selectedDatasources]);

  const forecasterCreateDisabled = useMemo(() => {
    return !selectedDatasources.some((d) => d.type === 'opensearch');
  }, [selectedDatasources]);

  // Build selectable datasource entries for the filter facet — alpha by name
  const datasourceEntries = useMemo(
    () =>
      datasources
        .map((ds) => ({ id: ds.id, label: ds.name }))
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })),
    [datasources]
  );

  const allSuggestions = useMemo(() => buildSuggestions(rules), [rules]);
  const labelKeys = useMemo(() => collectLabelKeys(rules), [rules]);

  // Update suggestions as user types
  useEffect(() => {
    if (!searchQuery) {
      setSuggestions([]);
      return;
    }
    const q = searchQuery.toLowerCase();
    const matches = allSuggestions.filter((s) => s.toLowerCase().includes(q)).slice(0, 10);
    setSuggestions(matches);
  }, [searchQuery, allSuggestions]);

  // Close suggestions on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Filter (sorting is handled by EuiInMemoryTable via the column `sortable` keys)
  const filtered = useMemo(
    () => rules.filter((r) => matchesSearch(r, searchQuery) && matchesFilters(r, filters)),
    [rules, searchQuery, filters]
  );
  const selectableIds = useMemo(
    () => new Set(rules.filter(isSelectableRuleDefinition).map((r) => r.id)),
    [rules]
  );
  useEffect(() => {
    setSelectedIds((prev) => {
      const next = new Set(Array.from(prev).filter((id) => selectableIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [selectableIds]);

  // Prune selectedIds that are no longer in the filtered list (e.g., after
  // search/filter changes remove items from view).
  useEffect(() => {
    const visibleIds = new Set(filtered.map((r) => r.id));
    setSelectedIds((prev) => {
      const pruned = new Set([...prev].filter((id) => visibleIds.has(id)));
      return pruned.size === prev.size ? prev : pruned;
    });
  }, [filtered]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    count += filters.status.length;
    count += filters.severity.length;
    count += filters.monitorType.length;
    count += filters.healthStatus.length;
    count += filters.createdBy.length;
    count += filters.destinations.length;
    for (const vals of Object.values(filters.labels)) count += vals.length;
    return count;
  }, [filters]);

  // Selection
  const toggleSelect = (id: string) => {
    if (!selectableIds.has(id)) return;
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };
  const toggleSelectAll = () => {
    const selectableFiltered = filtered.filter(isSelectableRuleDefinition);
    const allSelected =
      selectableFiltered.length > 0 && selectableFiltered.every((r) => selectedIds.has(r.id));
    const next = new Set(selectedIds);
    if (allSelected) selectableFiltered.forEach((r) => next.delete(r.id));
    else selectableFiltered.forEach((r) => next.add(r.id));
    setSelectedIds(next);
  };

  // Saved searches
  const saveCurrentSearch = () => {
    setShowSaveSearchInput(true);
  };
  const loadSavedSearch = (ss: SavedSearch) => {
    setSearchQuery(ss.query);
    setFilters(ss.filters);
  };
  const deleteSavedSearch = (id: string) => {
    setSavedSearches((prev) => prev.filter((s) => s.id !== id));
  };

  // Bulk delete
  const handleBulkDelete = () => {
    const deletableIds = Array.from(selectedIds).filter((id) => selectableIds.has(id));
    if (deletableIds.length === 0) return;
    onDelete(deletableIds);
    setSelectedIds(new Set());
    setShowDeleteConfirm(false);
  };

  const handleLifecycleAction = useCallback(
    async (
      resources: UnifiedRuleSummary[],
      handler?: (resourcesToUpdate: UnifiedRuleSummary[]) => Promise<void> | void
    ) => {
      if (!handler || resources.length === 0) return;
      await handler(resources);
      setSelectedIds(new Set());
    },
    []
  );

  // Build table columns from visible set
  const tableColumns = useMemo(() => {
    return buildTableColumns({
      visibleColumns,
      filtered,
      selectedIds,
      columnWidths,
      dsNameMap,
      toggleSelect,
      toggleSelectAll,
      setSelectedMonitor,
    });
    // `toggleSelect`/`toggleSelectAll` are recreated every render; adding them
    // would invalidate this memo every render. The closures only read from
    // `selectedIds`/`filtered` which are in the dep list, so staleness is
    // bounded to the same render cycle as the columns.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleColumns, selectedIds, filtered, dsNameMap, columnWidths]);

  // Attach DOM-based resize handles to table header cells
  useResizableColumns(tableWrapperRef, columnWidths, setColumnWidths, visibleColumns);

  // Unique values for filter dropdowns
  const uniqueStatuses = useMemo(() => collectUniqueValues(rules, (r) => r.status), [rules]);
  const uniqueSeverities = useMemo(() => collectUniqueValues(rules, (r) => r.severity), [rules]);
  const uniqueTypes = useMemo(() => collectUniqueValues(rules, (r) => r.monitorType), [rules]);
  const uniqueHealth = useMemo(() => collectUniqueValues(rules, (r) => r.healthStatus), [rules]);
  const uniqueCreators = useMemo(() => collectUniqueValues(rules, (r) => r.createdBy), [rules]);

  const updateFilter = <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const updateLabelFilter = (key: string, values: string[]) => {
    setFilters((prev) => ({
      ...prev,
      labels: { ...prev.labels, [key]: values },
    }));
  };

  const clearAllFilters = () => {
    setFilters(emptyFilters());
    setSearchQuery('');
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveSuggestion((prev) => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveSuggestion((prev) => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter' && activeSuggestion >= 0 && suggestions[activeSuggestion]) {
      e.preventDefault();
      setSearchQuery(suggestions[activeSuggestion]);
      setShowSuggestions(false);
      setActiveSuggestion(-1);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  // Facet helper: count items per value for a given field
  const facetCounts = useMemo(() => {
    // Count against the search-matched (but not filter-matched) rules so counts update with search
    const searchMatched = rules.filter((r) => matchesSearch(r, searchQuery));
    const counts: Record<string, Record<string, number>> = {
      status: {},
      severity: {},
      monitorType: {},
      healthStatus: {},
      createdBy: {},
    };
    for (const r of searchMatched) {
      counts.status[r.status] = (counts.status[r.status] || 0) + 1;
      counts.severity[r.severity] = (counts.severity[r.severity] || 0) + 1;
      counts.monitorType[r.monitorType] = (counts.monitorType[r.monitorType] || 0) + 1;
      counts.healthStatus[r.healthStatus] = (counts.healthStatus[r.healthStatus] || 0) + 1;
      counts.createdBy[r.createdBy] = (counts.createdBy[r.createdBy] || 0) + 1;
    }
    // Label counts
    const labelCounts: Record<string, Record<string, number>> = {};
    for (const key of labelKeys) {
      labelCounts[key] = {};
      for (const r of searchMatched) {
        const v = r.labels[key];
        if (v) labelCounts[key][v] = (labelCounts[key][v] || 0) + 1;
      }
    }
    return { counts, labelCounts };
  }, [rules, searchQuery, labelKeys]);

  // Collapsible facet sections state (shared hook)
  const { toggleFacetCollapse, isCollapsed: isFacetCollapsed } = useFacetCollapse();

  return (
    <EuiResizableContainer className="altResizableContainer">
      {(EuiResizablePanel, EuiResizableButton, { togglePanel }) => {
        return (
          <>
            <EuiResizablePanel
              id="filters-panel"
              initialSize={15}
              minSize="10%"
              mode={['custom', { position: 'top' }]}
              paddingSize="none"
              scrollable={false}
              className="altFiltersPanel"
            >
              <MonitorsFiltersPanel
                rules={rules}
                datasources={datasources}
                selectedDsIds={selectedDsIds}
                onDatasourceChange={onDatasourceChange}
                maxDatasources={maxDatasources}
                onDatasourceCapReached={onDatasourceCapReached}
                filters={filters}
                activeFilterCount={activeFilterCount}
                clearAllFilters={clearAllFilters}
                updateFilter={updateFilter}
                updateLabelFilter={updateLabelFilter}
                labelKeys={labelKeys}
                datasourceEntries={datasourceEntries}
                uniqueStatuses={uniqueStatuses}
                uniqueSeverities={uniqueSeverities}
                uniqueTypes={uniqueTypes}
                uniqueHealth={uniqueHealth}
                uniqueCreators={uniqueCreators}
                facetCounts={facetCounts}
                isFacetCollapsed={isFacetCollapsed}
                toggleFacetCollapse={toggleFacetCollapse}
                onToggleOpen={() => togglePanel?.('filters-panel', { direction: 'left' })}
                savedSearches={savedSearches}
                setSavedSearches={setSavedSearches}
                loadSavedSearch={loadSavedSearch}
                deleteSavedSearch={deleteSavedSearch}
                showSaveSearchInput={showSaveSearchInput}
                setShowSaveSearchInput={setShowSaveSearchInput}
                saveSearchName={saveSearchName}
                setSaveSearchName={setSaveSearchName}
                saveCurrentSearch={saveCurrentSearch}
                searchQuery={searchQuery}
              />
            </EuiResizablePanel>

            <EuiResizableButton />

            <EuiResizablePanel
              initialSize={85}
              minSize="400px"
              paddingSize="none"
              scrollable={false}
              className="altContentPanel"
            >
              <MonitorsMainPanel
                rules={rules}
                filtered={filtered}
                loading={loading}
                tableColumns={tableColumns}
                rowProps={rowProps}
                tableWrapperRef={tableWrapperRef}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                showSuggestions={showSuggestions}
                setShowSuggestions={setShowSuggestions}
                suggestions={suggestions}
                activeSuggestion={activeSuggestion}
                setActiveSuggestion={setActiveSuggestion}
                handleSearchKeyDown={handleSearchKeyDown}
                searchRef={searchRef}
                activeFilterCount={activeFilterCount}
                clearAllFilters={clearAllFilters}
                selectedIds={selectedIds}
                setSelectedIds={setSelectedIds}
                onCreateMonitor={onCreateMonitor}
                logsCreateDisabled={logsCreateDisabled}
                metricsCreateDisabled={metricsCreateDisabled}
                detectorCreateDisabled={detectorCreateDisabled}
                forecasterCreateDisabled={forecasterCreateDisabled}
                noDatasourceSelected={selectedDsIds.length === 0}
                showCreatePopover={showCreatePopover}
                setShowCreatePopover={setShowCreatePopover}
                showDeleteConfirm={showDeleteConfirm}
                setShowDeleteConfirm={setShowDeleteConfirm}
                handleBulkDelete={handleBulkDelete}
                selectedMonitor={selectedMonitor}
                setSelectedMonitor={setSelectedMonitor}
                onDelete={onDelete}
                onClone={onClone}
                onEdit={onEdit}
                onEditDetectorSettings={onEditDetectorSettings}
                onEditDetectorFeatures={onEditDetectorFeatures}
                onEditForecaster={onEditForecaster}
                onStartResources={(resources) => handleLifecycleAction(resources, onStartResources)}
                onStopResources={(resources) => handleLifecycleAction(resources, onStopResources)}
                onToggleEnabled={onToggleEnabled}
              />
            </EuiResizablePanel>
          </>
        );
      }}
    </EuiResizableContainer>
  );
};

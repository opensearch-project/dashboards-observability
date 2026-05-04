/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Enhanced Monitors Table — search, filter, sort, column customization,
 * saved searches, bulk delete, and JSON export.
 *
 * This file is the top-level component and state owner. Sub-files in this
 * folder:
 *   - `monitors_table_columns.tsx`  — ColumnDef, BASE_COLUMNS, cell renderers
 *   - `monitors_table_filters.tsx`  — FilterState + search/filter/label helpers
 *   - `monitors_table_helpers.ts`   — constants + SavedSearch type
 *   - `resizable_columns.ts`        — DEFAULT_WIDTHS + `useResizableColumns`
 *   - `monitors_eui_table.tsx`      — memoized EuiInMemoryTable wrapper
 *   - `monitors_filters_panel.tsx`  — left-hand filters-panel render
 *   - `monitors_main_panel.tsx`     — right-hand table-panel render
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EuiResizableContainer } from '@elastic/eui';
import { Datasource, UnifiedRuleSummary } from '../../../../common/types/alerting';
import { serializeMonitors } from '../../../../common/services/alerting/serializer';
import { useFacetCollapse } from '../facet_filter_panel';
import {
  BASE_COLUMNS,
  buildTableColumns,
  ColumnId,
  DEFAULT_VISIBLE,
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

interface MonitorsTableProps {
  rules: UnifiedRuleSummary[];
  datasources: Datasource[];
  loading: boolean;
  onDelete: (ids: string[]) => void;
  onClone?: (monitor: UnifiedRuleSummary) => void;
  onImport?: (configs: Array<Record<string, unknown>>) => void;
  onCreateMonitor?: (type: 'logs' | 'prometheus' | 'metrics' | 'slo') => void;
  /** Currently selected datasource IDs */
  selectedDsIds: string[];
  /** Callback when datasource selection changes */
  onDatasourceChange: (ids: string[]) => void;
  /** Cap on concurrently selected datasources (from uiSettings). */
  maxDatasources: number;
  /** Callback fired when user tries to exceed `maxDatasources`. */
  onDatasourceCapReached: () => void;
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
  onImport,
  onCreateMonitor,
  selectedDsIds,
  onDatasourceChange,
  maxDatasources,
  onDatasourceCapReached,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<FilterState>(emptyFilters());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnId>>(new Set(DEFAULT_VISIBLE));
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({ ...DEFAULT_WIDTHS });
  const [selectedMonitor, setSelectedMonitor] = useState<UnifiedRuleSummary | null>(null);
  const [showCreatePopover, setShowCreatePopover] = useState(false);
  const [showSaveSearchInput, setShowSaveSearchInput] = useState(false);
  const [saveSearchName, setSaveSearchName] = useState('');
  const searchRef = useRef<HTMLDivElement>(null);
  const tableWrapperRef = useRef<HTMLDivElement>(null);

  const rowProps = useCallback(
    (item: UnifiedRuleSummary) => ({
      style: selectedIds.has(item.id) ? { backgroundColor: '#F0F5FF' } : undefined,
    }),
    [selectedIds]
  );

  const dsNameMap = useMemo(() => new Map(datasources.map((d) => [d.id, d.name])), [datasources]);

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

  // Build available columns including dynamic label columns
  const allColumns = useMemo(() => {
    const cols = [...BASE_COLUMNS];
    for (const key of labelKeys) {
      cols.push({ id: `label:${key}`, label: `Label: ${key}`, isLabelColumn: true });
    }
    return cols;
  }, [labelKeys]);

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

  const activeFilterCount = useMemo(() => {
    let count = 0;
    count += filters.status.length;
    count += filters.severity.length;
    count += filters.monitorType.length;
    count += filters.healthStatus.length;
    count += filters.createdBy.length;
    count += filters.destinations.length;
    count += filters.backend.length;
    for (const vals of Object.values(filters.labels)) count += vals.length;
    return count;
  }, [filters]);

  // Selection
  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };
  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map((r) => r.id)));
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

  // Export
  const exportJson = () => {
    const configs = serializeMonitors(filtered);
    const blob = new Blob([JSON.stringify(configs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'monitors-export.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Import
  const handleImportFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e: Event) => {
      const file = (e.target as HTMLInputElement)?.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target?.result as string);
          const configs = Array.isArray(data) ? data : data.monitors;
          if (onImport && Array.isArray(configs))
            onImport(configs as Array<Record<string, unknown>>);
        } catch (_err) {
          alert('Invalid JSON file');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  // Bulk delete
  const handleBulkDelete = () => {
    onDelete(Array.from(selectedIds));
    setSelectedIds(new Set());
    setShowDeleteConfirm(false);
  };

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
  const uniqueBackends = useMemo(() => collectUniqueValues(rules, (r) => r.datasourceType), [
    rules,
  ]);

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
      backend: {},
      createdBy: {},
    };
    for (const r of searchMatched) {
      counts.status[r.status] = (counts.status[r.status] || 0) + 1;
      counts.severity[r.severity] = (counts.severity[r.severity] || 0) + 1;
      counts.monitorType[r.monitorType] = (counts.monitorType[r.monitorType] || 0) + 1;
      counts.healthStatus[r.healthStatus] = (counts.healthStatus[r.healthStatus] || 0) + 1;
      counts.backend[r.datasourceType] = (counts.backend[r.datasourceType] || 0) + 1;
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
    <EuiResizableContainer style={{ flex: 1, minHeight: 0 }}>
      {(EuiResizablePanel, EuiResizableButton) => {
        return (
          <>
            <EuiResizablePanel
              id="filters-panel"
              initialSize={20}
              minSize="200px"
              mode={['collapsible', { position: 'top' }]}
              onToggleCollapsed={() => {}}
              paddingSize="none"
              style={{ overflow: 'auto', paddingRight: '4px' }}
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
                uniqueBackends={uniqueBackends}
                uniqueCreators={uniqueCreators}
                facetCounts={facetCounts}
                isFacetCollapsed={isFacetCollapsed}
                toggleFacetCollapse={toggleFacetCollapse}
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
              initialSize={80}
              minSize="400px"
              mode="main"
              paddingSize="none"
              style={{ paddingLeft: '4px', overflow: 'auto' }}
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
                allColumns={allColumns}
                visibleColumns={visibleColumns}
                setVisibleColumns={setVisibleColumns}
                showColumnPicker={showColumnPicker}
                setShowColumnPicker={setShowColumnPicker}
                onCreateMonitor={onCreateMonitor}
                showCreatePopover={showCreatePopover}
                setShowCreatePopover={setShowCreatePopover}
                exportJson={exportJson}
                onImport={onImport}
                handleImportFile={handleImportFile}
                showDeleteConfirm={showDeleteConfirm}
                setShowDeleteConfirm={setShowDeleteConfirm}
                handleBulkDelete={handleBulkDelete}
                selectedMonitor={selectedMonitor}
                setSelectedMonitor={setSelectedMonitor}
                onDelete={onDelete}
                onClone={onClone}
              />
            </EuiResizablePanel>
          </>
        );
      }}
    </EuiResizableContainer>
  );
};

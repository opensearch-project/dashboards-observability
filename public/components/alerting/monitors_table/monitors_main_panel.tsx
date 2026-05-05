/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Main table panel — the right side of `MonitorsTable`'s resizable layout.
 * Owns "Create Monitor / Search bar / Action bar / Table / Delete modal /
 * Detail flyout". Rendered inside the parent `<EuiResizablePanel>` so it
 * stays sibling to the filters panel on the left.
 *
 * Like `MonitorsFiltersPanel`, this is a pure render of state + callbacks.
 * All state lives in the `MonitorsTable` parent (index.tsx).
 */
import React from 'react';
import {
  EuiButton,
  EuiCheckboxGroup,
  EuiEmptyPrompt,
  EuiFieldSearch,
  EuiFlexGroup,
  EuiFlexItem,
  EuiListGroup,
  EuiListGroupItem,
  EuiPanel,
  EuiPopover,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import { UnifiedRuleSummary } from '../../../../common/types/alerting';
import { DeleteModal } from '../../common/helpers/delete_modal';
import { MonitorDetailFlyout } from '../monitor_detail_flyout';
import { ColumnDef, ColumnId } from './monitors_table_columns';
import { MonitorsEuiTable } from './monitors_eui_table';

export interface MonitorsMainPanelProps {
  // Data
  rules: UnifiedRuleSummary[];
  filtered: UnifiedRuleSummary[];
  loading: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- EuiInMemoryTable column type is complex
  tableColumns: any[];
  rowProps: (item: UnifiedRuleSummary) => React.HTMLAttributes<HTMLTableRowElement>;
  tableWrapperRef: React.RefObject<HTMLDivElement | null>;

  // Search
  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  showSuggestions: boolean;
  setShowSuggestions: React.Dispatch<React.SetStateAction<boolean>>;
  suggestions: string[];
  activeSuggestion: number;
  setActiveSuggestion: React.Dispatch<React.SetStateAction<number>>;
  handleSearchKeyDown: (e: React.KeyboardEvent) => void;
  searchRef: React.RefObject<HTMLDivElement | null>;

  // Filters / selection bookkeeping
  activeFilterCount: number;
  clearAllFilters: () => void;
  selectedIds: Set<string>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;

  // Columns
  allColumns: ColumnDef[];
  visibleColumns: Set<ColumnId>;
  setVisibleColumns: React.Dispatch<React.SetStateAction<Set<ColumnId>>>;
  showColumnPicker: boolean;
  setShowColumnPicker: React.Dispatch<React.SetStateAction<boolean>>;

  // Create / import / export
  onCreateMonitor?: (type: 'logs' | 'prometheus' | 'metrics' | 'slo') => void;
  showCreatePopover: boolean;
  setShowCreatePopover: React.Dispatch<React.SetStateAction<boolean>>;
  exportJson: () => void;
  onImport?: (configs: Array<Record<string, unknown>>) => void;
  handleImportFile: () => void;

  // Delete
  showDeleteConfirm: boolean;
  setShowDeleteConfirm: React.Dispatch<React.SetStateAction<boolean>>;
  handleBulkDelete: () => void;

  // Flyout + child callbacks
  selectedMonitor: UnifiedRuleSummary | null;
  setSelectedMonitor: React.Dispatch<React.SetStateAction<UnifiedRuleSummary | null>>;
  onDelete: (ids: string[]) => void;
  onClone?: (monitor: UnifiedRuleSummary) => void;
}

export const MonitorsMainPanel: React.FC<MonitorsMainPanelProps> = ({
  rules,
  filtered,
  loading,
  tableColumns,
  rowProps,
  tableWrapperRef,
  searchQuery,
  setSearchQuery,
  showSuggestions,
  setShowSuggestions,
  suggestions,
  activeSuggestion,
  setActiveSuggestion,
  handleSearchKeyDown,
  searchRef,
  activeFilterCount,
  clearAllFilters,
  selectedIds,
  allColumns,
  visibleColumns,
  setVisibleColumns,
  showColumnPicker,
  setShowColumnPicker,
  onCreateMonitor,
  showCreatePopover,
  setShowCreatePopover,
  exportJson,
  onImport,
  handleImportFile,
  showDeleteConfirm,
  setShowDeleteConfirm,
  handleBulkDelete,
  selectedMonitor,
  setSelectedMonitor,
  onDelete,
  onClone,
}) => {
  return (
    <>
      <EuiPanel
        paddingSize="s"
        hasBorder
        style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
      >
        {/* Create Monitor Button + Search bar */}
        <div style={{ flexShrink: 0 }}>
          {onCreateMonitor && (
            <EuiFlexGroup
              justifyContent="flexEnd"
              responsive={false}
              gutterSize="s"
              style={{ marginBottom: 8 }}
            >
              <EuiFlexItem grow={false}>
                <EuiPopover
                  button={
                    <EuiButton
                      fill
                      iconType="plusInCircle"
                      size="s"
                      onClick={() => setShowCreatePopover((prev) => !prev)}
                    >
                      Create Monitor
                    </EuiButton>
                  }
                  isOpen={showCreatePopover}
                  closePopover={() => setShowCreatePopover(false)}
                  panelPaddingSize="none"
                  anchorPosition="downRight"
                >
                  <EuiListGroup flush style={{ width: 200 }}>
                    <EuiListGroupItem
                      label="Logs"
                      onClick={() => {
                        setShowCreatePopover(false);
                        onCreateMonitor('logs');
                      }}
                      aria-label="Create Logs monitor"
                    />
                    <EuiListGroupItem
                      label="Metrics"
                      onClick={() => {
                        setShowCreatePopover(false);
                        onCreateMonitor('metrics');
                      }}
                      aria-label="Create Metrics monitor"
                    />
                  </EuiListGroup>
                </EuiPopover>
              </EuiFlexItem>
            </EuiFlexGroup>
          )}

          {/* Search bar with suggestions */}
          <div ref={searchRef} style={{ position: 'relative' }}>
            <EuiFieldSearch
              placeholder="Search monitors by name, labels (team:infra), annotations..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowSuggestions(true);
                setActiveSuggestion(-1);
              }}
              onFocus={() => searchQuery && setShowSuggestions(true)}
              onKeyDown={handleSearchKeyDown}
              isClearable
              fullWidth
              aria-label="Search monitors"
            />
            {showSuggestions && suggestions.length > 0 && (
              <EuiPanel
                paddingSize="none"
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  zIndex: 1000,
                  maxHeight: 250,
                  overflow: 'auto',
                  border: '1px solid #D3DAE6',
                  borderTop: 'none',
                }}
              >
                {suggestions.map((s, i) => (
                  <div
                    key={s}
                    style={{
                      padding: '6px 12px',
                      cursor: 'pointer',
                      background: i === activeSuggestion ? '#E6F0FF' : 'white',
                    }}
                    onMouseDown={() => {
                      setSearchQuery(s);
                      setShowSuggestions(false);
                    }}
                    onMouseEnter={() => setActiveSuggestion(i)}
                  >
                    <EuiText size="s">{s}</EuiText>
                  </div>
                ))}
              </EuiPanel>
            )}
          </div>
        </div>

        <EuiSpacer size="s" />

        {/* Action bar */}
        <div style={{ flexShrink: 0 }}>
          <EuiFlexGroup gutterSize="s" alignItems="center" justifyContent="spaceBetween">
            <EuiFlexItem grow={false}>
              <EuiFlexGroup gutterSize="s" alignItems="center">
                <EuiFlexItem grow={false}>
                  <EuiText size="s">
                    <strong>{filtered.length}</strong> monitors
                    {selectedIds.size > 0 && (
                      <span>
                        {' '}
                        · <strong>{selectedIds.size}</strong> selected
                      </span>
                    )}
                    {activeFilterCount > 0 && (
                      <span>
                        {' '}
                        · {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}
                      </span>
                    )}
                  </EuiText>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiFlexGroup gutterSize="s">
                {selectedIds.size > 0 && (
                  <EuiFlexItem grow={false}>
                    <EuiButton
                      color="danger"
                      size="s"
                      iconType="trash"
                      onClick={() => setShowDeleteConfirm(true)}
                    >
                      Delete ({selectedIds.size})
                    </EuiButton>
                  </EuiFlexItem>
                )}
                <EuiFlexItem grow={false}>
                  <EuiButton
                    size="s"
                    iconType="exportAction"
                    onClick={exportJson}
                    isDisabled={filtered.length === 0}
                  >
                    Export
                  </EuiButton>
                </EuiFlexItem>
                {onImport && (
                  <EuiFlexItem grow={false}>
                    <EuiButton size="s" iconType="importAction" onClick={handleImportFile}>
                      Import
                    </EuiButton>
                  </EuiFlexItem>
                )}
                <EuiFlexItem grow={false}>
                  <EuiPopover
                    button={
                      <EuiButton
                        size="s"
                        iconType="listAdd"
                        onClick={() => setShowColumnPicker(!showColumnPicker)}
                      >
                        Columns
                      </EuiButton>
                    }
                    isOpen={showColumnPicker}
                    closePopover={() => setShowColumnPicker(false)}
                    panelPaddingSize="s"
                  >
                    <div style={{ width: 250, maxHeight: 400, overflow: 'auto' }}>
                      <EuiText size="xs">
                        <strong>Toggle columns</strong>
                      </EuiText>
                      <EuiSpacer size="xs" />
                      <EuiCheckboxGroup
                        options={allColumns.map((c) => ({ id: c.id, label: c.label }))}
                        idToSelectedMap={Object.fromEntries(
                          allColumns.map((c) => [c.id, visibleColumns.has(c.id)])
                        )}
                        onChange={(id) => {
                          const next = new Set(visibleColumns);
                          if (next.has(id)) next.delete(id);
                          else next.add(id);
                          setVisibleColumns(next);
                        }}
                      />
                    </div>
                  </EuiPopover>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFlexItem>
          </EuiFlexGroup>
        </div>

        <EuiSpacer size="s" />

        {/* Table */}
        <div
          style={{ flex: 1, overflowX: 'auto', overflowY: 'auto' }}
          className="monitors-table-wrapper"
          ref={tableWrapperRef}
        >
          <style>{`
              .monitors-table-wrapper .euiTable { table-layout: auto; min-width: 100%; }
              .monitors-table-wrapper .euiTableHeaderCell { position: relative; }
              .monitors-table-wrapper .euiTableHeaderCell:last-child { border-right: none; }
            `}</style>
          {!loading && filtered.length === 0 ? (
            <EuiEmptyPrompt
              title={<h2>No Monitors Found</h2>}
              body={
                <p>
                  {rules.length === 0
                    ? 'No monitors configured yet.'
                    : 'No monitors match your current search and filters.'}
                </p>
              }
              actions={
                activeFilterCount > 0 || searchQuery ? (
                  <EuiButton onClick={clearAllFilters}>Clear filters</EuiButton>
                ) : undefined
              }
            />
          ) : (
            <MonitorsEuiTable
              items={filtered}
              columns={tableColumns}
              loading={loading}
              rowProps={rowProps}
            />
          )}
        </div>
      </EuiPanel>

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <DeleteModal
          title={`Delete ${selectedIds.size} monitor${selectedIds.size > 1 ? 's' : ''}?`}
          message={`This will remove the selected monitor${
            selectedIds.size > 1 ? 's' : ''
          } from the current view.`}
          onCancel={() => setShowDeleteConfirm(false)}
          onConfirm={handleBulkDelete}
        />
      )}

      {/* Monitor detail flyout */}
      {selectedMonitor && (
        <MonitorDetailFlyout
          monitor={selectedMonitor}
          onClose={() => setSelectedMonitor(null)}
          onDelete={(id) => {
            onDelete([id]);
            setSelectedMonitor(null);
          }}
          onClone={(monitor) => {
            if (onClone) onClone(monitor);
            setSelectedMonitor(null);
          }}
        />
      )}
    </>
  );
};

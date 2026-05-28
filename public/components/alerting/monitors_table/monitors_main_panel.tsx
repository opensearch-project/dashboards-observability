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
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { FormattedMessage } from '@osd/i18n/react';
import { UnifiedRuleSummary } from '../../../../common/types/alerting';
import { DeleteModal } from '../../common/helpers/delete_modal';
import { MonitorDetailFlyout } from '../monitor_detail_flyout';
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

  // Create
  onCreateMonitor?: (type: 'logs' | 'prometheus' | 'metrics') => void;
  /**
   * When true, the "Logs" popover entry is disabled with a hint that an
   * OpenSearch datasource is needed. Triggered when the parent's selection
   * is non-empty and contains only Prometheus datasources.
   */
  logsCreateDisabled?: boolean;
  /**
   * Symmetric counterpart of `logsCreateDisabled`: true when the parent's
   * selection is non-empty and contains only OpenSearch datasources, so a
   * Metrics monitor can't be created without changing the selection.
   */
  metricsCreateDisabled?: boolean;
  showCreatePopover: boolean;
  setShowCreatePopover: React.Dispatch<React.SetStateAction<boolean>>;

  // Delete
  showDeleteConfirm: boolean;
  setShowDeleteConfirm: React.Dispatch<React.SetStateAction<boolean>>;
  handleBulkDelete: () => void;

  // Flyout + child callbacks
  selectedMonitor: UnifiedRuleSummary | null;
  setSelectedMonitor: React.Dispatch<React.SetStateAction<UnifiedRuleSummary | null>>;
  onDelete: (ids: string[]) => void;
  onClone?: (monitor: UnifiedRuleSummary) => void;
  onEdit?: (monitor: UnifiedRuleSummary) => void;
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
  onCreateMonitor,
  logsCreateDisabled = false,
  metricsCreateDisabled = false,
  showCreatePopover,
  setShowCreatePopover,
  showDeleteConfirm,
  setShowDeleteConfirm,
  handleBulkDelete,
  selectedMonitor,
  setSelectedMonitor,
  onDelete,
  onClone,
  onEdit,
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
                      <FormattedMessage
                        id="observability.alerting.monitorsTable.mainPanel.createMonitor"
                        defaultMessage="Create Monitor"
                      />
                    </EuiButton>
                  }
                  isOpen={showCreatePopover}
                  closePopover={() => setShowCreatePopover(false)}
                  panelPaddingSize="none"
                  anchorPosition="downRight"
                >
                  <EuiListGroup flush style={{ width: 200 }}>
                    {logsCreateDisabled ? (
                      <EuiToolTip
                        position="left"
                        content={i18n.translate(
                          'observability.alerting.monitorsTable.mainPanel.logsDisabledTooltip',
                          {
                            defaultMessage:
                              'Logs monitors require an OpenSearch datasource. Select one to enable.',
                          }
                        )}
                      >
                        <EuiListGroupItem
                          label={i18n.translate(
                            'observability.alerting.monitorsTable.mainPanel.logsOption',
                            {
                              defaultMessage: 'Logs',
                            }
                          )}
                          isDisabled
                          aria-label={i18n.translate(
                            'observability.alerting.monitorsTable.mainPanel.createLogsAriaLabel',
                            {
                              defaultMessage: 'Create Logs monitor',
                            }
                          )}
                        />
                      </EuiToolTip>
                    ) : (
                      <EuiListGroupItem
                        label={i18n.translate(
                          'observability.alerting.monitorsTable.mainPanel.logsOption',
                          {
                            defaultMessage: 'Logs',
                          }
                        )}
                        onClick={() => {
                          setShowCreatePopover(false);
                          onCreateMonitor('logs');
                        }}
                        aria-label={i18n.translate(
                          'observability.alerting.monitorsTable.mainPanel.createLogsAriaLabel',
                          {
                            defaultMessage: 'Create Logs monitor',
                          }
                        )}
                      />
                    )}
                    {metricsCreateDisabled ? (
                      <EuiToolTip
                        position="left"
                        content={i18n.translate(
                          'observability.alerting.monitorsTable.mainPanel.metricsDisabledTooltip',
                          {
                            defaultMessage:
                              'Metrics monitors require a Prometheus datasource. Select one to enable.',
                          }
                        )}
                      >
                        <EuiListGroupItem
                          label={i18n.translate(
                            'observability.alerting.monitorsTable.mainPanel.metricsOption',
                            {
                              defaultMessage: 'Metrics',
                            }
                          )}
                          isDisabled
                          aria-label={i18n.translate(
                            'observability.alerting.monitorsTable.mainPanel.createMetricsAriaLabel',
                            {
                              defaultMessage: 'Create Metrics monitor',
                            }
                          )}
                        />
                      </EuiToolTip>
                    ) : (
                      <EuiListGroupItem
                        label={i18n.translate(
                          'observability.alerting.monitorsTable.mainPanel.metricsOption',
                          {
                            defaultMessage: 'Metrics',
                          }
                        )}
                        onClick={() => {
                          setShowCreatePopover(false);
                          onCreateMonitor('metrics');
                        }}
                        aria-label={i18n.translate(
                          'observability.alerting.monitorsTable.mainPanel.createMetricsAriaLabel',
                          {
                            defaultMessage: 'Create Metrics monitor',
                          }
                        )}
                      />
                    )}
                  </EuiListGroup>
                </EuiPopover>
              </EuiFlexItem>
            </EuiFlexGroup>
          )}

          {/* Search bar with suggestions */}
          <div ref={searchRef} style={{ position: 'relative' }}>
            <EuiFieldSearch
              placeholder={i18n.translate(
                'observability.alerting.monitorsTable.mainPanel.searchPlaceholder',
                {
                  defaultMessage: 'Search monitors by name, labels (team:infra), annotations...',
                }
              )}
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
              aria-label={i18n.translate(
                'observability.alerting.monitorsTable.mainPanel.searchAriaLabel',
                {
                  defaultMessage: 'Search monitors',
                }
              )}
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
                    <FormattedMessage
                      id="observability.alerting.monitorsTable.mainPanel.monitorsCount"
                      defaultMessage="{count} monitors"
                      values={{ count: <strong>{filtered.length}</strong> }}
                    />
                    {selectedIds.size > 0 && (
                      <span>
                        {' '}
                        ·{' '}
                        <FormattedMessage
                          id="observability.alerting.monitorsTable.mainPanel.selectedCount"
                          defaultMessage="{count} selected"
                          values={{ count: <strong>{selectedIds.size}</strong> }}
                        />
                      </span>
                    )}
                    {activeFilterCount > 0 && (
                      <span>
                        {' '}
                        ·{' '}
                        <FormattedMessage
                          id="observability.alerting.monitorsTable.mainPanel.filtersCount"
                          defaultMessage="{count} {count, plural, one {filter} other {filters}}"
                          values={{ count: activeFilterCount }}
                        />
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
                      <FormattedMessage
                        id="observability.alerting.monitorsTable.mainPanel.deleteSelectedButton"
                        defaultMessage="Delete ({count})"
                        values={{ count: selectedIds.size }}
                      />
                    </EuiButton>
                  </EuiFlexItem>
                )}
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
          {!loading && filtered.length === 0 ? (
            <EuiEmptyPrompt
              title={
                <h2>
                  <FormattedMessage
                    id="observability.alerting.monitorsTable.mainPanel.noMonitorsFoundTitle"
                    defaultMessage="No Monitors Found"
                  />
                </h2>
              }
              body={
                <p>
                  {rules.length === 0 ? (
                    <FormattedMessage
                      id="observability.alerting.monitorsTable.mainPanel.noMonitorsConfigured"
                      defaultMessage="No monitors configured yet."
                    />
                  ) : (
                    <FormattedMessage
                      id="observability.alerting.monitorsTable.mainPanel.noMonitorsMatch"
                      defaultMessage="No monitors match your current search and filters."
                    />
                  )}
                </p>
              }
              actions={
                activeFilterCount > 0 || searchQuery ? (
                  <EuiButton onClick={clearAllFilters}>
                    <FormattedMessage
                      id="observability.alerting.monitorsTable.mainPanel.clearFiltersButton"
                      defaultMessage="Clear filters"
                    />
                  </EuiButton>
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
          title={i18n.translate('observability.alerting.monitorsTable.mainPanel.deleteModalTitle', {
            defaultMessage: 'Delete {count} {count, plural, one {monitor} other {monitors}}?',
            values: { count: selectedIds.size },
          })}
          message={i18n.translate(
            'observability.alerting.monitorsTable.mainPanel.deleteModalMessage',
            {
              defaultMessage:
                'This will remove the selected {count, plural, one {monitor} other {monitors}} from the current view.',
              values: { count: selectedIds.size },
            }
          )}
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
          onEdit={
            onEdit
              ? (monitor) => {
                  onEdit(monitor);
                  setSelectedMonitor(null);
                }
              : undefined
          }
        />
      )}
    </>
  );
};

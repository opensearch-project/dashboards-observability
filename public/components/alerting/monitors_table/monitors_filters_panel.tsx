/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Filters panel content — the left side of `MonitorsTable`'s resizable layout.
 * Owns the "Filters / Clear / Datasource / facet groups / Label facets /
 * Saved Searches" UI. Rendered inside the parent `<EuiResizablePanel>` so it
 * stays sibling to the table on the right.
 *
 * This component is a pure render of state + callbacks passed in. All of the
 * actual state lives in the `MonitorsTable` parent (index.tsx).
 */
import React from 'react';
import {
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { FormattedMessage } from '@osd/i18n/react';
import {
  Datasource,
  MonitorHealthStatus,
  MonitorStatus,
  MonitorType,
  UnifiedAlertSeverity,
  UnifiedRuleSummary,
} from '../../../../common/types/alerting';
import { FacetFilterGroup } from '../facet_filter_panel';
import { HEALTH_COLORS, SEVERITY_COLORS, STATUS_COLORS, TYPE_LABELS } from '../shared_constants';
import { collectLabelValues, FilterState } from './monitors_table_filters';
import { BACKEND_DISPLAY, INTERNAL_LABEL_KEYS, SavedSearch } from './monitors_table_helpers';

export interface MonitorsFiltersPanelProps {
  rules: UnifiedRuleSummary[];
  datasources: Datasource[];
  selectedDsIds: string[];
  onDatasourceChange: (ids: string[]) => void;
  maxDatasources: number;
  onDatasourceCapReached: () => void;

  filters: FilterState;
  activeFilterCount: number;
  clearAllFilters: () => void;
  updateFilter: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void;
  updateLabelFilter: (key: string, values: string[]) => void;

  labelKeys: string[];
  datasourceEntries: Array<{ id: string; label: string }>;
  uniqueStatuses: string[];
  uniqueSeverities: string[];
  uniqueTypes: string[];
  uniqueHealth: string[];
  uniqueBackends: string[];
  uniqueCreators: string[];
  facetCounts: {
    counts: Record<string, Record<string, number>>;
    labelCounts: Record<string, Record<string, number>>;
  };

  isFacetCollapsed: (id: string) => boolean;
  toggleFacetCollapse: (id: string) => void;

  onToggleOpen: () => void;

  savedSearches: SavedSearch[];
  setSavedSearches: React.Dispatch<React.SetStateAction<SavedSearch[]>>;
  loadSavedSearch: (ss: SavedSearch) => void;
  deleteSavedSearch: (id: string) => void;
  showSaveSearchInput: boolean;
  setShowSaveSearchInput: React.Dispatch<React.SetStateAction<boolean>>;
  saveSearchName: string;
  setSaveSearchName: React.Dispatch<React.SetStateAction<string>>;
  saveCurrentSearch: () => void;
  searchQuery: string;
}

export const MonitorsFiltersPanel: React.FC<MonitorsFiltersPanelProps> = ({
  rules,
  selectedDsIds,
  onDatasourceChange,
  maxDatasources,
  onDatasourceCapReached,
  filters,
  activeFilterCount,
  clearAllFilters,
  updateFilter,
  updateLabelFilter,
  labelKeys,
  datasourceEntries,
  uniqueStatuses,
  uniqueSeverities,
  uniqueTypes,
  uniqueHealth,
  uniqueBackends,
  uniqueCreators,
  facetCounts,
  isFacetCollapsed,
  toggleFacetCollapse,
  onToggleOpen,
  savedSearches,
  setSavedSearches,
  loadSavedSearch,
  deleteSavedSearch,
  showSaveSearchInput,
  setShowSaveSearchInput,
  saveSearchName,
  setSaveSearchName,
  saveCurrentSearch,
  searchQuery,
}) => {
  // Render a single facet group (delegates to shared component)
  const renderFacetGroup = (
    id: string,
    label: string,
    options: string[],
    selected: string[],
    onChange: (v: string[]) => void,
    counts: Record<string, number>,
    displayMap?: Record<string, string>,
    colorMap?: Record<string, string>
  ) => (
    <FacetFilterGroup
      key={id}
      id={id}
      label={label}
      options={options}
      selected={selected}
      onChange={onChange}
      counts={counts}
      displayMap={displayMap}
      colorMap={colorMap}
      isCollapsed={isFacetCollapsed(id)}
      onToggleCollapse={toggleFacetCollapse}
    />
  );

  return (
    <EuiPanel className="altFiltersInner" data-test-subj="monitorsFiltersPanel">
      <EuiFlexGroup
        gutterSize="xs"
        alignItems="center"
        responsive={false}
        justifyContent="spaceBetween"
      >
        <EuiFlexItem>
          <EuiText size="xs">
            <strong>
              <FormattedMessage
                id="observability.alerting.monitorsTable.filtersPanel.filtersHeader"
                defaultMessage="Filters"
              />
            </strong>
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButtonIcon
            iconType="menuLeft"
            onClick={onToggleOpen}
            aria-label={i18n.translate(
              'observability.alerting.monitorsTable.filtersPanel.collapseAriaLabel',
              {
                defaultMessage: 'Collapse filters',
              }
            )}
            data-test-subj="monitorsFiltersPanelToggle"
          />
        </EuiFlexItem>
      </EuiFlexGroup>
      <div className="altFiltersBody">
        <FacetFilterGroup
          id="datasource"
          label={i18n.translate('observability.alerting.monitorsTable.filtersPanel.datasource', {
            defaultMessage: 'Datasource',
          })}
          options={datasourceEntries.map((e) => e.label)}
          selected={selectedDsIds
            .map((id) => datasourceEntries.find((e) => e.id === id)?.label || '')
            .filter(Boolean)}
          onChange={(labels) => {
            const ids = labels
              .map((l) => datasourceEntries.find((e) => e.label === l)?.id)
              .filter(Boolean) as string[];
            onDatasourceChange(ids);
            if (ids.length === 0) clearAllFilters();
          }}
          counts={Object.fromEntries(
            datasourceEntries.map((e) => [
              e.label,
              selectedDsIds.includes(e.id) || selectedDsIds.length === 0 ? 1 : 0,
            ])
          )}
          searchable
          showCounts={false}
          initialVisible={5}
          maxSelected={maxDatasources}
          onCapReached={onDatasourceCapReached}
          searchAriaLabel={i18n.translate(
            'observability.alerting.monitorsTable.filtersPanel.searchDatasourcesAriaLabel',
            {
              defaultMessage: 'Search datasources',
            }
          )}
          checkedFirst
          isCollapsed={isFacetCollapsed('datasource')}
          onToggleCollapse={toggleFacetCollapse}
        />

        {renderFacetGroup(
          'status',
          i18n.translate('observability.alerting.monitorsTable.filtersPanel.status', {
            defaultMessage: 'Status',
          }),
          uniqueStatuses,
          filters.status,
          (v) => updateFilter('status', v as MonitorStatus[]),
          facetCounts.counts.status,
          undefined,
          STATUS_COLORS
        )}
        {renderFacetGroup(
          'severity',
          i18n.translate('observability.alerting.monitorsTable.filtersPanel.severity', {
            defaultMessage: 'Severity',
          }),
          uniqueSeverities,
          filters.severity,
          (v) => updateFilter('severity', v as UnifiedAlertSeverity[]),
          facetCounts.counts.severity,
          undefined,
          SEVERITY_COLORS
        )}
        {renderFacetGroup(
          'monitorType',
          i18n.translate('observability.alerting.monitorsTable.filtersPanel.type', {
            defaultMessage: 'Type',
          }),
          uniqueTypes,
          filters.monitorType,
          (v) => updateFilter('monitorType', v as MonitorType[]),
          facetCounts.counts.monitorType,
          TYPE_LABELS
        )}
        {renderFacetGroup(
          'healthStatus',
          i18n.translate('observability.alerting.monitorsTable.filtersPanel.health', {
            defaultMessage: 'Health',
          }),
          uniqueHealth,
          filters.healthStatus,
          (v) => updateFilter('healthStatus', v as MonitorHealthStatus[]),
          facetCounts.counts.healthStatus,
          undefined,
          HEALTH_COLORS
        )}
        {renderFacetGroup(
          'backend',
          i18n.translate('observability.alerting.monitorsTable.filtersPanel.backend', {
            defaultMessage: 'Backend',
          }),
          uniqueBackends,
          filters.backend,
          (v) => updateFilter('backend', v),
          facetCounts.counts.backend,
          BACKEND_DISPLAY
        )}
        {renderFacetGroup(
          'createdBy',
          i18n.translate('observability.alerting.monitorsTable.filtersPanel.createdBy', {
            defaultMessage: 'Created By',
          }),
          uniqueCreators,
          filters.createdBy,
          (v) => updateFilter('createdBy', v),
          facetCounts.counts.createdBy
        )}

        {/* Label facets */}
        {labelKeys.length > 0 && (
          <>
            <EuiSpacer size="xs" />
            <EuiText size="xs" color="subdued" style={{ marginBottom: 6 }}>
              <strong>
                <FormattedMessage
                  id="observability.alerting.monitorsTable.filtersPanel.labelsHeader"
                  defaultMessage="Labels"
                />
              </strong>
            </EuiText>
            {labelKeys
              .filter((k) => !INTERNAL_LABEL_KEYS.has(k))
              .map((key) =>
                renderFacetGroup(
                  `label:${key}`,
                  key,
                  collectLabelValues(rules, key),
                  filters.labels[key] || [],
                  (v) => updateLabelFilter(key, v),
                  facetCounts.labelCounts[key] || {}
                )
              )}
          </>
        )}

        {/* Saved searches */}
        <EuiSpacer size="s" />
        <EuiText size="xs">
          <strong>
            <FormattedMessage
              id="observability.alerting.monitorsTable.filtersPanel.savedSearches"
              defaultMessage="Saved Searches"
            />
          </strong>
        </EuiText>
        <EuiSpacer size="xs" />
        {savedSearches.length === 0 ? (
          <EuiText size="xs" color="subdued">
            <FormattedMessage
              id="observability.alerting.monitorsTable.filtersPanel.noneYet"
              defaultMessage="None yet"
            />
          </EuiText>
        ) : (
          savedSearches.map((ss) => (
            <EuiFlexGroup
              key={ss.id}
              gutterSize="xs"
              alignItems="center"
              responsive={false}
              style={{ marginBottom: 2 }}
            >
              <EuiFlexItem>
                <EuiText size="xs">
                  <span
                    role="button"
                    tabIndex={0}
                    style={{ cursor: 'pointer', color: '#006BB4' }}
                    onClick={() => loadSavedSearch(ss)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') loadSavedSearch(ss);
                    }}
                  >
                    {ss.name}
                  </span>
                </EuiText>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButtonIcon
                  iconType="cross"
                  size="s"
                  aria-label={i18n.translate(
                    'observability.alerting.monitorsTable.filtersPanel.deleteSavedSearchAriaLabel',
                    {
                      defaultMessage: 'Delete {name}',
                      values: { name: ss.name },
                    }
                  )}
                  onClick={() => deleteSavedSearch(ss.id)}
                  color="text"
                />
              </EuiFlexItem>
            </EuiFlexGroup>
          ))
        )}
        {showSaveSearchInput ? (
          <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
            <EuiFlexItem>
              <EuiFieldText
                placeholder={i18n.translate(
                  'observability.alerting.monitorsTable.filtersPanel.searchNamePlaceholder',
                  {
                    defaultMessage: 'Search name',
                  }
                )}
                value={saveSearchName}
                onChange={(e) => setSaveSearchName(e.target.value)}
                compressed
                aria-label={i18n.translate(
                  'observability.alerting.monitorsTable.filtersPanel.searchNameAriaLabel',
                  {
                    defaultMessage: 'Saved search name',
                  }
                )}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && saveSearchName.trim()) {
                    setSavedSearches((prev) => [
                      ...prev,
                      {
                        id: `ss-${Date.now()}`,
                        name: saveSearchName.trim(),
                        query: searchQuery,
                        filters: { ...filters },
                      },
                    ]);
                    setSaveSearchName('');
                    setShowSaveSearchInput(false);
                  }
                  if (e.key === 'Escape') {
                    setShowSaveSearchInput(false);
                    setSaveSearchName('');
                  }
                }}
                autoFocus
              />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty
                size="xs"
                onClick={() => {
                  if (saveSearchName.trim()) {
                    setSavedSearches((prev) => [
                      ...prev,
                      {
                        id: `ss-${Date.now()}`,
                        name: saveSearchName.trim(),
                        query: searchQuery,
                        filters: { ...filters },
                      },
                    ]);
                    setSaveSearchName('');
                    setShowSaveSearchInput(false);
                  }
                }}
              >
                <FormattedMessage
                  id="observability.alerting.monitorsTable.filtersPanel.saveButton"
                  defaultMessage="Save"
                />
              </EuiButtonEmpty>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButtonIcon
                iconType="cross"
                size="s"
                aria-label={i18n.translate(
                  'observability.alerting.monitorsTable.filtersPanel.cancelAriaLabel',
                  {
                    defaultMessage: 'Cancel',
                  }
                )}
                onClick={() => {
                  setShowSaveSearchInput(false);
                  setSaveSearchName('');
                }}
                color="text"
              />
            </EuiFlexItem>
          </EuiFlexGroup>
        ) : (
          <EuiButtonEmpty
            size="xs"
            iconType="plusInCircle"
            onClick={saveCurrentSearch}
            disabled={!searchQuery && activeFilterCount === 0}
            flush="left"
          >
            <FormattedMessage
              id="observability.alerting.monitorsTable.filtersPanel.saveCurrentButton"
              defaultMessage="Save current"
            />
          </EuiButtonEmpty>
        )}
      </div>
    </EuiPanel>
  );
};

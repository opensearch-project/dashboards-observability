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
import React, { useMemo, useState } from 'react';
import {
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiFieldSearch,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiLink,
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
import { INTERNAL_LABEL_KEYS, SavedSearch } from './monitors_table_helpers';

// Cap on label-key facets rendered before the user expands the section.
// Mirrors the Alerts panel.
const LABEL_KEY_INITIAL_VISIBLE = 10;

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
  uniqueCreators: string[];
  facetCounts: {
    counts: Record<string, Record<string, number>>;
    labelCounts: Record<string, Record<string, number>>;
  };

  isFacetCollapsed: (id: string, defaultCollapsed?: boolean) => boolean;
  toggleFacetCollapse: (id: string, defaultCollapsed?: boolean) => void;

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
  datasources,
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
  // Local-to-the-panel state for the Labels search box and "Show all" toggle.
  // Pure view-side ergonomics — the parent already owns selected label values
  // via `filters.labels`, so there's no upstream state to lift.
  const [labelSearch, setLabelSearch] = useState('');
  const [showAllLabels, setShowAllLabels] = useState(false);

  // Per-name icon map so the datasource facet renders a leading
  // OpenSearch / Prometheus glyph next to each option. Keyed by name
  // because that's the option key passed to FacetFilterGroup.
  const datasourceIconMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const ds of datasources) {
      map[ds.name] = ds.type === 'prometheus' ? 'logoPrometheus' : 'logoOpenSearch';
    }
    return map;
  }, [datasources]);

  // Render a single facet group (delegates to shared component)
  const renderFacetGroup = (
    id: string,
    label: string,
    options: string[],
    selected: string[],
    onChange: (v: string[]) => void,
    counts: Record<string, number>,
    displayMap?: Record<string, string>,
    colorMap?: Record<string, string>,
    defaultCollapsed = false,
    showOptionCount = false
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
      showOptionCount={showOptionCount}
      isCollapsed={isFacetCollapsed(id, defaultCollapsed)}
      onToggleCollapse={(facetId) => toggleFacetCollapse(facetId, defaultCollapsed)}
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
          iconMap={datasourceIconMap}
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
        {(() => {
          const visibleLabelKeys = labelKeys.filter((k) => !INTERNAL_LABEL_KEYS.has(k));
          if (visibleLabelKeys.length === 0) return null;
          const q = labelSearch.trim().toLowerCase();
          const matchedLabelKeys = q
            ? visibleLabelKeys.filter((k) => k.toLowerCase().includes(q))
            : visibleLabelKeys;
          const cappedLabelKeys = showAllLabels
            ? matchedLabelKeys
            : matchedLabelKeys.slice(0, LABEL_KEY_INITIAL_VISIBLE);
          const hasOverflow = matchedLabelKeys.length > LABEL_KEY_INITIAL_VISIBLE;
          return (
            <>
              <EuiHorizontalRule margin="s" />
              <EuiText size="xs" color="subdued" style={{ marginBottom: 6 }}>
                <strong>
                  <FormattedMessage
                    id="observability.alerting.monitorsTable.filtersPanel.labelsHeader"
                    defaultMessage="Labels"
                  />
                </strong>
              </EuiText>
              <EuiFieldSearch
                compressed
                fullWidth
                placeholder={i18n.translate(
                  'observability.alerting.monitorsTable.filtersPanel.searchLabelsPlaceholder',
                  {
                    defaultMessage: 'Search labels',
                  }
                )}
                value={labelSearch}
                onChange={(e) => setLabelSearch(e.target.value)}
                aria-label={i18n.translate(
                  'observability.alerting.monitorsTable.filtersPanel.searchLabelsAriaLabel',
                  {
                    defaultMessage: 'Search labels',
                  }
                )}
                data-test-subj="monitorsLabelsSearch"
              />
              <EuiSpacer size="xs" />
              {cappedLabelKeys.map((key) =>
                renderFacetGroup(
                  `label:${key}`,
                  key,
                  collectLabelValues(rules, key),
                  filters.labels[key] || [],
                  (v) => updateLabelFilter(key, v),
                  facetCounts.labelCounts[key] || {},
                  undefined,
                  undefined,
                  true,
                  true
                )
              )}
              {matchedLabelKeys.length === 0 && (
                <EuiText size="xs" color="subdued">
                  <FormattedMessage
                    id="observability.alerting.monitorsTable.filtersPanel.noLabelMatches"
                    defaultMessage="No labels match"
                  />
                </EuiText>
              )}
              {hasOverflow && (
                <EuiLink
                  color="primary"
                  onClick={() => setShowAllLabels((v) => !v)}
                  data-test-subj="monitorsLabelsShowAll"
                >
                  <EuiText size="xs">
                    {showAllLabels ? (
                      <FormattedMessage
                        id="observability.alerting.monitorsTable.filtersPanel.showLessLabels"
                        defaultMessage="Show less"
                      />
                    ) : (
                      <FormattedMessage
                        id="observability.alerting.monitorsTable.filtersPanel.showAllLabels"
                        defaultMessage="Show all ({count})"
                        values={{ count: matchedLabelKeys.length }}
                      />
                    )}
                  </EuiText>
                </EuiLink>
              )}
            </>
          );
        })()}

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
                  <EuiLink color="primary" onClick={() => loadSavedSearch(ss)}>
                    {ss.name}
                  </EuiLink>
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

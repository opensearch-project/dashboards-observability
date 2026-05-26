/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Left-sidebar filter shell for the SLO listing.
 *
 * Each facet is an EuiAccordion wrapping a compressed EuiCheckboxGroup. High-
 * cardinality facets (Service, Team) get an EuiFieldSearch above the checkbox
 * list; the others are plain groups. The panel emits the full next filter
 * state on every change — URL sync stays in the parent.
 */

import React, { useMemo, useState } from 'react';
import {
  EuiAccordion,
  EuiButtonGroup,
  EuiCheckbox,
  EuiCheckboxGroup,
  EuiFieldSearch,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHealth,
  EuiHorizontalRule,
  EuiIcon,
  EuiLoadingSpinner,
  EuiSpacer,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';
import { euiThemeVars } from '@osd/ui-shared-deps/theme';
import { i18n } from '@osd/i18n';
import type { Datasource } from '../../../../../common/types/alerting';
import type {
  SloHealthState,
  SloListFilters,
  SloSummary,
  SuggestionKind,
} from '../../../../../common/slo/slo_types';
import { SLO_HEALTH_COLOR, SLO_HEALTH_ORDER } from '../../../../../common/slo/state';
import { KIND_LABEL } from './suggest_engine';

/**
 * Max number of Prometheus datasources that can be selected simultaneously.
 * Matches the Alert Manager cap so users see consistent behavior across the
 * plugin's cross-datasource views.
 */
export const DATASOURCE_SELECTION_CAP = 5;

type SloMode = 'active' | 'shadow';

const STATE_LABEL: Record<SloHealthState, string> = {
  breached: i18n.translate('observability.apm.slo.listFilterPanel.state.breached', {
    defaultMessage: 'Breached',
  }),
  warning: i18n.translate('observability.apm.slo.listFilterPanel.state.warning', {
    defaultMessage: 'Warning',
  }),
  ok: i18n.translate('observability.apm.slo.listFilterPanel.state.ok', {
    defaultMessage: 'Healthy',
  }),
  no_data: i18n.translate('observability.apm.slo.listFilterPanel.state.noData', {
    defaultMessage: 'No data',
  }),
  source_idle: i18n.translate('observability.apm.slo.listFilterPanel.state.sourceIdle', {
    defaultMessage: 'Source idle',
  }),
  stale: i18n.translate('observability.apm.slo.listFilterPanel.state.stale', {
    defaultMessage: 'Stale',
  }),
  disabled: i18n.translate('observability.apm.slo.listFilterPanel.state.disabled', {
    defaultMessage: 'Disabled',
  }),
  rules_missing: i18n.translate('observability.apm.slo.listFilterPanel.state.rulesMissing', {
    defaultMessage: 'Rules missing',
  }),
};

const MODE_LABEL: Record<SloMode, string> = {
  active: i18n.translate('observability.apm.slo.listFilterPanel.mode.active', {
    defaultMessage: 'Active',
  }),
  shadow: i18n.translate('observability.apm.slo.listFilterPanel.mode.shadow', {
    defaultMessage: 'Shadow',
  }),
};

/**
 * Canonical-kind options for the facet. Keep the order stable (APM-first,
 * otel/http/rpc next, then db/messaging/genai) so the checkbox list reads
 * the same across reloads regardless of which kinds happen to exist in the
 * current result set.
 */
const CANONICAL_KIND_ORDER: readonly SuggestionKind[] = [
  'apm-availability',
  'apm-latency',
  'http-availability',
  'http-latency',
  'rpc-availability',
  'rpc-latency',
  'db-latency',
  'messaging-latency',
  'genai-availability',
];

export interface SloListFilterPanelProps {
  filters: SloListFilters;
  onChange: (next: SloListFilters) => void;
  /**
   * Result set used to derive distinct service/team/tier/sliLeafType values.
   * Deliberately the *filtered* set — we don't fire a second unfiltered fetch.
   */
  items: SloSummary[];
  /** Prometheus datasources available to select (cap = 5). */
  datasources?: Datasource[];
  datasourcesLoading?: boolean;
  datasourcesError?: Error | null;
  /** Fires when the user hits the selection cap; the parent can show a toast. */
  onDatasourceCapReached?: () => void;
}

function distinctValues<T>(items: T[], pick: (t: T) => string | string[] | undefined): string[] {
  const set = new Set<string>();
  for (const it of items) {
    const v = pick(it);
    if (v === undefined) continue;
    if (Array.isArray(v)) v.forEach((s) => set.add(s));
    else if (v) set.add(v);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function toggleInArray<T>(arr: T[] | undefined, value: T): T[] | undefined {
  const set = new Set(arr ?? []);
  if (set.has(value)) set.delete(value);
  else set.add(value);
  const next = Array.from(set);
  return next.length === 0 ? undefined : next;
}

function arrToIdMap(values: string[] | undefined): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  (values ?? []).forEach((v) => (out[v] = true));
  return out;
}

interface FacetAccordionProps {
  id: string;
  label: string;
  options: Array<{ id: string; label: React.ReactNode }>;
  selected: string[] | undefined;
  onToggle: (id: string) => void;
  initialIsOpen?: boolean;
  searchable?: boolean;
  dataTestSubj: string;
}

const FacetAccordion: React.FC<FacetAccordionProps> = ({
  id,
  label,
  options,
  selected,
  onToggle,
  initialIsOpen = true,
  searchable = false,
  dataTestSubj,
}) => {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    if (!searchable || !query.trim()) return options;
    const q = query.toLowerCase();
    return options.filter((o) => o.id.toLowerCase().includes(q));
  }, [options, query, searchable]);
  const selectedCount = (selected ?? []).length;
  const buttonContent = (
    <EuiText size="xs">
      <strong>{label}</strong>
      {selectedCount > 0 ? (
        <span style={{ fontWeight: 400, marginLeft: 4 }}>({selectedCount})</span>
      ) : null}
    </EuiText>
  );

  return (
    <EuiAccordion
      id={id}
      buttonContent={buttonContent}
      initialIsOpen={initialIsOpen}
      data-test-subj={dataTestSubj}
    >
      <EuiSpacer size="xs" />
      {searchable ? (
        <>
          <EuiFieldSearch
            placeholder={i18n.translate('observability.apm.slo.listFilterPanel.searchPlaceholder', {
              defaultMessage: 'Search {label}',
              values: { label: label.toLowerCase() },
            })}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            isClearable
            compressed
            fullWidth
            data-test-subj={`${dataTestSubj}-search`}
          />
          <EuiSpacer size="xs" />
        </>
      ) : null}
      {filtered.length === 0 ? (
        <EuiText size="xs" color="subdued">
          {i18n.translate('observability.apm.slo.listFilterPanel.noValues', {
            defaultMessage: 'No values',
          })}
        </EuiText>
      ) : (
        <EuiCheckboxGroup
          options={filtered}
          idToSelectedMap={arrToIdMap(selected)}
          onChange={onToggle}
          compressed
          data-test-subj={`${dataTestSubj}-checkboxGroup`}
        />
      )}
    </EuiAccordion>
  );
};

/**
 * Capped multi-select for Prometheus datasources. Differs from FacetAccordion
 * because unchecked options are disabled once the cap is reached — the Alert
 * Manager precedent for the same UX.
 */
interface DatasourceFacetProps {
  datasources: Datasource[];
  selected: string[] | undefined;
  onChange: (next: string[] | undefined) => void;
  loading: boolean;
  error: Error | null;
  cap: number;
  onCapReached?: () => void;
}

const DatasourceFacet: React.FC<DatasourceFacetProps> = ({
  datasources,
  selected,
  onChange,
  loading,
  error,
  cap,
  onCapReached,
}) => {
  const [query, setQuery] = useState('');
  const selectedSet = useMemo(() => new Set(selected ?? []), [selected]);
  const visible = useMemo(() => {
    if (!query.trim()) return datasources;
    const q = query.toLowerCase();
    return datasources.filter((d) => d.name.toLowerCase().includes(q));
  }, [datasources, query]);

  const atCap = selectedSet.size >= cap;

  const toggle = (id: string) => {
    if (selectedSet.has(id)) {
      const next = Array.from(selectedSet);
      const idx = next.indexOf(id);
      next.splice(idx, 1);
      onChange(next.length === 0 ? undefined : next);
      return;
    }
    if (atCap) {
      onCapReached?.();
      return;
    }
    const next = [...selectedSet, id];
    onChange(next);
  };

  const buttonContent = (
    <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
      <EuiFlexItem grow={false}>
        <EuiText size="xs">
          <strong>
            {i18n.translate('observability.apm.slo.listFilterPanel.datasourceFacet.label', {
              defaultMessage: 'Prometheus datasources',
            })}
          </strong>
          {selectedSet.size > 0 ? (
            <span style={{ fontWeight: 400, marginLeft: 4 }}>
              ({selectedSet.size}/{cap})
            </span>
          ) : null}
        </EuiText>
      </EuiFlexItem>
    </EuiFlexGroup>
  );

  return (
    <EuiAccordion
      id="slosFilterAccordionDatasource"
      buttonContent={buttonContent}
      initialIsOpen
      data-test-subj="slosFilterAccordionDatasource"
    >
      <EuiSpacer size="xs" />
      <EuiText size="xs" color="subdued">
        {i18n.translate('observability.apm.slo.listFilterPanel.datasourceFacet.scopeHint', {
          defaultMessage: 'Scope the catalog to up to {cap} datasources.',
          values: { cap },
        })}
      </EuiText>
      <EuiSpacer size="xs" />

      {loading ? (
        <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiLoadingSpinner size="s" />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiText size="xs" color="subdued">
              {i18n.translate('observability.apm.slo.listFilterPanel.datasourceFacet.loading', {
                defaultMessage: 'Loading datasources…',
              })}
            </EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
      ) : error ? (
        <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiIcon type="alert" color="danger" size="s" />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiText size="xs" color="danger">
              {i18n.translate('observability.apm.slo.listFilterPanel.datasourceFacet.loadFailed', {
                defaultMessage: 'Failed to load datasources',
              })}
            </EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
      ) : datasources.length === 0 ? (
        <EuiText size="xs" color="subdued">
          {i18n.translate('observability.apm.slo.listFilterPanel.datasourceFacet.empty', {
            defaultMessage: 'No Prometheus datasources registered.',
          })}
        </EuiText>
      ) : (
        <>
          <EuiFieldSearch
            placeholder={i18n.translate(
              'observability.apm.slo.listFilterPanel.datasourceFacet.searchPlaceholder',
              { defaultMessage: 'Search datasources' }
            )}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            isClearable
            compressed
            fullWidth
            data-test-subj="slosFilterAccordionDatasourceSearch"
          />
          <EuiSpacer size="xs" />
          {atCap && (
            <>
              <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
                <EuiFlexItem grow={false}>
                  <EuiIcon type="iInCircle" color="warning" size="s" />
                </EuiFlexItem>
                <EuiFlexItem>
                  <EuiText size="xs" color="warning">
                    {i18n.translate(
                      'observability.apm.slo.listFilterPanel.datasourceFacet.capReached',
                      {
                        defaultMessage:
                          'Cap reached ({cap} of {cap}). Deselect one to pick another.',
                        values: { cap },
                      }
                    )}
                  </EuiText>
                </EuiFlexItem>
              </EuiFlexGroup>
              <EuiSpacer size="xs" />
            </>
          )}
          <div
            style={{
              maxHeight: 200,
              overflowY: 'auto',
              paddingRight: 4,
              marginRight: -4,
            }}
            data-test-subj="slosFilterAccordionDatasourceList"
          >
            {visible.map((ds) => {
              const isSelected = selectedSet.has(ds.id);
              const disabled = !isSelected && atCap;
              const checkbox = (
                <EuiCheckbox
                  id={`slos-ds-${ds.id}`}
                  label={
                    <EuiText size="xs" style={{ lineHeight: '16px' }}>
                      {ds.name}
                    </EuiText>
                  }
                  checked={isSelected}
                  disabled={disabled}
                  onChange={() => toggle(ds.id)}
                  compressed
                  data-test-subj={`slosFilterDatasourceCheckbox-${ds.id}`}
                />
              );
              return (
                <div
                  key={ds.id}
                  style={{
                    padding: '2px 0',
                    opacity: disabled ? 0.55 : 1,
                    borderBottom: `1px solid ${euiThemeVars.euiColorLightestShade}`,
                  }}
                >
                  {disabled ? (
                    <EuiToolTip
                      content={i18n.translate(
                        'observability.apm.slo.listFilterPanel.datasourceFacet.maxTooltip',
                        {
                          defaultMessage: 'Max {cap} datasources; deselect one first.',
                          values: { cap },
                        }
                      )}
                    >
                      <span>{checkbox}</span>
                    </EuiToolTip>
                  ) : (
                    checkbox
                  )}
                </div>
              );
            })}
            {visible.length === 0 && (
              <EuiText size="xs" color="subdued">
                {i18n.translate('observability.apm.slo.listFilterPanel.datasourceFacet.noMatch', {
                  defaultMessage: 'No datasources match "{query}".',
                  values: { query },
                })}
              </EuiText>
            )}
          </div>
        </>
      )}
    </EuiAccordion>
  );
};

export const SloListFilterPanel: React.FC<SloListFilterPanelProps> = ({
  filters,
  onChange,
  items,
  datasources = [],
  datasourcesLoading = false,
  datasourcesError = null,
  onDatasourceCapReached,
}) => {
  const allServices = useMemo(() => distinctValues(items, (s) => s.service), [items]);
  const allTeams = useMemo(() => distinctValues(items, (s) => s.owner.teams), [items]);
  const allTiers = useMemo(() => distinctValues(items, (s) => s.tier), [items]);
  const allLeafTypes = useMemo(() => distinctValues(items, (s) => s.sliLeafType), [items]);

  const patch = (delta: Partial<SloListFilters>) => onChange({ ...filters, ...delta });

  return (
    <div data-test-subj="slosListingFilterPanel">
      <DatasourceFacet
        datasources={datasources}
        selected={filters.datasourceId}
        onChange={(next) => patch({ datasourceId: next })}
        loading={datasourcesLoading}
        error={datasourcesError}
        cap={DATASOURCE_SELECTION_CAP}
        onCapReached={onDatasourceCapReached}
      />
      <EuiHorizontalRule margin="xs" />

      <FacetAccordion
        id="slosFilterAccordionState"
        label={i18n.translate('observability.apm.slo.listFilterPanel.facet.state', {
          defaultMessage: 'State',
        })}
        dataTestSubj="slosFilterAccordionState"
        options={SLO_HEALTH_ORDER.map((s) => ({
          id: s,
          label: (
            <EuiHealth color={SLO_HEALTH_COLOR[s]}>
              <span style={{ fontSize: 12 }}>{STATE_LABEL[s]}</span>
            </EuiHealth>
          ),
        }))}
        selected={filters.state}
        onToggle={(id) => patch({ state: toggleInArray(filters.state, id as SloHealthState) })}
      />
      <EuiHorizontalRule margin="xs" />

      <FacetAccordion
        id="slosFilterAccordionSliType"
        label={i18n.translate('observability.apm.slo.listFilterPanel.facet.sliType', {
          defaultMessage: 'SLI type',
        })}
        dataTestSubj="slosFilterAccordionSliType"
        options={allLeafTypes.map((v) => ({ id: v, label: v }))}
        selected={filters.sliLeafType}
        onToggle={(id) => patch({ sliLeafType: toggleInArray(filters.sliLeafType, id) })}
      />
      <EuiHorizontalRule margin="xs" />

      <FacetAccordion
        id="slosFilterAccordionCanonicalKind"
        label={i18n.translate('observability.apm.slo.listFilterPanel.facet.canonicalKind', {
          defaultMessage: 'Canonical kind',
        })}
        dataTestSubj="slosFilterAccordionCanonicalKind"
        options={CANONICAL_KIND_ORDER.map((k) => ({ id: k, label: KIND_LABEL[k] }))}
        selected={filters.canonicalKind}
        onToggle={(id) =>
          patch({
            canonicalKind: toggleInArray(filters.canonicalKind, id as SuggestionKind),
          })
        }
      />
      <EuiHorizontalRule margin="xs" />

      <FacetAccordion
        id="slosFilterAccordionService"
        label={i18n.translate('observability.apm.slo.listFilterPanel.facet.service', {
          defaultMessage: 'Service',
        })}
        dataTestSubj="slosFilterAccordionService"
        options={allServices.map((v) => ({ id: v, label: v }))}
        selected={filters.service}
        onToggle={(id) => patch({ service: toggleInArray(filters.service, id) })}
        searchable
      />
      <EuiHorizontalRule margin="xs" />

      <FacetAccordion
        id="slosFilterAccordionTeam"
        label={i18n.translate('observability.apm.slo.listFilterPanel.facet.team', {
          defaultMessage: 'Team',
        })}
        dataTestSubj="slosFilterAccordionTeam"
        options={allTeams.map((v) => ({ id: v, label: v }))}
        selected={filters.team}
        onToggle={(id) => patch({ team: toggleInArray(filters.team, id) })}
        searchable
      />
      <EuiHorizontalRule margin="xs" />

      <FacetAccordion
        id="slosFilterAccordionTier"
        label={i18n.translate('observability.apm.slo.listFilterPanel.facet.tier', {
          defaultMessage: 'Tier',
        })}
        dataTestSubj="slosFilterAccordionTier"
        options={allTiers.map((v) => ({ id: v, label: v }))}
        selected={filters.tier}
        onToggle={(id) => patch({ tier: toggleInArray(filters.tier, id) })}
      />
      <EuiHorizontalRule margin="xs" />

      <FacetAccordion
        id="slosFilterAccordionMode"
        label={i18n.translate('observability.apm.slo.listFilterPanel.facet.mode', {
          defaultMessage: 'Mode',
        })}
        dataTestSubj="slosFilterAccordionMode"
        options={(['active', 'shadow'] as const).map((v) => ({ id: v, label: MODE_LABEL[v] }))}
        selected={filters.mode}
        onToggle={(id) => patch({ mode: toggleInArray(filters.mode, id as SloMode) })}
      />
      <EuiHorizontalRule margin="xs" />

      <EuiAccordion
        id="slosFilterAccordionEnabled"
        buttonContent={
          <EuiText size="xs">
            <strong>
              {i18n.translate('observability.apm.slo.listFilterPanel.facet.enabled', {
                defaultMessage: 'Enabled',
              })}
            </strong>
            {filters.enabled !== undefined ? (
              <span style={{ fontWeight: 400, marginLeft: 4 }}>
                (
                {filters.enabled
                  ? i18n.translate('observability.apm.slo.listFilterPanel.enabledIndicator.yes', {
                      defaultMessage: 'yes',
                    })
                  : i18n.translate('observability.apm.slo.listFilterPanel.enabledIndicator.no', {
                      defaultMessage: 'no',
                    })}
                )
              </span>
            ) : null}
          </EuiText>
        }
        initialIsOpen
        data-test-subj="slosFilterAccordionEnabled"
      >
        <EuiSpacer size="xs" />
        <EuiButtonGroup
          legend={i18n.translate('observability.apm.slo.listFilterPanel.enabledLegend', {
            defaultMessage: 'Filter by enabled',
          })}
          buttonSize="compressed"
          options={[
            {
              id: 'any',
              label: i18n.translate('observability.apm.slo.listFilterPanel.enabled.any', {
                defaultMessage: 'Any',
              }),
            },
            {
              id: 'yes',
              label: i18n.translate('observability.apm.slo.listFilterPanel.enabled.yes', {
                defaultMessage: 'Yes',
              }),
            },
            {
              id: 'no',
              label: i18n.translate('observability.apm.slo.listFilterPanel.enabled.no', {
                defaultMessage: 'No',
              }),
            },
          ]}
          idSelected={filters.enabled === undefined ? 'any' : filters.enabled ? 'yes' : 'no'}
          onChange={(id) => patch({ enabled: id === 'any' ? undefined : id === 'yes' })}
          data-test-subj="slosFilterEnabledGroup"
        />
      </EuiAccordion>
    </div>
  );
};

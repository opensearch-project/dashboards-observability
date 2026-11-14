/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The Datasource facet of the Alerts and Rules tabs, grouped by type (OpenSearch, Prometheus,
 * CloudWatch), each group headed by its type icon. An entry is one source: an OpenSearch
 * cluster, a Prometheus workspace, or a CloudWatch account scope. A CloudWatch account stands
 * for its (account, region) datasources in the selected regions; the group's "Regions" control
 * (shown once an account is checked) picks those regions for every checked account.
 *
 * Within each group, checked entries come first and the first
 * `DATASOURCE_FACET_INITIAL_VISIBLE` entries show, with a "+N more" toggle; a search shows every
 * match.
 */
import React, { useMemo, useState } from 'react';
import {
  EuiBadge,
  EuiButtonEmpty,
  EuiCheckbox,
  EuiFieldSearch,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiLink,
  EuiLoadingSpinner,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { FormattedMessage } from '@osd/i18n/react';
import type { Datasource, DatasourceType } from '../../../common/types/alerting';
import {
  CLOUDWATCH_DEFAULT_SCOPE_LABEL,
  cloudWatchScopeKeyOf,
} from '../../../common/services/alerting/cloudwatch_datasource_id';
import { FacetErrorIndicator } from './facet_filter_panel';
import { CloudWatchRegionControl } from './cloudwatch_region_control';
import { limitDatasourceSelection } from './hooks/use_cloudwatch_regions';
import { CLOUDWATCH_ICON_FALLBACK, useCloudWatchIconType } from './cloudwatch_icon';

const FACET_ID = 'datasource';

/** Entries shown per group before the "+N more" toggle. */
export const DATASOURCE_FACET_INITIAL_VISIBLE = 5;

/** A `data-test-subj` suffix for an entry key (`ds:<id>`, `cw:<scope>`): letters, digits, `-`. */
export function datasourceEntryTestSubj(key: string): string {
  return `datasourceFacet-entry-${key.replace(/[^A-Za-z0-9-]/g, '-')}`;
}

export const DATASOURCE_TYPE_ORDER: DatasourceType[] = ['opensearch', 'prometheus', 'cloudwatch'];

export const DATASOURCE_TYPE_ICONS: Record<DatasourceType, string> = {
  opensearch: 'logoOpenSearch',
  prometheus: 'logoPrometheus',
  // OUI has no CloudWatch logo: the facet shows core's CloudWatch logo (see cloudwatch_icon.ts)
  // and falls back to this one when it cannot load.
  cloudwatch: CLOUDWATCH_ICON_FALLBACK,
};

export function datasourceTypeLabel(type: DatasourceType): string {
  switch (type) {
    case 'prometheus':
      return i18n.translate('observability.alerting.datasourceFacet.group.prometheus', {
        defaultMessage: 'Prometheus',
      });
    case 'cloudwatch':
      return i18n.translate('observability.alerting.datasourceFacet.group.cloudwatch', {
        defaultMessage: 'CloudWatch',
      });
    default:
      return i18n.translate('observability.alerting.datasourceFacet.group.opensearch', {
        defaultMessage: 'OpenSearch',
      });
  }
}

/** One checkbox of the facet. */
export interface DatasourceFacetEntry {
  key: string;
  label: string;
  type: DatasourceType;
  /** The datasources the entry selects when checked. */
  datasources: Datasource[];
}

/** The key of the entry a selected datasource id belongs to. */
export function datasourceEntryKeyOf(id: string): string {
  const scope = cloudWatchScopeKeyOf(id);
  return scope === undefined ? `ds:${id}` : `cw:${scope}`;
}

/**
 * The label of a datasource's facet entry: the name, or for CloudWatch the account scope's
 * label. The default scope (the caller's own account) without a label of its own reads
 * "This account", with the account id when the source reports it.
 */
export function datasourceEntryLabel(ds: Datasource): string {
  if (ds.type !== 'cloudwatch') return ds.name;
  const label = ds.cloudWatchScopeLabel;
  if (ds.cloudWatchScope === undefined && (!label || label === CLOUDWATCH_DEFAULT_SCOPE_LABEL)) {
    return ds.accountId
      ? i18n.translate('observability.alerting.datasourceFacet.cloudWatchOwnAccountWithId', {
          defaultMessage: 'This account ({accountId})',
          values: { accountId: ds.accountId },
        })
      : i18n.translate('observability.alerting.datasourceFacet.cloudWatchOwnAccount', {
          defaultMessage: 'This account',
        });
  }
  return label || ds.name;
}

/**
 * The facet entries: each OpenSearch or Prometheus datasource (by name), and one per
 * CloudWatch account scope (in listing order, labelled by `datasourceEntryLabel`).
 */
export function buildDatasourceFacetEntries(datasources: Datasource[]): DatasourceFacetEntry[] {
  const byKey = new Map<string, DatasourceFacetEntry>();
  for (const ds of datasources) {
    const key = datasourceEntryKeyOf(ds.id);
    const existing = byKey.get(key);
    if (existing) {
      existing.datasources.push(ds);
      continue;
    }
    byKey.set(key, { key, label: datasourceEntryLabel(ds), type: ds.type, datasources: [ds] });
  }
  const entries = Array.from(byKey.values());
  const byName = (a: DatasourceFacetEntry, b: DatasourceFacetEntry) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
  return DATASOURCE_TYPE_ORDER.flatMap((type) => {
    const ofType = entries.filter((e) => (e.type ?? 'opensearch') === type);
    // CloudWatch accounts keep the source's order (own account first).
    return type === 'cloudwatch' ? ofType : ofType.sort(byName);
  });
}

/**
 * The selection after checking or unchecking an entry: unchecking drops every selected id of
 * the entry, checking adds its datasources. Refused (with the flag set) past the limits.
 */
export function toggleDatasourceEntry(
  entry: DatasourceFacetEntry,
  selectedDsIds: string[],
  maxDatasources: number
) {
  const checked = selectedDsIds.some((id) => datasourceEntryKeyOf(id) === entry.key);
  if (checked) {
    return limitDatasourceSelection(
      selectedDsIds,
      selectedDsIds.filter((id) => datasourceEntryKeyOf(id) !== entry.key),
      maxDatasources
    );
  }
  const additions = entry.datasources.map((d) => d.id).filter((id) => !selectedDsIds.includes(id));
  return limitDatasourceSelection(selectedDsIds, [...selectedDsIds, ...additions], maxDatasources);
}

/**
 * The entry's error text: per region for a CloudWatch account (`<region>: <error>` lines). The
 * page leaves a CloudWatch account out of the map unless every selected region of it failed with
 * an error other than a permission error.
 */
function entryError(
  entry: DatasourceFacetEntry,
  errorMap?: Record<string, string>
): string | undefined {
  if (!errorMap) return undefined;
  const lines: string[] = [];
  for (const ds of entry.datasources) {
    const error = errorMap[ds.name];
    if (!error) continue;
    lines.push(entry.type === 'cloudwatch' && ds.region ? `${ds.region}: ${error}` : error);
  }
  return lines.length > 0 ? lines.join('\n') : undefined;
}

/** The CloudWatch region selection, when the source reports its regions. */
export interface DatasourceFacetCloudWatch {
  /** The regions the source offers. */
  regions: Array<{ id: string; name: string }>;
  selectedRegions: string[];
  onRegionsChange: (regions: string[]) => void;
  /** Fires when a change would select too many CloudWatch (account, region) datasources. */
  onPairCapReached: () => void;
  /** True while the CloudWatch accounts load; the group shows a loading state meanwhile. */
  loading?: boolean;
  /** True when the CloudWatch accounts couldn't be read; the group offers a retry. */
  failed?: boolean;
  onRetry?: () => void;
}

export interface DatasourceFacetProps {
  datasources: Datasource[];
  selectedDsIds: string[];
  onChange: (ids: string[]) => void;
  maxDatasources: number;
  onCapReached: () => void;
  /** Per-datasource error text keyed by datasource name. */
  errorMap?: Record<string, string>;
  cloudWatch?: DatasourceFacetCloudWatch;
  searchAriaLabel?: string;
  isCollapsed: boolean;
  onToggleCollapse: (id: string) => void;
}

export const DatasourceFacet: React.FC<DatasourceFacetProps> = ({
  datasources,
  selectedDsIds,
  onChange,
  maxDatasources,
  onCapReached,
  errorMap,
  cloudWatch,
  searchAriaLabel,
  isCollapsed,
  onToggleCollapse,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedTypes, setExpandedTypes] = useState<Set<DatasourceType>>(() => new Set());
  const cloudWatchIconType = useCloudWatchIconType();
  const title = i18n.translate('observability.alerting.datasourceFacet.title', {
    defaultMessage: 'Datasource',
  });

  const entries = useMemo(() => buildDatasourceFacetEntries(datasources), [datasources]);
  const checkedKeys = useMemo(
    () => new Set(selectedDsIds.map(datasourceEntryKeyOf)),
    [selectedDsIds]
  );
  const activeCount = entries.filter((e) => checkedKeys.has(e.key)).length;
  const cloudWatchChecked = entries.some((e) => e.type === 'cloudwatch' && checkedKeys.has(e.key));

  const q = searchTerm.trim().toLowerCase();
  const visible = q ? entries.filter((e) => e.label.toLowerCase().includes(q)) : entries;

  const toggle = (entry: DatasourceFacetEntry) => {
    const change = toggleDatasourceEntry(entry, selectedDsIds, maxDatasources);
    if (change.capReached) onCapReached();
    else if (change.pairCapReached) (cloudWatch?.onPairCapReached ?? onCapReached)();
    else onChange(change.selectedDsIds);
  };

  const renderEntry = (entry: DatasourceFacetEntry) => {
    const error = entryError(entry, errorMap);
    const checkboxId = `${FACET_ID}-${entry.key}`;
    return (
      <div key={entry.key} className="altFacetCheckboxRow">
        <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
          <EuiFlexItem grow={true} style={{ minWidth: 0 }}>
            <EuiCheckbox
              id={checkboxId}
              data-test-subj={datasourceEntryTestSubj(entry.key)}
              label={
                // Labels wrap instead of truncating, so a long account label stays readable.
                <span style={{ fontSize: 12, lineHeight: '18px', overflowWrap: 'anywhere' }}>
                  {entry.label}
                </span>
              }
              checked={checkedKeys.has(entry.key)}
              onChange={() => toggle(entry)}
              compressed
            />
          </EuiFlexItem>
          {error && (
            <EuiFlexItem grow={false}>
              <FacetErrorIndicator
                facetId={FACET_ID}
                option={entry.label}
                displayLabel={entry.label}
                error={error}
              />
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
      </div>
    );
  };

  return (
    <div style={{ marginBottom: 12 }} data-test-subj={`facetGroup-${FACET_ID}`}>
      <EuiFlexGroup
        gutterSize="xs"
        alignItems="center"
        responsive={false}
        style={{ marginBottom: 4 }}
      >
        <EuiFlexItem grow={true} style={{ minWidth: 0 }}>
          <EuiButtonEmpty
            size="xs"
            color="text"
            flush="left"
            contentProps={{ style: { justifyContent: 'flex-start', width: '100%' } }}
            iconType={isCollapsed ? 'arrowRight' : 'arrowDown'}
            iconSide="left"
            onClick={() => onToggleCollapse(FACET_ID)}
            aria-expanded={!isCollapsed}
            aria-controls={isCollapsed ? undefined : `facetGroup-${FACET_ID}-region`}
            data-test-subj={`facetGroup-${FACET_ID}-toggle`}
          >
            <strong>{title}</strong>
          </EuiButtonEmpty>
        </EuiFlexItem>
        {activeCount > 0 && (
          <EuiFlexItem grow={false}>
            <EuiBadge color="primary">{activeCount}</EuiBadge>
          </EuiFlexItem>
        )}
        {activeCount > 0 && (
          <EuiFlexItem grow={false}>
            <EuiLink
              color="primary"
              onClick={() => onChange([])}
              data-test-subj={`facetGroup-${FACET_ID}-clear`}
              className="altFacetTarget"
              style={{ padding: '0 4px' }}
            >
              <EuiText size="xs">
                <FormattedMessage
                  id="observability.alerting.facetFilterPanel.clear"
                  defaultMessage="Clear"
                />
              </EuiText>
            </EuiLink>
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
      {!isCollapsed && (
        <div
          id={`facetGroup-${FACET_ID}-region`}
          role="region"
          aria-label={title}
          style={{ paddingLeft: 4 }}
        >
          <EuiFieldSearch
            compressed
            fullWidth
            placeholder={i18n.translate(
              'observability.alerting.datasourceFacet.searchPlaceholder',
              {
                defaultMessage: 'Search datasource',
              }
            )}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            aria-label={
              searchAriaLabel ||
              i18n.translate('observability.alerting.datasourceFacet.searchAriaLabel', {
                defaultMessage: 'Search datasources',
              })
            }
            data-test-subj={`facetGroup-${FACET_ID}-search`}
          />
          <EuiSpacer size="xs" />
          {DATASOURCE_TYPE_ORDER.map((type) => {
            const matching = visible.filter((e) => e.type === type);
            // Checked first, keeping the order within the checked and unchecked parts.
            const ordered = [
              ...matching.filter((e) => checkedKeys.has(e.key)),
              ...matching.filter((e) => !checkedKeys.has(e.key)),
            ];
            const expanded = expandedTypes.has(type);
            const hasOverflow = !q && ordered.length > DATASOURCE_FACET_INITIAL_VISIBLE;
            const ofType =
              hasOverflow && !expanded
                ? ordered.slice(0, DATASOURCE_FACET_INITIAL_VISIBLE)
                : ordered;
            const showRegions =
              type === 'cloudwatch' &&
              !!cloudWatch &&
              cloudWatch.regions.length > 1 &&
              cloudWatchChecked;
            const showLoading = type === 'cloudwatch' && !!cloudWatch?.loading && !q;
            const showFailed = type === 'cloudwatch' && !!cloudWatch?.failed && !q;
            if (ofType.length === 0 && !showRegions && !showLoading && !showFailed) return null;
            return (
              <div
                key={type}
                data-test-subj={`datasourceFacet-group-${type}`}
                style={{ marginBottom: 6 }}
              >
                <EuiFlexGroup
                  gutterSize="xs"
                  alignItems="center"
                  responsive={false}
                  style={{ marginTop: 2, marginBottom: 2 }}
                >
                  <EuiFlexItem grow={false}>
                    <EuiIcon
                      type={
                        type === 'cloudwatch' ? cloudWatchIconType : DATASOURCE_TYPE_ICONS[type]
                      }
                      size="s"
                      data-test-subj={`datasourceFacet-groupIcon-${type}`}
                    />
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiText size="xs" color="subdued">
                      <strong>{datasourceTypeLabel(type)}</strong>
                    </EuiText>
                  </EuiFlexItem>
                </EuiFlexGroup>
                <div style={{ paddingLeft: 4 }}>{ofType.map(renderEntry)}</div>
                {showLoading && (
                  <EuiFlexGroup
                    gutterSize="xs"
                    alignItems="center"
                    responsive={false}
                    style={{ paddingLeft: 4 }}
                    data-test-subj="datasourceFacet-cloudwatch-loading"
                  >
                    <EuiFlexItem grow={false}>
                      <EuiLoadingSpinner size="s" />
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiText size="xs" color="subdued">
                        <FormattedMessage
                          id="observability.alerting.datasourceFacet.cloudWatchLoading"
                          defaultMessage="Loading accounts"
                        />
                      </EuiText>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                )}
                {showFailed && (
                  <EuiFlexGroup
                    gutterSize="xs"
                    alignItems="center"
                    responsive={false}
                    style={{ paddingLeft: 4 }}
                    data-test-subj="datasourceFacet-cloudwatch-error"
                  >
                    <EuiFlexItem grow={false}>
                      <EuiIcon type="alert" color="warning" size="s" />
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiText size="xs" color="subdued">
                        <FormattedMessage
                          id="observability.alerting.datasourceFacet.cloudWatchError"
                          defaultMessage="Couldn't load accounts"
                        />
                      </EuiText>
                    </EuiFlexItem>
                    {cloudWatch?.onRetry && (
                      <EuiFlexItem grow={false}>
                        <EuiLink
                          color="primary"
                          onClick={cloudWatch.onRetry}
                          data-test-subj="datasourceFacet-cloudwatch-retry"
                        >
                          <EuiText size="xs">
                            <FormattedMessage
                              id="observability.alerting.datasourceFacet.cloudWatchRetry"
                              defaultMessage="Retry"
                            />
                          </EuiText>
                        </EuiLink>
                      </EuiFlexItem>
                    )}
                  </EuiFlexGroup>
                )}
                {hasOverflow && (
                  <EuiLink
                    onClick={() =>
                      setExpandedTypes((prev) => {
                        const next = new Set(prev);
                        if (next.has(type)) next.delete(type);
                        else next.add(type);
                        return next;
                      })
                    }
                    color="primary"
                    data-test-subj={`datasourceFacet-group-${type}-showMore`}
                    style={{ marginTop: 4, paddingLeft: 4 }}
                  >
                    <EuiText size="xs">
                      {expanded ? (
                        <FormattedMessage
                          id="observability.alerting.facetFilterPanel.showLess"
                          defaultMessage="Show less"
                        />
                      ) : (
                        <FormattedMessage
                          id="observability.alerting.facetFilterPanel.showMore"
                          defaultMessage="+{count} more"
                          values={{ count: ordered.length - DATASOURCE_FACET_INITIAL_VISIBLE }}
                        />
                      )}
                    </EuiText>
                  </EuiLink>
                )}
                {showRegions && cloudWatch && (
                  <div style={{ paddingLeft: 4, marginTop: 4 }}>
                    <CloudWatchRegionControl
                      regions={cloudWatch.regions}
                      selected={cloudWatch.selectedRegions}
                      onChange={cloudWatch.onRegionsChange}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * "Suggest SLOs" page — enumerates the APM services the plugin already sees
 * (same PPL discovery path as Services Home: `useServices`), then drafts a
 * pair of SLOs per service (availability + latency on span-derived RED
 * metrics). The user reviews, tweaks, and creates in one batch.
 *
 * Nothing ships alerting rules until the user clicks "Create N selected";
 * every draft is a harmless client-side object until then.
 *
 * Decomposition:
 *   - useDiscoveryProbes: OTel probe fan-out + ruler-rules fetch.
 *   - useBatchCreate: per-row create state + bounded-concurrency runner.
 *   - useLivePreview (inside SuggestBatchPreview): rule-group preview + live SLI.
 *   - SuggestionInlineRow / ServiceTreeTable / SuggestBatchPreview / SuggestPreviewRow:
 *     siblings under this directory. The page itself is pure composition.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiCode,
  EuiConfirmModal,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutHeader,
  EuiLoadingSpinner,
  EuiPage,
  EuiPageBody,
  EuiPageContent,
  EuiPageContentBody,
  EuiPanel,
  EuiProgress,
  EuiSpacer,
  EuiStat,
  EuiTitle,
  EuiText,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { useHistory, useLocation } from 'react-router-dom';
import { ChromeStart, HttpStart, NotificationsStart } from '../../../../../../../src/core/public';
import { HeaderControlledComponentsWrapper } from '../../../../plugin_helpers/plugin_headerControl';
import { useApmConfig } from '../../config/apm_config_context';
import { useServices } from '../../shared/hooks/use_services';
import { parseTimeRange } from '../../shared/utils/time_utils';
import type { SloApiClient } from './slo_api_client';
import { DiscoveredService, Suggestion, generateSuggestionsForServices } from './suggest_engine';
import { parseSuggestScopeFromSearch } from './slo_suggest_scope';
import { OverridePatch, OverrideValues } from './suggest_inline_row';
import { ServiceRowShape, ServiceTreeTable } from './suggest_service_tree_table';
import { SuggestBatchPreview } from './suggest_batch_preview';
import { useDiscoveryProbes } from './suggest_use_discovery_probes';
import { useBatchCreate } from './suggest_use_batch_create';

export interface SloSuggestPageProps {
  apiClient: SloApiClient;
  http: HttpStart;
  chrome: ChromeStart;
  notifications: NotificationsStart;
  parentBreadcrumb: { text: string; href: string };
}

export const SloSuggestPage: React.FC<SloSuggestPageProps> = ({
  apiClient,
  chrome,
  http,
  notifications,
  parentBreadcrumb,
}) => {
  const history = useHistory();
  const location = useLocation();
  const scope = useMemo(() => parseSuggestScopeFromSearch(location.search), [location.search]);
  const { config, loading: configLoading } = useApmConfig();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /** Per-suggestion overrides users type into the card. */
  const [overrides, setOverrides] = useState<Record<string, OverrideValues>>({});
  const [showPreview, setShowPreview] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});
  /** Bumping this triggers the discovery effect; covers the "Rediscover" button. */
  const [discoveryEpoch, setDiscoveryEpoch] = useState(0);

  useEffect(() => {
    chrome.setBreadcrumbs([
      parentBreadcrumb,
      {
        text: i18n.translate('observability.apm.slo.suggest.breadcrumb.slos', {
          defaultMessage: 'SLO/SLI',
        }),
        href: '#/slos',
      },
      {
        text: i18n.translate('observability.apm.slo.suggest.breadcrumb.suggest', {
          defaultMessage: 'Suggest',
        }),
      },
    ]);
  }, [chrome, parentBreadcrumb]);

  // Use the Prometheus datasource the APM config points at — same one the SLO
  // wizard writes SLOs against. Users who want a different datasource edit the
  // APM config rather than picking here.
  const datasourceId = config?.prometheusDataSource?.name ?? '';

  // Same time range as Services Home's default (15m) — discovery is only about
  // "does this service emit traces right now?", not historical enumeration.
  const timeRange = useMemo(() => ({ from: 'now-15m', to: 'now' }), []);
  const parsedTimeRange = useMemo(() => parseTimeRange(timeRange), [timeRange]);

  const {
    data: allDiscoveredServices,
    isLoading: servicesLoading,
    error: servicesError,
    refetch,
  } = useServices({
    startTime: parsedTimeRange.startTime,
    endTime: parsedTimeRange.endTime,
  });

  // Apply URL scope before the `services.length === 0` guard in `suggestions`.
  // A stale deep link (scope names nothing discovery sees) falls back to the
  // full list so the page stays usable; the UI still surfaces the miss.
  const scopedServices = useMemo(() => {
    if (!scope.services) return allDiscoveredServices;
    const allow = new Set(scope.services);
    const filtered = allDiscoveredServices.filter((s) => allow.has(s.serviceName));
    return filtered.length > 0 ? filtered : allDiscoveredServices;
  }, [allDiscoveredServices, scope.services]);

  const scopeFellThrough =
    scope.services !== undefined &&
    allDiscoveredServices.length > 0 &&
    allDiscoveredServices.every((s) => !scope.services!.includes(s.serviceName));

  const services = scopedServices;

  const {
    metricNames,
    labelValuesByMetric,
    existingRuleGroups,
    rulerFetchFailed,
    loading: discoveryLoading,
  } = useDiscoveryProbes({ http, datasourceId, epoch: discoveryEpoch });

  const suggestions = useMemo<Suggestion[]>(() => {
    if (!datasourceId || !services || services.length === 0) return [];
    const discovered: DiscoveredService[] = services.map((s) => ({
      serviceName: s.serviceName,
      environment: s.environment,
    }));
    return generateSuggestionsForServices({
      datasourceId,
      services: discovered,
      metricNames,
      labelValuesByMetric,
      existingRuleGroups,
    });
  }, [datasourceId, services, metricNames, labelValuesByMetric, existingRuleGroups]);

  // Default every suggestion to "selected" when the list changes — EXCEPT
  // those already covered by an existing Prometheus rule. Users can re-check
  // covered drafts explicitly if they want a duplicate, but the common case
  // is "leave them unchecked so we don't dual-write".
  useEffect(() => {
    setSelected(new Set(suggestions.filter((s) => !s.existingRuleMatch).map((s) => s.key)));
  }, [suggestions]);

  const toggle = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const setOverride = useCallback((key: string, patch: OverridePatch) => {
    setOverrides((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }, []);

  const applyOverrides = useCallback(
    (s: Suggestion): Suggestion => {
      const o = overrides[s.key] ?? {};
      // Stamp canonicalKind from the suggestion so readers can classify
      // without re-running the heuristic. M5A: tag wins, heuristic fallback.
      const spec = { ...s.input.spec, canonicalKind: s.kindId };
      if (o.ownerTeam && o.ownerTeam.trim()) {
        spec.owner = { ...spec.owner, teams: [o.ownerTeam.trim()] };
      }
      if (o.tier && o.tier.trim()) {
        spec.tier = o.tier.trim();
      }
      if (o.target) {
        // Override is stored as the raw percentage string the user typed
        // (e.g. "99.9"); convert to the spec's decimal-fraction form here.
        // Storing the raw string avoids the React-controlled-input feedback
        // loop where dividing by 100 on every keystroke clobbers the
        // mid-edit value (e.g. typing "9" → store "0.09" → re-render the
        // field as 0.09, losing the user's input).
        const pct = Number(o.target);
        if (Number.isFinite(pct) && pct > 50 && pct < 100) {
          const t = pct / 100;
          spec.objectives = spec.objectives.map((obj, i) =>
            i === 0 ? { ...obj, target: t } : obj
          );
        }
      }
      if (o.latencyThreshold && spec.objectives[0]?.latencyThreshold !== undefined) {
        const lt = Number(o.latencyThreshold);
        if (Number.isFinite(lt) && lt > 0) {
          spec.objectives = spec.objectives.map((obj, i) =>
            i === 0 ? { ...obj, latencyThreshold: lt } : obj
          );
        }
      }
      return { ...s, input: { ...s.input, spec } };
    },
    [overrides]
  );

  const { isCreating, rowStatusMap, progress, runCreate } = useBatchCreate({
    apiClient,
    notifications,
    history,
  });

  const runCreateSelected = useCallback(() => {
    const picks = suggestions.filter((s) => selected.has(s.key)).map(applyOverrides);
    return runCreate(picks);
  }, [applyOverrides, runCreate, selected, suggestions]);

  const createSelected = useCallback(() => {
    // Already-open preview means the user has seen the full rule/SLI
    // picture; skip the second confirmation. Otherwise gate behind the
    // modal so accidental clicks don't provision dozens of rules.
    if (showPreview) {
      runCreateSelected();
    } else {
      setConfirmOpen(true);
    }
  }, [runCreateSelected, showPreview]);

  // Memoize the override-decorated list. Without this, every parent render
  // creates a fresh array identity, busting every downstream `useMemo` whose
  // deps include it (uniqueServices, serviceRows, …). The result was a render
  // loop where typing in a draft override re-derived the entire row tree on
  // every keystroke for ~38 drafts.
  const decoratedSuggestions = useMemo(() => suggestions.map(applyOverrides), [
    suggestions,
    applyOverrides,
  ]);
  const selectedCount = decoratedSuggestions.filter((s) => selected.has(s.key)).length;
  const totalRules = decoratedSuggestions
    .filter((s) => selected.has(s.key))
    .reduce((acc, s) => acc + s.estimatedRuleCount, 0);
  const coveredCount = decoratedSuggestions.filter((s) => s.existingRuleMatch).length;
  // The service list comes from APM discovery but an OTel-only service (one
  // that emits direct metrics without span-derived RED) can still surface a
  // draft. Union both sources so every service that owns drafts gets a row.
  const uniqueServices = useMemo(() => {
    const set = new Set<string>();
    for (const s of services ?? []) {
      if (s.serviceName) set.add(s.serviceName);
    }
    for (const s of decoratedSuggestions) {
      if (s.input.spec.service) set.add(s.input.spec.service);
    }
    return Array.from(set);
  }, [services, decoratedSuggestions]);

  const serviceRows: ServiceRowShape[] = useMemo(() => {
    return uniqueServices
      .map<ServiceRowShape>((serviceName) => {
        const drafts = decoratedSuggestions.filter((s) => s.input.spec.service === serviceName);
        const kinds: string[] = [];
        for (const d of drafts) {
          if (!kinds.includes(d.kind)) kinds.push(d.kind);
        }
        return {
          serviceName,
          environment: drafts[0]?.detected.environment,
          drafts,
          selectedCount: drafts.filter((s) => selected.has(s.key)).length,
          totalRules: drafts.reduce((acc, s) => acc + s.estimatedRuleCount, 0),
          coveredCount: drafts.filter((s) => s.existingRuleMatch).length,
          kinds,
        };
      })
      .filter((row) => row.drafts.length > 0);
  }, [uniqueServices, decoratedSuggestions, selected]);

  /** Re-seed expansion to "all expanded" whenever the set of services changes. */
  useEffect(() => {
    setExpandedMap((prev) => {
      const next: Record<string, boolean> = {};
      for (const row of serviceRows) {
        // Preserve any explicit collapse the user performed.
        next[row.serviceName] = prev[row.serviceName] ?? true;
      }
      return next;
    });
  }, [serviceRows]);

  const toggleExpand = useCallback((serviceName: string) => {
    setExpandedMap((prev) => ({ ...prev, [serviceName]: !prev[serviceName] }));
  }, []);

  const toggleServiceSelection = useCallback((row: ServiceRowShape) => {
    const allSelected = row.selectedCount === row.drafts.length;
    setSelected((prev) => {
      const next = new Set(prev);
      for (const d of row.drafts) {
        if (allSelected) next.delete(d.key);
        else next.add(d.key);
      }
      return next;
    });
  }, []);

  const loading = configLoading || servicesLoading || discoveryLoading;

  const headerActions = [
    <EuiButtonEmpty key="back" iconType="arrowLeft" href="#/slos" size="s">
      {i18n.translate('observability.apm.slo.suggest.backButton', {
        defaultMessage: 'Back to SLOs',
      })}
    </EuiButtonEmpty>,
    <EuiButton
      key="discover"
      size="s"
      iconType="refresh"
      onClick={() => {
        refetch();
        setDiscoveryEpoch((n) => n + 1);
      }}
      isLoading={loading}
      data-test-subj="slosSuggestDiscover"
    >
      {i18n.translate('observability.apm.slo.suggest.rediscoverButton', {
        defaultMessage: 'Rediscover',
      })}
    </EuiButton>,
    <EuiButton
      key="create"
      size="s"
      fill
      iconType="plusInCircle"
      color="primary"
      onClick={createSelected}
      isLoading={isCreating}
      isDisabled={selectedCount === 0 || loading}
      data-test-subj="slosSuggestCreate"
    >
      {i18n.translate('observability.apm.slo.suggest.createSelectedButton', {
        defaultMessage: 'Create {selectedCount} selected',
        values: { selectedCount },
      })}
    </EuiButton>,
  ];

  return (
    <EuiPage data-test-subj="slosSuggestPage">
      <EuiPageBody component="main">
        <HeaderControlledComponentsWrapper components={headerActions} />
        <EuiPageContent color="transparent" hasBorder={false} paddingSize="none">
          <EuiPageContentBody>
            {/* Intro — one-line summary; the verbose copy belongs in docs. */}
            <EuiText size="m">
              <h4>
                {i18n.translate('observability.apm.slo.suggest.heading', {
                  defaultMessage: 'Suggest SLOs from APM services',
                })}
              </h4>
            </EuiText>
            <EuiSpacer size="xs" />
            <EuiText size="xs" color="subdued">
              {i18n.translate('observability.apm.slo.suggest.subheading', {
                defaultMessage:
                  'Drafts availability + latency SLOs per service from span-derived RED metrics, plus OTel semconv add-ons where present.',
              })}
            </EuiText>
            {scope.services && !scopeFellThrough && (
              <>
                <EuiSpacer size="xs" />
                <EuiFlexGroup
                  alignItems="center"
                  gutterSize="s"
                  responsive={false}
                  data-test-subj="slosSuggestScopeSubline"
                >
                  <EuiFlexItem grow={false}>
                    <EuiText size="xs" color="subdued">
                      {i18n.translate('observability.apm.slo.suggest.scopeSubline', {
                        defaultMessage:
                          'Scoped to {count, plural, one {# service} other {# services}}: {names}',
                        values: {
                          count: scope.services.length,
                          names: scope.services.join(', '),
                        },
                      })}
                    </EuiText>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiButtonEmpty
                      size="xs"
                      onClick={() => history.push('#/slos/suggest')}
                      data-test-subj="slosSuggestClearScope"
                    >
                      {i18n.translate('observability.apm.slo.suggest.clearScope', {
                        defaultMessage: 'Clear scope',
                      })}
                    </EuiButtonEmpty>
                  </EuiFlexItem>
                </EuiFlexGroup>
              </>
            )}
            {scopeFellThrough && (
              <>
                <EuiSpacer size="s" />
                <EuiCallOut
                  size="s"
                  iconType="iInCircle"
                  color="warning"
                  title={i18n.translate('observability.apm.slo.suggest.scopeFellThrough.title', {
                    defaultMessage: 'Scoped services not found',
                  })}
                  data-test-subj="slosSuggestScopeFellThrough"
                >
                  <EuiText size="s">
                    {i18n.translate('observability.apm.slo.suggest.scopeFellThrough.body', {
                      defaultMessage:
                        "These services aren't in the current APM discovery result. Showing all discovered services instead.",
                    })}
                  </EuiText>
                  <EuiSpacer size="xs" />
                  <EuiButtonEmpty
                    size="xs"
                    onClick={() => history.push('#/slos/suggest')}
                    data-test-subj="slosSuggestClearScope"
                  >
                    {i18n.translate('observability.apm.slo.suggest.clearScope', {
                      defaultMessage: 'Clear scope',
                    })}
                  </EuiButtonEmpty>
                </EuiCallOut>
              </>
            )}
            <EuiSpacer size="m" />

            {servicesError && (
              <>
                <EuiCallOut
                  color="danger"
                  iconType="alert"
                  title={i18n.translate('observability.apm.slo.suggest.servicesErrorTitle', {
                    defaultMessage: 'Failed to load services',
                  })}
                  size="s"
                >
                  <EuiText size="s">{servicesError.message}</EuiText>
                </EuiCallOut>
                <EuiSpacer size="m" />
              </>
            )}

            {loading && (
              <EuiFlexGroup justifyContent="center" alignItems="center" style={{ minHeight: 200 }}>
                <EuiFlexItem grow={false}>
                  <EuiLoadingSpinner size="xl" />
                </EuiFlexItem>
              </EuiFlexGroup>
            )}

            {!loading && !datasourceId && (
              <EuiCallOut
                size="s"
                iconType="iInCircle"
                title={i18n.translate('observability.apm.slo.suggest.noDatasource.title', {
                  defaultMessage: 'No Prometheus datasource configured',
                })}
                color="warning"
              >
                <EuiText size="s">
                  {i18n.translate('observability.apm.slo.suggest.noDatasource.body', {
                    defaultMessage:
                      'Configure a Prometheus datasource under APM configuration before suggesting SLOs.',
                  })}
                </EuiText>
              </EuiCallOut>
            )}

            {!loading && datasourceId && uniqueServices.length === 0 && !servicesError && (
              <EuiCallOut
                size="s"
                iconType="iInCircle"
                title={i18n.translate('observability.apm.slo.suggest.noServices.title', {
                  defaultMessage: 'No APM services were discovered',
                })}
              >
                <EuiText size="s">
                  {i18n.translate('observability.apm.slo.suggest.noServices.body', {
                    defaultMessage:
                      'No services appear to be sending OTel traces right now. If you expect services here, verify the APM trace dataset and window duration under APM configuration.',
                  })}
                </EuiText>
              </EuiCallOut>
            )}

            {!loading && datasourceId && rulerFetchFailed && (
              <>
                <EuiCallOut
                  size="s"
                  iconType="alert"
                  color="warning"
                  title={i18n.translate('observability.apm.slo.suggest.rulerFetchFailed.title', {
                    defaultMessage: 'Could not verify existing recording rules',
                  })}
                  data-test-subj="slosSuggestRulerFetchFailed"
                >
                  <EuiText size="s">
                    {i18n.translate('observability.apm.slo.suggest.rulerFetchFailed.body', {
                      defaultMessage:
                        'The Prometheus ruler did not respond when this page tried to list its current recording groups. Suggestions and bulk-create still work, but duplicate recording groups may be created if rules already exist for these SLIs.',
                    })}
                  </EuiText>
                </EuiCallOut>
                <EuiSpacer size="m" />
              </>
            )}

            {!loading && decoratedSuggestions.length > 0 && (
              <>
                <EuiPanel paddingSize="m" hasBorder data-test-subj="slosSuggestHeaderStrip">
                  <EuiFlexGroup alignItems="center" responsive={false} gutterSize="l">
                    <EuiFlexItem grow={false}>
                      <EuiStat
                        title={`${selectedCount}`}
                        description={i18n.translate('observability.apm.slo.suggest.stat.ofSlos', {
                          defaultMessage: 'of {total} SLOs',
                          values: { total: decoratedSuggestions.length },
                        })}
                        titleSize="m"
                        reverse
                        data-test-subj="slosSuggestStatSlos"
                      />
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiStat
                        title={`${uniqueServices.length}`}
                        description={i18n.translate('observability.apm.slo.suggest.stat.services', {
                          defaultMessage: '{count, plural, one {service} other {services}}',
                          values: { count: uniqueServices.length },
                        })}
                        titleSize="m"
                        reverse
                        data-test-subj="slosSuggestStatServices"
                      />
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiStat
                        title={`${totalRules}`}
                        description={i18n.translate(
                          'observability.apm.slo.suggest.stat.rulesToProvision',
                          { defaultMessage: 'rules to provision' }
                        )}
                        titleSize="m"
                        titleColor="subdued"
                        reverse
                        data-test-subj="slosSuggestStatRules"
                      />
                    </EuiFlexItem>
                    <EuiFlexItem grow={true} />
                    <EuiFlexItem grow={false}>
                      <EuiFlexGroup gutterSize="s" responsive={false} alignItems="center">
                        <EuiFlexItem grow={false}>
                          <EuiButtonEmpty
                            size="s"
                            onClick={() =>
                              setSelected(new Set(decoratedSuggestions.map((s) => s.key)))
                            }
                          >
                            {i18n.translate('observability.apm.slo.suggest.selectAll', {
                              defaultMessage: 'Select all',
                            })}
                          </EuiButtonEmpty>
                        </EuiFlexItem>
                        <EuiFlexItem grow={false}>
                          <EuiButtonEmpty size="s" onClick={() => setSelected(new Set())}>
                            {i18n.translate('observability.apm.slo.suggest.clearSelection', {
                              defaultMessage: 'Clear',
                            })}
                          </EuiButtonEmpty>
                        </EuiFlexItem>
                        <EuiFlexItem grow={false}>
                          <EuiButton
                            size="s"
                            iconType={showPreview ? 'eyeClosed' : 'eye'}
                            onClick={() => setShowPreview((v) => !v)}
                            isDisabled={selectedCount === 0}
                            data-test-subj="slosSuggestPreviewToggle"
                          >
                            {showPreview
                              ? i18n.translate('observability.apm.slo.suggest.previewToggle.hide', {
                                  defaultMessage: 'Hide preview',
                                })
                              : i18n.translate('observability.apm.slo.suggest.previewToggle.show', {
                                  defaultMessage: 'Preview {selectedCount} selected',
                                  values: { selectedCount },
                                })}
                          </EuiButton>
                        </EuiFlexItem>
                      </EuiFlexGroup>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                </EuiPanel>
                <EuiSpacer size="xs" />
                <EuiText size="xs" color="subdued" data-test-subj="slosSuggestHeaderSubline">
                  {coveredCount > 0 ? (
                    <>
                      {i18n.translate('observability.apm.slo.suggest.headerSubline.covered', {
                        defaultMessage:
                          '{count, plural, one {# draft} other {# drafts}} already covered by existing rules · Namespace: ',
                        values: { count: coveredCount },
                      })}
                      <EuiCode>slo-generated</EuiCode>
                    </>
                  ) : (
                    <>
                      {i18n.translate(
                        'observability.apm.slo.suggest.headerSubline.namespacePrefix',
                        { defaultMessage: 'Namespace: ' }
                      )}
                      <EuiCode>slo-generated</EuiCode>
                    </>
                  )}
                </EuiText>
                <EuiSpacer size="m" />

                {progress && (
                  <>
                    <EuiPanel paddingSize="s" hasBorder data-test-subj="slosSuggestProgressStrip">
                      <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
                        <EuiFlexItem grow={false}>
                          <EuiText size="xs">
                            {i18n.translate('observability.apm.slo.suggest.progressPrefix', {
                              defaultMessage: 'Creating SLO {done}/{total} · ',
                              values: { done: progress.done, total: progress.total },
                            })}
                            <strong>{progress.failed}</strong>
                            {i18n.translate('observability.apm.slo.suggest.progressSuffix', {
                              defaultMessage: ' failed so far',
                            })}
                          </EuiText>
                        </EuiFlexItem>
                        <EuiFlexItem>
                          <EuiProgress
                            color={progress.failed > 0 ? 'warning' : 'primary'}
                            value={progress.done}
                            max={progress.total}
                            size="xs"
                          />
                        </EuiFlexItem>
                      </EuiFlexGroup>
                    </EuiPanel>
                    <EuiSpacer size="s" />
                  </>
                )}

                <ServiceTreeTable
                  serviceRows={serviceRows}
                  expandedMap={expandedMap}
                  onToggleExpand={toggleExpand}
                  onToggleServiceSelection={toggleServiceSelection}
                  selected={selected}
                  overrides={overrides}
                  onToggleDraft={toggle}
                  onOverrideChange={setOverride}
                  rowStatusMap={rowStatusMap}
                />
              </>
            )}
          </EuiPageContentBody>
        </EuiPageContent>
      </EuiPageBody>
      {/* Persistent right-dock flyout. `type="push"` reflows the page; the
          flyout is only rendered when the preview toggle is on AND there
          are selected drafts, so `selectedCount === 0` auto-closes it.
          Keystrokes in override fields don't flip `showPreview`, so the
          subtree — and SuggestBatchPreview's debounced effect — stays
          mounted across rapid edits. */}
      {showPreview && selectedCount > 0 && (
        <EuiFlyout
          onClose={() => setShowPreview(false)}
          ownFocus={false}
          type="push"
          size="m"
          side="right"
          pushMinBreakpoint="xs"
          data-test-subj="slosSuggestPreviewFlyout"
        >
          <EuiFlyoutHeader hasBorder data-test-subj="slosSuggestPreviewFlyoutHeader">
            <EuiTitle size="s">
              <h3>
                {i18n.translate('observability.apm.slo.suggest.flyoutTitle', {
                  defaultMessage: 'Rule preview · {count, plural, one {# SLO} other {# SLOs}}',
                  values: { count: selectedCount },
                })}
              </h3>
            </EuiTitle>
          </EuiFlyoutHeader>
          <EuiFlyoutBody>
            <SuggestBatchPreview
              apiClient={apiClient}
              selectedSuggestions={decoratedSuggestions.filter((s) => selected.has(s.key))}
              prometheusConnectionId={config?.prometheusDataSource?.name}
              prometheusConnectionMeta={config?.prometheusDataSource?.meta}
            />
          </EuiFlyoutBody>
        </EuiFlyout>
      )}
      {confirmOpen && (
        <EuiConfirmModal
          title={i18n.translate('observability.apm.slo.suggest.confirmModal.title', {
            defaultMessage: 'Create {count, plural, one {# SLO} other {# SLOs}}?',
            values: { count: selectedCount },
          })}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => {
            setConfirmOpen(false);
            runCreateSelected();
          }}
          cancelButtonText={i18n.translate('observability.apm.slo.suggest.confirmModal.cancel', {
            defaultMessage: 'Cancel',
          })}
          confirmButtonText={i18n.translate('observability.apm.slo.suggest.confirmModal.confirm', {
            defaultMessage: 'Create',
          })}
          defaultFocusedButton="confirm"
          data-test-subj="slosSuggestConfirmModal"
        >
          <EuiText size="s">
            <p>
              {i18n.translate('observability.apm.slo.suggest.confirmModal.bodyPrefix', {
                defaultMessage: 'This provisions ',
              })}
              <strong>{totalRules}</strong>
              {i18n.translate('observability.apm.slo.suggest.confirmModal.bodyMiddle', {
                defaultMessage: ' Prometheus rules in namespace ',
              })}
              <EuiCode>slo-generated</EuiCode>
              {i18n.translate('observability.apm.slo.suggest.confirmModal.bodySuffix', {
                defaultMessage:
                  '. Rules begin evaluating on the next ruler cycle; alerts do not fire until data accumulates.',
              })}
            </p>
          </EuiText>
        </EuiConfirmModal>
      )}
    </EuiPage>
  );
};

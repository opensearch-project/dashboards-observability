/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  EuiAccordion,
  EuiBadge,
  EuiBasicTable,
  EuiBasicTableColumn,
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiCodeBlock,
  EuiConfirmModal,
  EuiCopy,
  EuiDescriptionList,
  EuiDescriptionListProps,
  EuiEmptyPrompt,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHealth,
  EuiIcon,
  EuiLoadingSpinner,
  EuiPage,
  EuiPageBody,
  EuiPageContent,
  EuiPageContentBody,
  EuiPanel,
  EuiSpacer,
  EuiStat,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';
import { euiThemeVars } from '@osd/ui-shared-deps/theme';
import { i18n } from '@osd/i18n';
import { useHistory, useParams } from 'react-router-dom';
import { ChromeStart, NotificationsStart } from '../../../../../../../src/core/public';
import { HeaderControlledComponentsWrapper } from '../../../../plugin_helpers/plugin_headerControl';
import { TimeRangePicker } from '../../shared/components/time_filter';
import { TimeRange } from '../../common/types/service_types';
import { usePersistentTimeRange } from '../../shared/hooks/use_persistent_time_range';
import { SloVisualizations } from './slo_visualizations';
import { SloMetadataPanel } from './slo_metadata_panel';
import { SloAlertsPanel } from './slo_alerts_panel';
import type { RuleHealthResponse, SloApiClient, SloRuleHealthState } from './slo_api_client';
import type {
  Objective,
  SloDocument,
  SloHealthState,
  SloLiveStatus,
  SloSummary,
} from '../../../../../common/slo/slo_types';
import { getSloHealthColor, getSloHealthLabel } from '../../../../../common/slo/state';
import { formatPct, SLO_PRECISION, TABULAR_NUMS_STYLE } from '../../../../../common/slo/format';
import { templateIconFor } from './template_icons';
import { observabilityAlertingID } from '../../../../../common/constants/shared';
import { coreRefs } from '../../../../framework/core_refs';

export interface SloDetailPageProps {
  apiClient: SloApiClient;
  chrome: ChromeStart;
  notifications: NotificationsStart;
  parentBreadcrumb: { text: string; href: string };
}

type FullDoc = SloDocument & {
  liveStatus: SloLiveStatus;
  /**
   * Refcount per recording fingerprint. `{}` for non-dedup SLOs.
   */
  recordingFingerprintRefcounts?: Record<string, number>;
};

function describeWindow(slo: SloDocument): string {
  return slo.spec.window.type === 'rolling'
    ? i18n.translate('observability.apm.slo.detail.window.rolling', {
        defaultMessage: 'rolling {duration}',
        values: { duration: slo.spec.window.duration },
      })
    : i18n.translate('observability.apm.slo.detail.window.calendar', {
        defaultMessage: 'calendar ({period})',
        values: { period: slo.spec.window.period },
      });
}

/** Build the listing's SloSummary shape just far enough to drive templateIconFor. */
function iconSummaryFromDoc(doc: SloDocument): SloSummary {
  const sli = doc.spec.sli.type === 'single' ? doc.spec.sli : null;
  return {
    id: doc.id,
    datasourceId: doc.spec.datasourceId,
    datasourceType: sli?.definition.backend ?? 'prometheus',
    name: doc.spec.name,
    enabled: doc.spec.enabled,
    mode: doc.spec.mode,
    service: doc.spec.service,
    owner: doc.spec.owner,
    sliNodeType: doc.spec.sli.type,
    sliBackend: sli?.definition.backend,
    sliLeafType: sli?.definition.type,
    dimensions: sli?.dimensions,
    objectiveCount: doc.spec.objectives.length,
    worstTarget: doc.spec.objectives[0]?.target ?? 0,
    window: doc.spec.window,
    labels: doc.spec.labels,
    status: {} as SloLiveStatus,
  };
}

/**
 * Rule-health re-poll bounds (F-CRUD2). A freshly-created SLO's rule groups
 * take a little while to propagate through the Cortex/AMP ruler, during which
 * the health probe legitimately reports them as missing. Rather than alarm
 * immediately, we re-probe up to {@link RULE_HEALTH_MAX_RETRIES} times, one
 * every {@link RULE_HEALTH_RETRY_INTERVAL_MS}, and only escalate to the
 * destructive "rules missing" callout once those retries are exhausted. The
 * bound also guarantees the polling can't leak or run forever.
 */
export const RULE_HEALTH_MAX_RETRIES = 5;
export const RULE_HEALTH_RETRY_INTERVAL_MS = 5000;

/**
 * Detect an OSD `IHttpFetchError` that surfaced as a 404 — the SLO was deleted
 * or the deep link is stale. Mirrors the helper in `slo_health_summary.ts`
 * (kept local so this file stays self-contained). Routes to the "not found"
 * prompt instead of the generic load-error branch.
 */
export function isNotFoundError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const status = (err as { response?: { status?: number } }).response?.status;
  return status === 404;
}

/**
 * Fold the fresh rule-health probe and the persisted live-status flag into a
 * single callout mode. The probe wins whenever it reports a concrete state;
 * we fall back to the live-status flag so the callout still surfaces before
 * the first probe returns. Exported so the grace-window logic can be
 * unit-tested in isolation.
 */
export function deriveSloCalloutState(
  ruleHealthState: SloRuleHealthState | undefined,
  liveState: SloHealthState
): 'rules_missing' | 'rules_partial' | 'ruler_unreachable' | null {
  // A concrete probe result always wins — it's the fresh truth, and the
  // persisted `liveState` can lag server-side recomputation. In particular, a
  // freshly-created SLO whose rules have finished propagating reports a healthy
  // probe while `liveStatus.state` is still `rules_missing`; letting the probe
  // win there is exactly what prevents the false destructive callout (F-CRUD2).
  if (ruleHealthState !== undefined) {
    return ruleHealthState === 'rules_missing' ||
      ruleHealthState === 'rules_partial' ||
      ruleHealthState === 'ruler_unreachable'
      ? ruleHealthState
      : null;
  }
  // No probe result yet — fall back to the persisted flag so the callout still
  // surfaces before the first probe returns.
  return liveState === 'rules_missing' ? 'rules_missing' : null;
}

interface DetailHeaderProps {
  doc: FullDoc;
  primaryObjective: Objective;
  summaryListItems: NonNullable<EuiDescriptionListProps['listItems']>;
  sliListItems: NonNullable<EuiDescriptionListProps['listItems']>;
}

/**
 * Detail page header. Left edge: EuiHealth (colored dot + state label — VD4
 * safe). Middle: name + a compact metadata strip (template icon · SLI leaf
 * type · window). Right edge: EuiStat hero promoting attainment with a
 * target-delta subtitle (VD1 + VD15). Badges (Disabled / shadow) only render
 * when the SLO deviates from the majority defaults so operators aren't
 * distracted by "Enabled" on every page.
 *
 * Summary + SLI details nest inside a pre-collapsed accordion so the header
 * stays compact while keeping the descriptive config one click away — the
 * old right-hand sidebar is gone, letting charts + tables use the full width.
 */
const DetailHeader: React.FC<DetailHeaderProps> = ({
  doc,
  primaryObjective,
  summaryListItems,
  sliListItems,
}) => {
  const sli = doc.spec.sli.type === 'single' ? doc.spec.sli : null;
  const sliLeafType =
    sli?.definition.backend === 'prometheus' || sli?.definition.backend === 'opensearch'
      ? sli.definition.type
      : doc.spec.sli.type;
  const attainment =
    doc.liveStatus.objectives.find((o) => o.objectiveName === primaryObjective.name)?.attainment ??
    doc.liveStatus.objectives[0]?.attainment ??
    null;
  const healthColor = getSloHealthColor(doc.liveStatus.state);
  const healthLabel = getSloHealthLabel(doc.liveStatus.state);
  const targetLabel = formatPct(primaryObjective.target, { decimals: SLO_PRECISION.target });
  const attainmentLabel =
    attainment !== null ? formatPct(attainment, { decimals: SLO_PRECISION.attainment }) : '—';

  // Delta from target, in percentage points. Positive = above target (good);
  // negative = below. Only rendered when attainment is present — a null
  // attainment means the SLO isn't producing samples yet (no delta to show).
  const attainmentDelta = attainment !== null ? (attainment - primaryObjective.target) * 100 : null;
  const attainmentStatColor =
    attainment === null ? 'subdued' : attainment >= primaryObjective.target ? 'success' : 'danger';
  const deltaColor =
    attainmentDelta === null
      ? euiThemeVars.euiTextSubduedColor
      : attainmentDelta >= 0
        ? euiThemeVars.euiColorSuccessText
        : euiThemeVars.euiColorDangerText;
  const deltaSign = attainmentDelta !== null && attainmentDelta >= 0 ? '+' : '';

  return (
    <EuiPanel data-test-subj="slosDetailHeader">
      {/* `wrap` + responsive lets the health dot / title / hero stat stack at
          narrow widths instead of the title being squeezed to one glyph per
          line (CLAR14 / BUG-S1). The title item below carries `minWidth: 0`
          so it can shrink below its intrinsic content width and wrap on word
          boundaries rather than per character. */}
      <EuiFlexGroup alignItems="center" gutterSize="m" wrap>
        <EuiFlexItem grow={false}>
          <EuiHealth
            color={healthColor}
            data-test-subj="slosDetailHealthDot"
            aria-label={i18n.translate('observability.apm.slo.detail.healthAriaLabel', {
              defaultMessage: 'Health: {label}',
              values: { label: healthLabel },
            })}
          >
            <span style={{ fontWeight: 600 }}>{healthLabel}</span>
          </EuiHealth>
        </EuiFlexItem>
        <EuiFlexItem style={{ minWidth: 0 }}>
          <EuiText size="m">
            <h2
              style={{ marginBottom: 4, overflowWrap: 'break-word', wordBreak: 'break-word' }}
              data-test-subj="slosDetailTitle"
            >
              {doc.spec.name}
            </h2>
          </EuiText>
          <EuiFlexGroup
            alignItems="center"
            gutterSize="s"
            responsive={false}
            wrap
            data-test-subj="slosDetailMetaStrip"
          >
            {sliLeafType && (
              <EuiFlexItem grow={false}>
                <EuiText size="s" color="subdued">
                  <EuiIcon
                    type={templateIconFor(iconSummaryFromDoc(doc))}
                    size="s"
                    aria-hidden={true}
                  />{' '}
                  {sliLeafType}
                </EuiText>
              </EuiFlexItem>
            )}
            <EuiFlexItem grow={false}>
              <EuiText size="s" color="subdued">
                ·
              </EuiText>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiText size="s" color="subdued">
                {describeWindow(doc)}
              </EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
          {doc.spec.description && (
            <>
              <EuiSpacer size="xs" />
              <EuiText size="s" color="subdued">
                {doc.spec.description}
              </EuiText>
            </>
          )}
        </EuiFlexItem>
        {/* Only surface badges that deviate from the majority defaults (enabled
            + active). Mirrors the listing's majority-trait logic from d720b68a
            so operators aren't distracted by noise. */}
        {!doc.spec.enabled && (
          <EuiFlexItem grow={false}>
            <EuiBadge color="subdued" data-test-subj="slosDetailDisabledBadge">
              {i18n.translate('observability.apm.slo.detail.disabledBadge', {
                defaultMessage: 'Disabled',
              })}
            </EuiBadge>
          </EuiFlexItem>
        )}
        {doc.spec.mode === 'shadow' && (
          <EuiFlexItem grow={false}>
            <EuiBadge color="hollow" data-test-subj="slosDetailModeBadge">
              {i18n.translate('observability.apm.slo.detail.shadowBadge', {
                defaultMessage: 'shadow',
              })}
            </EuiBadge>
          </EuiFlexItem>
        )}
        <EuiFlexItem grow={false}>
          <div style={{ textAlign: 'right', minWidth: 140 }}>
            <EuiStat
              title={<span style={TABULAR_NUMS_STYLE}>{attainmentLabel}</span>}
              titleSize="l"
              titleColor={attainmentStatColor}
              description={i18n.translate('observability.apm.slo.detail.attainmentLabel', {
                defaultMessage: 'Attainment',
              })}
              reverse
              textAlign="right"
              data-test-subj="slosDetailAttainmentHero"
            />
            <EuiText
              size="xs"
              color="subdued"
              textAlign="right"
              data-test-subj="slosDetailAttainmentTargetDelta"
            >
              <span style={TABULAR_NUMS_STYLE}>
                {i18n.translate('observability.apm.slo.detail.targetLabel', {
                  defaultMessage: 'Target {targetLabel}',
                  values: { targetLabel },
                })}
              </span>
              {attainmentDelta !== null && (
                <>
                  {' · '}
                  <span style={{ ...TABULAR_NUMS_STYLE, color: deltaColor, fontWeight: 600 }}>
                    {deltaSign}
                    {attainmentDelta.toFixed(SLO_PRECISION.attainment)}{' '}
                    <EuiToolTip
                      content={i18n.translate(
                        'observability.apm.slo.detail.percentagePointsTooltip',
                        { defaultMessage: 'percentage points' }
                      )}
                    >
                      {/*
                        No native `title` here: the wrapping EuiToolTip already
                        provides the "percentage points" hover text, and a
                        `title` on the <abbr> too would render a second (native)
                        tooltip and translate the message twice.
                      */}
                      <abbr data-test-subj="slosDetailAttainmentDeltaUnit">
                        {i18n.translate('observability.apm.slo.detail.percentagePointsAbbr', {
                          defaultMessage: 'pp',
                        })}
                      </abbr>
                    </EuiToolTip>
                  </span>
                </>
              )}
            </EuiText>
          </div>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="s" />

      <EuiAccordion
        id="slosDetailSummary"
        buttonContent={
          <EuiText size="s">
            <strong>
              <EuiIcon type="iInCircle" size="s" aria-hidden={true} />{' '}
              {i18n.translate('observability.apm.slo.detail.summaryAccordion.label', {
                defaultMessage: 'Summary & SLI details',
              })}
            </strong>
          </EuiText>
        }
        data-test-subj="slosDetailSummaryAccordion"
        initialIsOpen={false}
        paddingSize="s"
      >
        <EuiFlexGroup gutterSize="l" wrap>
          <EuiFlexItem>
            <EuiText size="s">
              <strong>
                {i18n.translate('observability.apm.slo.detail.summaryHeading', {
                  defaultMessage: 'Summary',
                })}
              </strong>
            </EuiText>
            <EuiSpacer size="xs" />
            <EuiDescriptionList
              compressed
              type="column"
              listItems={summaryListItems}
              data-test-subj="slosDetailSummaryList"
            />
          </EuiFlexItem>
          {sliListItems.length > 0 && (
            <EuiFlexItem>
              <EuiText size="s">
                <strong>
                  {i18n.translate('observability.apm.slo.detail.sliHeading', {
                    defaultMessage: 'SLI',
                  })}
                </strong>
              </EuiText>
              <EuiSpacer size="xs" />
              <EuiDescriptionList
                compressed
                type="column"
                listItems={sliListItems}
                data-test-subj="slosDetailSliList"
              />
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
      </EuiAccordion>
    </EuiPanel>
  );
};

interface ObjectiveRow {
  name: string;
  displayName: string;
  target: number;
  threshold: string;
  alertsEnabled: string;
  rules: string;
}

const OBJECTIVE_COLUMNS: Array<EuiBasicTableColumn<ObjectiveRow>> = [
  {
    field: 'displayName',
    name: i18n.translate('observability.apm.slo.detail.objectivesColumn.name', {
      defaultMessage: 'Name',
    }),
    width: '30%',
  },
  {
    field: 'target',
    name: i18n.translate('observability.apm.slo.detail.objectivesColumn.target', {
      defaultMessage: 'Target',
    }),
    width: '15%',
    render: (t: number) => (
      <span style={TABULAR_NUMS_STYLE}>{formatPct(t, { decimals: SLO_PRECISION.target })}</span>
    ),
  },
  {
    field: 'threshold',
    name: i18n.translate('observability.apm.slo.detail.objectivesColumn.threshold', {
      defaultMessage: 'Threshold',
    }),
    width: '20%',
  },
  {
    field: 'alertsEnabled',
    name: i18n.translate('observability.apm.slo.detail.objectivesColumn.alertsEnabled', {
      defaultMessage: 'Alerts enabled',
    }),
    width: '20%',
  },
  {
    field: 'rules',
    name: i18n.translate('observability.apm.slo.detail.objectivesColumn.rules', {
      defaultMessage: 'Rules',
    }),
    width: '15%',
  },
];

function buildObjectiveRow(
  obj: Objective,
  doc: SloDocument,
  liveStatus: SloLiveStatus
): ObjectiveRow {
  const sli = doc.spec.sli.type === 'single' ? doc.spec.sli : null;
  const latencyUnit =
    sli?.definition.backend === 'prometheus' && sli.definition.type === 'latency_threshold'
      ? (sli.definition.latencyThresholdUnit ?? 'seconds')
      : 'seconds';
  const threshold =
    obj.latencyThreshold !== undefined
      ? `≤ ${obj.latencyThreshold}${latencyUnit === 'milliseconds' ? 'ms' : 's'}`
      : obj.thresholdBound
        ? `${obj.thresholdBound.operator} ${obj.thresholdBound.value}`
        : '—';

  // SloAlarmConfig is SLO-wide, not per-objective — so every row shows the
  // same boolean. That's the closest signal we have in the persisted spec
  // today; per-objective alerting toggles aren't modelled yet.
  const burnRates = doc.spec.alerting.strategy === 'mwmbr' ? doc.spec.alerting.burnRates : [];
  const anyBurnRateAlarm = burnRates.some((b) => b.createAlarm);
  const alarms = doc.spec.alarms;
  const anySupplemental =
    alarms.sliHealth.enabled ||
    alarms.attainmentBreach.enabled ||
    alarms.budgetWarning.enabled ||
    alarms.noData.enabled;
  const alertsEnabled =
    doc.spec.enabled && (anyBurnRateAlarm || anySupplemental)
      ? i18n.translate('observability.apm.slo.detail.alertsEnabled.yes', {
          defaultMessage: 'Yes',
        })
      : i18n.translate('observability.apm.slo.detail.alertsEnabled.no', {
          defaultMessage: 'No',
        });

  // Persisted rule names don't carry an objective tag we can filter on. Show
  // the live total only when there's a single objective (unambiguous); show
  // an em-dash otherwise so we don't misattribute counts.
  const rules = doc.spec.objectives.length === 1 ? String(liveStatus.ruleCount ?? 0) : '—';

  return {
    name: obj.name,
    displayName: obj.displayName ?? obj.name,
    target: obj.target,
    threshold,
    alertsEnabled,
    rules,
  };
}

export const SloDetailPage: React.FC<SloDetailPageProps> = ({
  apiClient,
  chrome,
  notifications,
  parentBreadcrumb: _parentBreadcrumb,
}) => {
  const { id } = useParams<{ id: string }>();
  const history = useHistory();
  const [doc, setDoc] = useState<FullDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  // A 404 (deleted SLO / stale deep link) is distinct from a generic load
  // failure: it routes to the friendly "SLO not found" prompt (CLAR16) instead
  // of the raw error branch. `apiClient.get` rejects on 404, so we must detect
  // it in the catch — the resolved-but-falsy path never happens in production.
  const [notFound, setNotFound] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Shared, persisted time range (sessionStorage) so the SLO detail picker
  // stays in sync with the rest of APM. Falls back to a 1h window — a more
  // useful default for burn-rate charts — when nothing is stored yet.
  const [timeRange, setTimeRange] = usePersistentTimeRange({ from: 'now-1h', to: 'now' });
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const advancedRef = useRef<HTMLDivElement | null>(null);
  const [ruleHealth, setRuleHealth] = useState<RuleHealthResponse | null>(null);
  const [ruleHealthLoading, setRuleHealthLoading] = useState(false);
  // Count of re-probes we've fired while rule health reads as missing/partial
  // (F-CRUD2). Bounded by RULE_HEALTH_MAX_RETRIES; drives both the polling
  // effect and the grace-window decision (soft "propagating" callout vs. the
  // destructive "missing" one).
  const [ruleHealthRetries, setRuleHealthRetries] = useState(0);

  const onRefresh = useCallback(() => {
    setRefreshTrigger((v) => v + 1);
  }, []);

  // `load` and `loadRuleHealth` accept an `isCurrent` flag so the effects
  // below can ignore stale resolutions on rapid id changes (navigating
  // SLO → SLO via the breadcrumb fires a new mount before the previous fetch
  // settles). User-initiated callers (toolbar refresh, repair, toggle-enable)
  // pass a `() => true` no-op gate.
  const ALWAYS_CURRENT = useCallback(() => true, []);

  const load = useCallback(
    async (isCurrent: () => boolean = ALWAYS_CURRENT) => {
      setLoading(true);
      setError(null);
      setNotFound(false);
      try {
        const result = await apiClient.get(id);
        if (!isCurrent()) return;
        setDoc(result);
      } catch (e) {
        if (!isCurrent()) return;
        // A 404 means the SLO doesn't exist — show the "not found" prompt
        // (CLAR16), not the raw error branch. Clear any stale doc so a
        // re-load that 404s doesn't keep rendering the previous SLO.
        if (isNotFoundError(e)) {
          setDoc(null);
          setNotFound(true);
          return;
        }
        const err = e instanceof Error ? e : new Error(String(e));
        setError(err);
      } finally {
        if (isCurrent()) setLoading(false);
      }
    },
    [ALWAYS_CURRENT, apiClient, id]
  );

  useEffect(() => {
    let cancelled = false;
    load(() => !cancelled);
    return () => {
      cancelled = true;
    };
  }, [load]);

  const loadRuleHealth = useCallback(
    async (
      isCurrent: () => boolean = ALWAYS_CURRENT,
      { silent = false }: { silent?: boolean } = {}
    ) => {
      setRuleHealthLoading(true);
      try {
        const result = await apiClient.getRuleHealth(id);
        if (!isCurrent()) return;
        setRuleHealth(result);
      } catch (e) {
        if (!isCurrent()) return;
        const err = e instanceof Error ? e : new Error(String(e));
        // Don't render the callout on fetch failure — fall back to the
        // live-status-derived state. Surface the fetch error as a neutral toast
        // so users have a breadcrumb — but only for the initial/manual probe.
        // The bounded re-poll (up to RULE_HEALTH_MAX_RETRIES) passes
        // `silent: true` so a flapping endpoint can't spew ~6 identical toasts
        // in the ~25s grace window.
        if (!silent) {
          notifications.toasts.addDanger({
            title: i18n.translate('observability.apm.slo.detail.ruleHealthLoadFailed', {
              defaultMessage: 'Could not load rule health',
            }),
            text: err.message,
          });
        }
        setRuleHealth(null);
      } finally {
        if (isCurrent()) setRuleHealthLoading(false);
      }
    },
    [ALWAYS_CURRENT, apiClient, id, notifications]
  );

  useEffect(() => {
    let cancelled = false;
    loadRuleHealth(() => !cancelled);
    return () => {
      cancelled = true;
    };
  }, [loadRuleHealth]);

  // Reset the retry budget whenever we navigate to a different SLO so the
  // grace window starts fresh (breadcrumb SLO → SLO navigation reuses the
  // component instance).
  useEffect(() => {
    setRuleHealthRetries(0);
  }, [id]);

  // Stale-write guard for the auto-poll below. Its re-probe resolves
  // asynchronously; if we've navigated to a different SLO or unmounted before
  // it lands, the result belongs to a stale id and must be dropped rather than
  // clobbering the current SLO's rule-health state. A retry-count increment is
  // NOT stale (`id` is unchanged then), so the guard keys on id + mount only —
  // never on the retry counter. The mount effect re-arms `mounted` on remount
  // so a StrictMode double-mount doesn't wedge it permanently false.
  const pollLiveIdRef = useRef(id);
  const pollMountedRef = useRef(true);
  useEffect(() => {
    pollLiveIdRef.current = id;
  }, [id]);
  useEffect(() => {
    pollMountedRef.current = true;
    return () => {
      pollMountedRef.current = false;
    };
  }, []);

  // While rule health reads as missing/partial, re-probe on a bounded
  // interval (F-CRUD2). A freshly-created SLO's rule groups take time to
  // propagate through the Cortex/AMP ruler, so a "missing" reading is
  // routinely transient right after create. Each probe that still comes back
  // missing schedules the next one until RULE_HEALTH_MAX_RETRIES is hit; once
  // health recovers we reset the budget so a later regression re-polls. The
  // timer is cleared on unmount and whenever the inputs change, so it can't
  // leak or poll forever.
  useEffect(() => {
    if (!doc) return undefined;
    // Keep re-probing while EITHER the live probe OR the persisted live-status
    // flag reads missing — deliberately NOT `deriveSloCalloutState`, which lets
    // a healthy probe win for the *callout* (so a fresh-create SLO never shows a
    // false destructive alarm). For *polling* we must be more eager: the
    // rule-health probe is cached server-side (~90s TTL), so right after a real
    // regression the first probe can still read a stale `ok` while the persisted
    // state already flipped to `rules_missing`. If we stopped polling on that
    // stale `ok`, we'd never re-check and the genuine "missing" callout would
    // never surface. Polling while `liveState` is missing lets a later probe
    // catch the fresh `rules_missing` and escalate; a genuinely-healthy probe
    // just runs the bounded budget out harmlessly without ever escalating.
    const probeState = ruleHealth?.state;
    const probeMissing =
      probeState === 'rules_missing' ||
      probeState === 'rules_partial' ||
      probeState === 'ruler_unreachable';
    const keepProbing = probeMissing || doc.liveStatus.state === 'rules_missing';
    if (!keepProbing) {
      if (ruleHealthRetries !== 0) setRuleHealthRetries(0);
      return undefined;
    }
    if (ruleHealthRetries >= RULE_HEALTH_MAX_RETRIES) return undefined;
    const scheduledId = id;
    const timer = setTimeout(() => {
      setRuleHealthRetries((n) => n + 1);
      // Gate the async re-probe so a response that arrives after navigating
      // away (or unmounting) is discarded instead of writing another SLO's
      // rule health onto this view. See pollLiveIdRef/pollMountedRef above.
      // `silent: true` — poll failures don't toast (see loadRuleHealth).
      loadRuleHealth(() => pollMountedRef.current && pollLiveIdRef.current === scheduledId, {
        silent: true,
      });
    }, RULE_HEALTH_RETRY_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [doc, ruleHealth, ruleHealthRetries, loadRuleHealth, id]);

  const onRepair = useCallback(async () => {
    try {
      const response = await apiClient.repair(id);
      if (response.repaired) {
        const restoredCount = response.health.expectedGroups.length;
        notifications.toasts.addSuccess({
          title: i18n.translate('observability.apm.slo.detail.restoreSuccess', {
            defaultMessage:
              '{restoredCount, plural, one {Restored # rule group} other {Restored # rule groups}}',
            values: { restoredCount },
          }),
        });
      } else {
        notifications.toasts.addInfo({
          title: i18n.translate('observability.apm.slo.detail.restoreNothingToDo', {
            defaultMessage: 'Rules are already present — nothing to restore',
          }),
        });
      }
      setRuleHealth(response.health);
      // Refresh the persisted doc too so liveStatus derived badges update.
      await load();
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      notifications.toasts.addDanger({
        title: i18n.translate('observability.apm.slo.detail.restoreFailed', {
          defaultMessage: 'Restore failed',
        }),
        text: err.message,
      });
    }
  }, [apiClient, id, load, notifications]);

  useEffect(() => {
    chrome.setBreadcrumbs([
      {
        text: i18n.translate('observability.apm.slo.detail.breadcrumb.slos', {
          defaultMessage: 'SLO/SLI',
        }),
        href: '#/slos',
      },
      { text: doc?.spec.name ?? id },
    ]);
  }, [chrome, doc, id]);

  const onDelete = useCallback(async () => {
    setConfirmDelete(false);
    try {
      await apiClient.delete(id);
      notifications.toasts.addSuccess({
        title: i18n.translate('observability.apm.slo.detail.deleteSuccess.title', {
          defaultMessage: 'SLO deleted',
        }),
        text: i18n.translate('observability.apm.slo.detail.deleteSuccess.text', {
          defaultMessage: 'Generated rules were removed.',
        }),
      });
      history.push('/slos');
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      notifications.toasts.addDanger({
        title: i18n.translate('observability.apm.slo.detail.deleteFailed', {
          defaultMessage: 'Delete failed',
        }),
        text: err.message,
      });
    }
  }, [apiClient, history, id, notifications]);

  const onToggleEnabled = useCallback(async () => {
    if (!doc) return;
    try {
      const updated = doc.spec.enabled ? await apiClient.disable(id) : await apiClient.enable(id);
      notifications.toasts.addSuccess({
        title: updated.spec.enabled
          ? i18n.translate('observability.apm.slo.detail.toggleEnabled', {
              defaultMessage: 'SLO enabled',
            })
          : i18n.translate('observability.apm.slo.detail.toggleDisabled', {
              defaultMessage: 'SLO disabled',
            }),
      });
      load();
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      notifications.toasts.addDanger({
        title: i18n.translate('observability.apm.slo.detail.toggleFailed', {
          defaultMessage: 'Toggle failed',
        }),
        text: err.message,
      });
    }
  }, [apiClient, doc, id, load, notifications]);

  // Expand + scroll the Advanced-details accordion into view. Invoked from the
  // MWMBR tier cards when they surface the "view generated rules" affordance.
  const handleViewRulesRequest = useCallback(() => {
    setAdvancedOpen(true);
    // Wait one frame so the accordion has re-rendered expanded before scrolling.
    requestAnimationFrame(() => {
      advancedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);

  if (loading) {
    return (
      <EuiPage>
        <EuiPageBody>
          <EuiFlexGroup justifyContent="center" alignItems="center" style={{ minHeight: '400px' }}>
            <EuiFlexItem grow={false}>
              <EuiLoadingSpinner size="xl" />
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiPageBody>
      </EuiPage>
    );
  }

  if (error) {
    return (
      <EuiPage>
        <EuiPageBody>
          <EuiPanel>
            <EuiEmptyPrompt
              iconType="alert"
              color="danger"
              title={
                <h2>
                  {i18n.translate('observability.apm.slo.detail.errorState.title', {
                    defaultMessage: 'Unable to load SLO',
                  })}
                </h2>
              }
              body={<p>{error.message}</p>}
              actions={
                <EuiButton onClick={() => load()}>
                  {i18n.translate('observability.apm.slo.detail.errorState.retry', {
                    defaultMessage: 'Retry',
                  })}
                </EuiButton>
              }
            />
          </EuiPanel>
        </EuiPageBody>
      </EuiPage>
    );
  }

  // Reached when the id resolved to nothing: either a 404 (deleted SLO / stale
  // deep link, flagged via `notFound`) or a resolved-but-empty body. Surface an
  // explicit "not found" state (CLAR16) rather than a blank page, distinct from
  // the fetch-error branch above. The loading guard upstream ensures a
  // still-resolving request never flashes this prompt.
  if (notFound || !doc) {
    return (
      <EuiPage>
        <EuiPageBody>
          <EuiPanel>
            <EuiEmptyPrompt
              iconType="search"
              data-test-subj="slosDetailNotFound"
              title={
                <h2>
                  {i18n.translate('observability.apm.slo.detail.notFound.title', {
                    defaultMessage: 'SLO not found',
                  })}
                </h2>
              }
              body={
                <p>
                  {i18n.translate('observability.apm.slo.detail.notFound.body', {
                    defaultMessage:
                      'We couldn\'t find an SLO with the id "{id}". It may have been deleted, or the link may be out of date.',
                    values: { id },
                  })}
                </p>
              }
              actions={
                <EuiButton
                  fill
                  iconType="arrowLeft"
                  onClick={() => history.push('/slos')}
                  data-test-subj="slosDetailNotFoundBack"
                >
                  {i18n.translate('observability.apm.slo.detail.notFound.backToList', {
                    defaultMessage: 'Back to SLOs',
                  })}
                </EuiButton>
              }
            />
          </EuiPanel>
        </EuiPageBody>
      </EuiPage>
    );
  }

  const sli = doc.spec.sli.type === 'single' ? doc.spec.sli : null;
  const primaryObjective = doc.spec.objectives[0];
  const objectiveRows = doc.spec.objectives.map((o) => buildObjectiveRow(o, doc, doc.liveStatus));
  const prov = doc.status.provisioning.backend === 'prometheus' ? doc.status.provisioning : null;

  // Derive the callout mode from whichever signal is strongest. The fresh
  // rule-health probe is preferred when available; fall back to the
  // persisted live-status flag so the callout still shows when the probe
  // hasn't returned yet.
  const derivedCalloutState = deriveSloCalloutState(ruleHealth?.state, doc.liveStatus.state);
  const rulesMissing =
    derivedCalloutState === 'rules_missing' || derivedCalloutState === 'rules_partial';
  // Grace window (F-CRUD2): until the bounded re-probes are exhausted, a
  // "missing" reading is treated as still-propagating and shown with a soft,
  // non-destructive callout. Only after the retries run out do we escalate to
  // the alarming "rules missing" callout with its Restore/Delete CTAs — so a
  // freshly-created SLO whose rules are simply mid-propagation never flashes a
  // scary false alarm.
  const ruleHealthRetriesExhausted = ruleHealthRetries >= RULE_HEALTH_MAX_RETRIES;
  const showRulesPropagating = rulesMissing && !ruleHealthRetriesExhausted;
  const showRulesMissingAlarm = rulesMissing && ruleHealthRetriesExhausted;

  // Recording-rule names from the persisted provisioning record. Dedup
  // shape: SLOs carry `recordingFingerprints` (objective name → fingerprint).
  // Expand each unique fingerprint into the 7 per-window rule names so the
  // listing still shows "what to pin external dashboards to".
  const dedupFingerprints = prov?.recordingFingerprints ?? null;
  const DEDUP_WINDOWS = ['5m', '30m', '1h', '2h', '6h', '1d', '3d'];
  const recordingRuleNames: string[] = dedupFingerprints
    ? [...new Set(Object.values(dedupFingerprints))].flatMap((fp) =>
        DEDUP_WINDOWS.map((w) => `slo:sli_error:ratio_rate_${w}:sli_${fp}`)
      )
    : [];

  // "Shared with N other SLOs" pill. Refcount includes the current SLO's
  // own claim, so N others = max(refcount-1, 0). We pick the highest
  // other-count across fingerprints the SLO references; a single number
  // conveys the signal without listing per-fingerprint specifics. Falls
  // back to 0 when the server didn't return refcounts (legacy docs /
  // refstore not wired).
  const refcounts = doc.recordingFingerprintRefcounts ?? {};
  const sharedOtherCount = dedupFingerprints
    ? [...new Set(Object.values(dedupFingerprints))].reduce((max, fp) => {
        const count = refcounts[fp] ?? 0;
        const others = Math.max(0, count - 1);
        return others > max ? others : max;
      }, 0)
    : 0;

  const summaryListItems: NonNullable<EuiDescriptionListProps['listItems']> = [
    {
      title: i18n.translate('observability.apm.slo.detail.summary.id', { defaultMessage: 'ID' }),
      description: doc.id,
    },
    {
      title: i18n.translate('observability.apm.slo.detail.summary.datasource', {
        defaultMessage: 'Datasource',
      }),
      description: doc.spec.datasourceId,
    },
    {
      title: i18n.translate('observability.apm.slo.detail.summary.service', {
        defaultMessage: 'Service',
      }),
      description: doc.spec.service,
    },
    {
      title: i18n.translate('observability.apm.slo.detail.summary.ownerTeam', {
        defaultMessage: 'Owner team (primary)',
      }),
      description: doc.spec.owner.teams[0] ?? '—',
    },
    {
      title: i18n.translate('observability.apm.slo.detail.summary.tier', {
        defaultMessage: 'Tier',
      }),
      description: doc.spec.tier ?? '—',
    },
    {
      title: i18n.translate('observability.apm.slo.detail.summary.window', {
        defaultMessage: 'Window',
      }),
      description: describeWindow(doc),
    },
  ];

  const sliListItems: NonNullable<EuiDescriptionListProps['listItems']> =
    sli && sli.definition.backend === 'prometheus'
      ? [
          {
            title: i18n.translate('observability.apm.slo.detail.sli.backend', {
              defaultMessage: 'Backend',
            }),
            description: sli.definition.backend,
          },
          {
            title: i18n.translate('observability.apm.slo.detail.sli.type', {
              defaultMessage: 'Type',
            }),
            description: sli.definition.type,
          },
          {
            title: i18n.translate('observability.apm.slo.detail.sli.metric', {
              defaultMessage: 'Metric',
            }),
            description:
              sli.definition.metric ??
              i18n.translate('observability.apm.slo.detail.sli.metricCustom', {
                defaultMessage: 'custom',
              }),
          },
          {
            title: i18n.translate('observability.apm.slo.detail.sli.goodEventsFilter', {
              defaultMessage: 'Good events filter',
            }),
            description: sli.definition.goodEventsFilter ?? '—',
          },
          {
            title: i18n.translate('observability.apm.slo.detail.sli.dimensions', {
              defaultMessage: 'Dimensions',
            }),
            description: sli.dimensions.map((d) => `${d.name}=${d.value}`).join(', ') || '—',
          },
        ]
      : [];

  const headerActions = [
    <EuiButtonEmpty
      key="back"
      iconType="arrowLeft"
      href="#/slos"
      size="s"
      data-test-subj="slosBack"
    >
      {i18n.translate('observability.apm.slo.detail.backButton', {
        defaultMessage: 'Back to SLOs',
      })}
    </EuiButtonEmpty>,
    <TimeRangePicker
      key="time"
      timeRange={timeRange}
      onChange={setTimeRange}
      onRefresh={onRefresh}
      compressed
    />,
    <EuiButtonEmpty
      key="viewAlerts"
      size="s"
      iconType="popout"
      data-test-subj="slosDetailViewAlerts"
      onClick={() => {
        // Deep-link to Alert Manager's *Alerts* tab (the firing alerts view)
        // rather than the Rules definition list (OBS1). Operators arriving
        // from an SLO page overwhelmingly want to see what is firing right
        // now, not the rule definitions. The alarms page's
        // `parseAlarmsHashRoute` maps the `#/alerts` segment to the Alerts
        // tab and applies the `ds=<datasourceId>` param to the datasource
        // selection regardless of which tab is active — so the Alerts view
        // lands with this SLO's Prometheus datasource already selected.
        //
        // `q=slo_id:<id>` is carried through for the day the Alerts tab
        // honours the deep-link query the way the Rules tab already does
        // (today only MonitorsTable seeds its search from `deepLink.q`); it
        // is harmless until then. The recording-rule list on this page stays
        // informational — recording rules never surface in Alert Manager.
        const params = new URLSearchParams({
          q: `slo_id:${doc.id}`,
          ds: doc.spec.datasourceId,
        });
        coreRefs?.application?.navigateToApp(observabilityAlertingID, {
          path: `#/alerts?${params.toString()}`,
        });
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      }}
    >
      {i18n.translate('observability.apm.slo.detail.viewAlertsButton', {
        defaultMessage: 'View alerts',
      })}
    </EuiButtonEmpty>,
    <EuiButton
      key="edit"
      size="s"
      fill
      iconType="pencil"
      href={`#/slos/${encodeURIComponent(doc.id)}/edit`}
      data-test-subj="slosDetailEdit"
    >
      {i18n.translate('observability.apm.slo.detail.editButton', {
        defaultMessage: 'Edit',
      })}
    </EuiButton>,
    <EuiButton key="toggle" size="s" onClick={onToggleEnabled} data-test-subj="slosDetailToggle">
      {doc.spec.enabled
        ? i18n.translate('observability.apm.slo.detail.disableButton', {
            defaultMessage: 'Disable',
          })
        : i18n.translate('observability.apm.slo.detail.enableButton', {
            defaultMessage: 'Enable',
          })}
    </EuiButton>,
    <EuiButton
      key="delete"
      size="s"
      color="danger"
      onClick={() => setConfirmDelete(true)}
      data-test-subj="slosDetailDelete"
    >
      {i18n.translate('observability.apm.slo.detail.deleteButton', {
        defaultMessage: 'Delete',
      })}
    </EuiButton>,
  ];

  return (
    <EuiPage data-test-subj="sloDetailPage">
      <EuiPageBody component="main">
        <HeaderControlledComponentsWrapper components={headerActions} />
        <EuiPageContent color="transparent" hasBorder={false} paddingSize="none">
          <EuiPageContentBody>
            <DetailHeader
              doc={doc}
              primaryObjective={primaryObjective}
              summaryListItems={summaryListItems}
              sliListItems={sliListItems}
            />

            <EuiSpacer size="m" />

            {showRulesPropagating ? (
              <>
                <EuiCallOut
                  color="primary"
                  iconType="clock"
                  title={i18n.translate(
                    'observability.apm.slo.detail.rulesPropagatingCallout.title',
                    { defaultMessage: 'Setting up rule groups' }
                  )}
                  data-test-subj="slosDetailRulePropagatingCallout"
                >
                  <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
                    <EuiFlexItem grow={false}>
                      <EuiLoadingSpinner size="m" />
                    </EuiFlexItem>
                    <EuiFlexItem>
                      <p>
                        {i18n.translate(
                          'observability.apm.slo.detail.rulesPropagatingCallout.body',
                          {
                            defaultMessage:
                              "This SLO's rule groups are still propagating to the ruler. This is normal for a few moments after creating or editing an SLO — alerts and status will start updating once propagation finishes.",
                          }
                        )}
                      </p>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                  <EuiSpacer size="s" />
                  <EuiButtonEmpty
                    size="s"
                    iconType="refresh"
                    onClick={() => loadRuleHealth()}
                    isLoading={ruleHealthLoading}
                    data-test-subj="slosDetailRulePropagatingCheckNow"
                  >
                    {i18n.translate(
                      'observability.apm.slo.detail.rulesPropagatingCallout.checkNow',
                      {
                        defaultMessage: 'Check now',
                      }
                    )}
                  </EuiButtonEmpty>
                </EuiCallOut>
                <EuiSpacer size="m" />
              </>
            ) : showRulesMissingAlarm ? (
              <>
                <EuiCallOut
                  color="danger"
                  iconType="alert"
                  title={i18n.translate('observability.apm.slo.detail.rulesMissingCallout.title', {
                    defaultMessage: 'Rule groups missing in Cortex',
                  })}
                  data-test-subj="slosDetailRuleHealthCallout"
                >
                  <p>
                    {(() => {
                      const expected = ruleHealth?.expectedGroups.length ?? 0;
                      const missing =
                        ruleHealth?.missingGroups.length ??
                        (derivedCalloutState === 'rules_missing' ? expected : 0);
                      return i18n.translate(
                        'observability.apm.slo.detail.rulesMissingCallout.body',
                        {
                          defaultMessage:
                            "{missing} of {expected} expected rule groups for this SLO are not present in the ruler. Alerts and status updates will not fire until the rules are restored. You can restore them from this SLO's persisted spec, or delete the SLO if it is no longer needed.",
                          values: { missing, expected },
                        }
                      );
                    })()}
                  </p>
                  <EuiFlexGroup gutterSize="s" responsive={false}>
                    <EuiFlexItem grow={false}>
                      <EuiButton
                        size="s"
                        color="danger"
                        fill
                        onClick={onRepair}
                        data-test-subj="slosDetailRestore"
                        isLoading={ruleHealthLoading}
                      >
                        {i18n.translate('observability.apm.slo.detail.restoreButton', {
                          defaultMessage: 'Restore',
                        })}
                      </EuiButton>
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiButton
                        size="s"
                        color="danger"
                        onClick={() => setConfirmDelete(true)}
                        data-test-subj="slosDetailBrokenDelete"
                      >
                        {i18n.translate('observability.apm.slo.detail.brokenDeleteButton', {
                          defaultMessage: 'Delete',
                        })}
                      </EuiButton>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                </EuiCallOut>
                <EuiSpacer size="m" />
              </>
            ) : derivedCalloutState === 'ruler_unreachable' ? (
              <>
                <EuiCallOut
                  color="warning"
                  iconType="alert"
                  title={i18n.translate(
                    'observability.apm.slo.detail.rulerUnreachableCallout.title',
                    { defaultMessage: 'Ruler unreachable' }
                  )}
                  data-test-subj="slosDetailRuleHealthCallout"
                >
                  <p>
                    {i18n.translate('observability.apm.slo.detail.rulerUnreachableCallout.body', {
                      defaultMessage:
                        "Couldn't reach the Prometheus-compatible ruler ({code}). Rule health cannot be verified right now. Retry once the ruler is back.",
                      values: {
                        code: ruleHealth?.rulerErrorCode ?? 'RULER_UNREACHABLE',
                      },
                    })}
                  </p>
                  <EuiButton
                    size="s"
                    color="warning"
                    onClick={() => loadRuleHealth()}
                    data-test-subj="slosDetailRuleHealthRetry"
                    isLoading={ruleHealthLoading}
                  >
                    {i18n.translate('observability.apm.slo.detail.rulerUnreachableRetry', {
                      defaultMessage: 'Retry',
                    })}
                  </EuiButton>
                </EuiCallOut>
                <EuiSpacer size="m" />
              </>
            ) : null}

            {/* Full-width stack — Summary/SLI collapsed into the header's
                accordion, so charts, objectives, and advanced details each
                get the full page width. */}
            <SloVisualizations
              slo={doc}
              timeRange={timeRange}
              refreshTrigger={refreshTrigger}
              onViewRulesRequest={handleViewRulesRequest}
            />

            <EuiSpacer size="m" />

            <EuiPanel>
              <EuiText size="m">
                <h4>
                  {i18n.translate('observability.apm.slo.detail.objectivesHeading', {
                    defaultMessage: 'Objectives',
                  })}
                </h4>
              </EuiText>
              <EuiSpacer size="s" />
              <EuiBasicTable<ObjectiveRow>
                tableCaption={i18n.translate('observability.apm.slo.detail.objectivesCaption', {
                  defaultMessage: 'Objectives',
                })}
                items={objectiveRows}
                columns={OBJECTIVE_COLUMNS}
                compressed
                data-test-subj="slosDetailObjectivesTable"
              />
            </EuiPanel>

            <EuiSpacer size="m" />

            <SloAlertsPanel doc={doc} ruleHealth={ruleHealth} />

            <EuiSpacer size="m" />

            {/* Advanced details stays pre-collapsed at the bottom; the
                6-column burn-rate tiers table needs the full page width. */}
            <div ref={advancedRef}>
              <EuiPanel>
                <EuiAccordion
                  id="slosDetailAdvanced"
                  buttonContent={
                    <EuiText size="s">
                      <strong>
                        <EuiIcon type="advancedSettingsApp" size="s" aria-hidden={true} />{' '}
                        {i18n.translate('observability.apm.slo.detail.advancedAccordion.label', {
                          defaultMessage: 'Advanced details',
                        })}
                      </strong>
                    </EuiText>
                  }
                  data-test-subj="slosDetailAdvancedAccordion"
                  forceState={advancedOpen ? 'open' : 'closed'}
                  onToggle={(open) => setAdvancedOpen(open)}
                >
                  <EuiSpacer size="s" />
                  <EuiDescriptionList
                    compressed
                    type="column"
                    data-test-subj="slosDetailAdvancedOps"
                    listItems={[
                      {
                        title: i18n.translate(
                          'observability.apm.slo.detail.advancedOps.rulesProvisioned',
                          { defaultMessage: 'Rules provisioned' }
                        ),
                        description: `${doc.liveStatus.ruleCount ?? 0}${
                          doc.liveStatus.firingCount > 0
                            ? ` · ${i18n.translate(
                                'observability.apm.slo.detail.advancedOps.firingSuffix',
                                {
                                  defaultMessage: '{count} firing',
                                  values: { count: doc.liveStatus.firingCount },
                                }
                              )}`
                            : ''
                        }`,
                      },
                      {
                        title: i18n.translate(
                          'observability.apm.slo.detail.advancedOps.lastEvaluated',
                          { defaultMessage: 'Last evaluated' }
                        ),
                        description: doc.liveStatus.lastEvaluatedAt ?? '—',
                      },
                      {
                        title: i18n.translate(
                          'observability.apm.slo.detail.advancedOps.computedAt',
                          { defaultMessage: 'Computed at' }
                        ),
                        description: doc.liveStatus.computedAt,
                      },
                      {
                        title: i18n.translate('observability.apm.slo.detail.advancedOps.version', {
                          defaultMessage: 'Version',
                        }),
                        description: String(doc.status.version),
                      },
                      ...(prov
                        ? [
                            {
                              title: i18n.translate(
                                'observability.apm.slo.detail.advancedOps.alertGroup',
                                { defaultMessage: 'Alert group' }
                              ),
                              description: prov.alertGroupName || '—',
                            },
                            ...(dedupFingerprints
                              ? [
                                  {
                                    title: i18n.translate(
                                      'observability.apm.slo.detail.advancedOps.recordingGroups',
                                      { defaultMessage: 'Recording groups' }
                                    ),
                                    description: i18n.translate(
                                      'observability.apm.slo.detail.advancedOps.recordingGroupsValue',
                                      {
                                        defaultMessage: '{count} shared',
                                        values: {
                                          count: new Set(Object.values(dedupFingerprints)).size,
                                        },
                                      }
                                    ),
                                  },
                                ]
                              : []),
                            {
                              title: i18n.translate(
                                'observability.apm.slo.detail.advancedOps.rulerNamespace',
                                { defaultMessage: 'Ruler namespace' }
                              ),
                              description: prov.rulerNamespace,
                            },
                          ]
                        : []),
                    ]}
                  />

                  <EuiSpacer size="m" />

                  <SloMetadataPanel slo={doc} inline />

                  {recordingRuleNames.length > 0 && (
                    <>
                      <EuiSpacer size="m" />
                      <EuiAccordion
                        id="slosDetailRecordingRules"
                        buttonContent={
                          <EuiText size="s">
                            <strong>
                              <EuiIcon type="indexRuntime" size="s" aria-hidden={true} />{' '}
                              {i18n.translate(
                                'observability.apm.slo.detail.recordingRulesAccordion.label',
                                { defaultMessage: 'Recording rules' }
                              )}
                            </strong>
                          </EuiText>
                        }
                        data-test-subj="slosDetailRecordingRulesAccordion"
                        initialIsOpen={false}
                        paddingSize="s"
                      >
                        <EuiText size="s" color="subdued">
                          <p>
                            {i18n.translate(
                              'observability.apm.slo.detail.recordingRulesDescription',
                              {
                                defaultMessage:
                                  'Bind external dashboards or visualizations to these recording rule names to chart SLI error ratios.',
                              }
                            )}
                          </p>
                        </EuiText>
                        {sharedOtherCount > 0 && (
                          <>
                            <EuiSpacer size="s" />
                            <EuiBadge
                              color="hollow"
                              iconType="link"
                              data-test-subj="slosDetailSharedWithPill"
                              title={i18n.translate(
                                'observability.apm.slo.detail.sharedWithPill.title',
                                {
                                  defaultMessage:
                                    'These recording rules are also referenced by {count, plural, one {# other SLO} other {# other SLOs}} sharing the same SLI shape.',
                                  values: { count: sharedOtherCount },
                                }
                              )}
                            >
                              {i18n.translate('observability.apm.slo.detail.sharedWithPill.label', {
                                defaultMessage:
                                  'Shared with {count, plural, one {# other SLO} other {# other SLOs}}',
                                values: { count: sharedOtherCount },
                              })}
                            </EuiBadge>
                          </>
                        )}
                        <EuiSpacer size="s" />
                        {recordingRuleNames.map((ruleName, idx) => (
                          <EuiFlexGroup
                            key={ruleName}
                            gutterSize="s"
                            alignItems="center"
                            responsive={false}
                          >
                            <EuiFlexItem>
                              <EuiCodeBlock
                                language="text"
                                paddingSize="s"
                                fontSize="s"
                                isCopyable={false}
                                data-test-subj={`slosDetailRecordingRule-${idx}`}
                              >
                                {ruleName}
                              </EuiCodeBlock>
                            </EuiFlexItem>
                            <EuiFlexItem grow={false}>
                              <EuiCopy textToCopy={ruleName}>
                                {(copy) => (
                                  <EuiButtonEmpty
                                    size="s"
                                    iconType="copy"
                                    onClick={copy}
                                    data-test-subj={`slosDetailRecordingRuleCopy-${idx}`}
                                  >
                                    {i18n.translate(
                                      'observability.apm.slo.detail.recordingRuleCopy',
                                      { defaultMessage: 'Copy' }
                                    )}
                                  </EuiButtonEmpty>
                                )}
                              </EuiCopy>
                            </EuiFlexItem>
                          </EuiFlexGroup>
                        ))}
                      </EuiAccordion>
                    </>
                  )}
                </EuiAccordion>
              </EuiPanel>
            </div>
          </EuiPageContentBody>
        </EuiPageContent>

        {confirmDelete && (
          <EuiConfirmModal
            title={i18n.translate('observability.apm.slo.detail.confirmDelete.title', {
              defaultMessage: 'Delete SLO "{name}"?',
              values: { name: doc.spec.name },
            })}
            onCancel={() => setConfirmDelete(false)}
            onConfirm={onDelete}
            cancelButtonText={i18n.translate('observability.apm.slo.detail.confirmDelete.cancel', {
              defaultMessage: 'Cancel',
            })}
            confirmButtonText={i18n.translate(
              'observability.apm.slo.detail.confirmDelete.confirm',
              { defaultMessage: 'Delete' }
            )}
            buttonColor="danger"
            data-test-subj="slosDetailDeleteModal"
          >
            {dedupFingerprints ? (
              <>
                <p>
                  {i18n.translate('observability.apm.slo.detail.confirmDelete.dedupBody1Prefix', {
                    defaultMessage: 'The per-SLO alert group (',
                  })}
                  <code>{prov?.alertGroupName}</code>
                  {i18n.translate('observability.apm.slo.detail.confirmDelete.dedupBody1Suffix', {
                    defaultMessage:
                      ') is removed immediately. Shared recording rules are reference-counted: if no other SLO references the same SLI shape the recording group is queued for deletion, with a 24h grace period in case you re-create the SLO.',
                  })}
                </p>
                <p>
                  {i18n.translate('observability.apm.slo.detail.confirmDelete.dedupBody2', {
                    defaultMessage:
                      'External dashboards or visualizations pinned to these recording-rule names will keep working as long as at least one SLO still references them. This action cannot be undone.',
                  })}
                </p>
              </>
            ) : (
              <p>
                {i18n.translate('observability.apm.slo.detail.confirmDelete.simpleBody', {
                  defaultMessage:
                    'This tears down all generated Prometheus rules. The action cannot be undone.',
                })}
              </p>
            )}
          </EuiConfirmModal>
        )}
      </EuiPageBody>
    </EuiPage>
  );
};

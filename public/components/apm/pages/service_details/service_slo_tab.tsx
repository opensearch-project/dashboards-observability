/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Service Details → SLOs tab. The parent (`service_details.tsx`) owns the
 * `useServiceSloHealth` call and passes the bucket + loading/error/refetch
 * down as props, so the tab-label breach badge and the tab body share a
 * single SLO list() fetch per page mount. The tab intentionally does NOT
 * subscribe to the Service Details time picker — SLO state is evaluated
 * against each SLO's own rolling window.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  EuiAccordion,
  EuiBadge,
  EuiBasicTableColumn,
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiEmptyPrompt,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHealth,
  EuiInMemoryTable,
  EuiLink,
  EuiLoadingContent,
  EuiNotificationBadge,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import type { SloHealthState, SloSummary } from '../../../../../common/slo/slo_types';
import { formatPct, SLO_PRECISION, TABULAR_NUMS_STYLE } from '../../../../../common/slo/format';
import { getSloHealthColor } from '../../../../../common/slo/state';
import { SloHealthAccessError, SloHealthBucket } from '../slos/slo_health_summary';
import { ChipRow } from '../slos/slo_health_chip_row';
import { navigateToSloSuggest } from '../../shared/utils/navigation_utils';
import { coreRefs } from '../../../../framework/core_refs';
import { observabilityApmSloID } from '../../../../../common/constants/apm';
import type { TimeRange } from '../../common/types/service_details_types';

const ERROR_MESSAGE_TRUNCATE_LEN = 200;
const LOADING_GRACE_MS = 150;

export interface ServiceSloTabProps {
  serviceName: string;
  /**
   * Bucket for this service, sourced from the parent's `useServiceSloHealth`
   * call. Undefined while the hook is loading its initial response or when
   * the service has no summaries yet. Parent ownership (M5B) means Services
   * Details pages issue a single SLO list() — the tab-label breach badge
   * and the tab content share one fetch.
   */
  bucket: SloHealthBucket | undefined;
  isLoading: boolean;
  error: SloHealthAccessError | undefined;
  refetch: () => void;
  /**
   * Accepted for symmetry with the other service-details tabs
   * (ServiceOverview / ServiceOperations / ServiceDependencies). The hook is
   * deliberately not time-range-aware — each SLO evaluates against its own
   * rolling window — so this prop is intentionally unused inside the body.
   */
  timeRange?: TimeRange;
}

const t = {
  tabName: i18n.translate('observability.apm.serviceDetails.tabs.slos', {
    defaultMessage: 'SLOs',
  }),
  chipRowAria: (name: string) =>
    i18n.translate('observability.apm.serviceDetails.sloTab.chipRowAria', {
      defaultMessage: 'SLO health summary for {name}',
      values: { name },
    }),
  footnote: i18n.translate('observability.apm.serviceDetails.sloTab.footnote', {
    defaultMessage:
      "State is evaluated against each SLO's rolling window, independent of the page time range.",
  }),
  missingTitlePair: i18n.translate(
    'observability.apm.serviceDetails.sloTab.missingPair.titlePair',
    { defaultMessage: 'Canonical pair incomplete' }
  ),
  missingTitleAvailability: i18n.translate(
    'observability.apm.serviceDetails.sloTab.missingPair.titleAvailability',
    { defaultMessage: 'Availability SLO missing' }
  ),
  missingTitleLatency: i18n.translate(
    'observability.apm.serviceDetails.sloTab.missingPair.titleLatency',
    { defaultMessage: 'Latency SLO missing' }
  ),
  missingBody: i18n.translate('observability.apm.serviceDetails.sloTab.missingPair.body', {
    defaultMessage:
      'Tracking both availability and latency is the baseline for service-level reliability.',
  }),
  missingCta: i18n.translate('observability.apm.serviceDetails.sloTab.missingPair.cta', {
    defaultMessage: 'Suggest missing SLOs',
  }),
  emptyTitle: i18n.translate('observability.apm.serviceDetails.sloTab.empty.title', {
    defaultMessage: 'No SLOs tracked for this service',
  }),
  emptyBody: i18n.translate('observability.apm.serviceDetails.sloTab.empty.body', {
    defaultMessage:
      'Track reliability objectives for availability and latency so regressions trigger alerts before users notice.',
  }),
  emptyPrimary: i18n.translate('observability.apm.serviceDetails.sloTab.empty.primary', {
    defaultMessage: 'Suggest SLOs',
  }),
  emptySecondary: i18n.translate('observability.apm.serviceDetails.sloTab.empty.secondary', {
    defaultMessage: 'Create manually',
  }),
  errorTitle: i18n.translate('observability.apm.serviceDetails.sloTab.error.title', {
    defaultMessage: "Couldn't load SLOs",
  }),
  errorRetry: i18n.translate('observability.apm.serviceDetails.sloTab.error.retry', {
    defaultMessage: 'Retry',
  }),
  errorShowDetails: i18n.translate('observability.apm.serviceDetails.sloTab.error.showDetails', {
    defaultMessage: 'Show details',
  }),
  forbiddenTitle: i18n.translate('observability.apm.serviceDetails.sloTab.forbidden.title', {
    defaultMessage: "You don't have permission to view SLOs",
  }),
  forbiddenBody: i18n.translate('observability.apm.serviceDetails.sloTab.forbidden.body', {
    defaultMessage: 'Ask an admin to grant the slo-read role.',
  }),
  colName: i18n.translate('observability.apm.serviceDetails.sloTab.col.name', {
    defaultMessage: 'Name',
  }),
  colType: i18n.translate('observability.apm.serviceDetails.sloTab.col.type', {
    defaultMessage: 'Type',
  }),
  colState: i18n.translate('observability.apm.serviceDetails.sloTab.col.state', {
    defaultMessage: 'State',
  }),
  colTarget: i18n.translate('observability.apm.serviceDetails.sloTab.col.target', {
    defaultMessage: 'Target',
  }),
  colCurrent: i18n.translate('observability.apm.serviceDetails.sloTab.col.current', {
    defaultMessage: 'Current',
  }),
  colWindow: i18n.translate('observability.apm.serviceDetails.sloTab.col.window', {
    defaultMessage: 'Window',
  }),
  colActions: i18n.translate('observability.apm.serviceDetails.sloTab.col.actions', {
    defaultMessage: 'Actions',
  }),
  actionView: i18n.translate('observability.apm.serviceDetails.sloTab.action.view', {
    defaultMessage: 'View',
  }),
  currentAwaitingData: i18n.translate(
    'observability.apm.serviceDetails.sloTab.current.awaitingData',
    { defaultMessage: 'Awaiting data' }
  ),
  currentSourceIdle: i18n.translate('observability.apm.serviceDetails.sloTab.current.sourceIdle', {
    defaultMessage: 'Source idle',
  }),
  currentStale: i18n.translate('observability.apm.serviceDetails.sloTab.current.stale', {
    defaultMessage: 'Stale',
  }),
  currentDisabled: i18n.translate('observability.apm.serviceDetails.sloTab.current.disabled', {
    defaultMessage: 'Disabled',
  }),
  currentRulesMissing: i18n.translate(
    'observability.apm.serviceDetails.sloTab.current.rulesMissing',
    { defaultMessage: 'Rules missing' }
  ),
  stateLabel: (state: SloHealthState): string => {
    const labels: Record<SloHealthState, string> = {
      breached: i18n.translate('observability.apm.serviceDetails.sloTab.state.breached', {
        defaultMessage: 'Breached',
      }),
      warning: i18n.translate('observability.apm.serviceDetails.sloTab.state.warning', {
        defaultMessage: 'Warning',
      }),
      ok: i18n.translate('observability.apm.serviceDetails.sloTab.state.ok', {
        defaultMessage: 'Healthy',
      }),
      no_data: i18n.translate('observability.apm.serviceDetails.sloTab.state.noData', {
        defaultMessage: 'No data',
      }),
      source_idle: i18n.translate('observability.apm.serviceDetails.sloTab.state.sourceIdle', {
        defaultMessage: 'Source idle',
      }),
      stale: i18n.translate('observability.apm.serviceDetails.sloTab.state.stale', {
        defaultMessage: 'Stale',
      }),
      disabled: i18n.translate('observability.apm.serviceDetails.sloTab.state.disabled', {
        defaultMessage: 'Disabled',
      }),
      rules_missing: i18n.translate('observability.apm.serviceDetails.sloTab.state.rulesMissing', {
        defaultMessage: 'Rules missing',
      }),
    };
    return labels[state];
  },
};

function missingPairTitle(bucket: SloHealthBucket): string {
  if (!bucket.hasAvailability && !bucket.hasLatency) return t.missingTitlePair;
  if (!bucket.hasAvailability) return t.missingTitleAvailability;
  return t.missingTitleLatency;
}

function truncate(message: string, max: number): string {
  if (message.length <= max) return message;
  return `${message.slice(0, max)}…`;
}

/**
 * Defer the loading-state skeleton until the fetch has taken >150ms — matches
 * the Services Home header panel so cache hits don't flash a skeleton.
 */
function useDelayedLoading(isLoading: boolean, delayMs = LOADING_GRACE_MS): boolean {
  const [delayed, setDelayed] = useState(false);
  useEffect(() => {
    if (!isLoading) {
      setDelayed(false);
      return;
    }
    const timer = window.setTimeout(() => setDelayed(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [isLoading, delayMs]);
  return delayed;
}

// ---------------------------------------------------------------------------
// SLO type label derived from the listing projection
// ---------------------------------------------------------------------------

function sloTypeLabel(slo: SloSummary): string {
  if (slo.sliNodeType === 'composite') return 'Composite';
  const backend = slo.sliBackend ?? 'unknown';
  const leaf = slo.sliLeafType ?? 'unknown';
  return `${backend}/${leaf}`;
}

function windowLabel(slo: SloSummary): string {
  if (slo.window.type === 'rolling') return `Rolling ${slo.window.duration}`;
  return `Calendar ${slo.window.period}`;
}

// Pick the worst objective for the "Current" column so the table value agrees
// with the state chip.
function worstObjectiveCurrent(slo: SloSummary): string {
  const objectives = slo.status.objectives;
  if (!objectives || objectives.length === 0) return '—';
  const worst = objectives.reduce((acc, o) =>
    o.errorBudgetRemaining < acc.errorBudgetRemaining ? o : acc
  );
  if (worst.currentValueUnit === 'ratio') {
    return formatPct(Math.max(0, worst.currentValue), { decimals: SLO_PRECISION.attainment });
  }
  if (worst.currentValueUnit === 'seconds') {
    return `${worst.currentValue.toFixed(3)}s`;
  }
  return String(worst.currentValue);
}

function worstTargetLabel(slo: SloSummary): string {
  return formatPct(slo.worstTarget, { decimals: SLO_PRECISION.target });
}

// States where the SLO isn't producing a meaningful "current" value. Rendering
// the literal `0.00%` / `0.000s` for these would be indistinguishable from a
// real zero reading; callers surface an "Awaiting data" / "Stale" / "Disabled"
// badge instead.
function currentPlaceholderLabel(state: SloHealthState): string | null {
  if (state === 'no_data') return t.currentAwaitingData;
  if (state === 'source_idle') return t.currentSourceIdle;
  if (state === 'stale') return t.currentStale;
  if (state === 'disabled') return t.currentDisabled;
  if (state === 'rules_missing') return t.currentRulesMissing;
  return null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const ServiceSloTab: React.FC<ServiceSloTabProps> = ({
  serviceName,
  bucket,
  isLoading,
  error: accessError,
  refetch,
}) => {
  const showSkeleton = useDelayedLoading(isLoading);
  const total = bucket?.total ?? 0;
  const isFirstLoad = isLoading && total === 0 && !accessError;

  const onSuggest = useCallback(() => {
    navigateToSloSuggest([serviceName]);
  }, [serviceName]);

  const onCreateManually = useCallback(() => {
    coreRefs?.application?.navigateToApp(observabilityApmSloID, { path: '#/slos/create' });
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }, []);

  const columns = useMemo<Array<EuiBasicTableColumn<SloSummary>>>(
    () => [
      {
        name: t.colName,
        render: (row: SloSummary) => (
          <EuiLink
            onClick={() => {
              coreRefs?.application?.navigateToApp(observabilityApmSloID, {
                path: `#/slos/${encodeURIComponent(row.id)}`,
              });
              window.dispatchEvent(new HashChangeEvent('hashchange'));
            }}
            data-test-subj={`serviceSloTabRowName-${row.id}`}
          >
            <EuiText size="s">
              <strong>{row.name}</strong>
            </EuiText>
          </EuiLink>
        ),
      },
      {
        name: t.colType,
        render: (row: SloSummary) => <EuiText size="s">{sloTypeLabel(row)}</EuiText>,
      },
      {
        name: t.colState,
        render: (row: SloSummary) => (
          <EuiHealth color={getSloHealthColor(row.status.state)}>
            {t.stateLabel(row.status.state)}
          </EuiHealth>
        ),
      },
      {
        name: t.colTarget,
        render: (row: SloSummary) => (
          <EuiText size="s">
            <span style={TABULAR_NUMS_STYLE}>{worstTargetLabel(row)}</span>
          </EuiText>
        ),
      },
      {
        name: t.colCurrent,
        render: (row: SloSummary) => {
          const placeholder = currentPlaceholderLabel(row.status.state);
          if (placeholder !== null) {
            return (
              <EuiBadge
                color="hollow"
                iconType="questionInCircle"
                data-test-subj={`serviceSloTabCurrentPlaceholder-${row.id}`}
              >
                {placeholder}
              </EuiBadge>
            );
          }
          return (
            <EuiText size="s">
              <span style={TABULAR_NUMS_STYLE}>{worstObjectiveCurrent(row)}</span>
            </EuiText>
          );
        },
      },
      {
        name: t.colWindow,
        render: (row: SloSummary) => <EuiText size="s">{windowLabel(row)}</EuiText>,
      },
      {
        name: t.colActions,
        render: (row: SloSummary) => (
          <EuiButtonEmpty
            size="xs"
            onClick={() => {
              coreRefs?.application?.navigateToApp(observabilityApmSloID, {
                path: `#/slos/${encodeURIComponent(row.id)}`,
              });
              window.dispatchEvent(new HashChangeEvent('hashchange'));
            }}
            data-test-subj={`serviceSloTabRowAction-${row.id}`}
          >
            {t.actionView}
          </EuiButtonEmpty>
        ),
      },
    ],
    []
  );

  // ---------------- Forbidden ----------------
  if (accessError?.kind === 'forbidden') {
    return (
      <EuiPanel hasBorder paddingSize="m" data-test-subj="serviceSloTab">
        <EuiCallOut
          color="warning"
          iconType="lock"
          title={t.forbiddenTitle}
          data-test-subj="serviceSloTabForbiddenCallout"
        >
          <p>{t.forbiddenBody}</p>
        </EuiCallOut>
      </EuiPanel>
    );
  }

  // ---------------- Error ----------------
  if (accessError?.kind === 'generic') {
    const full = accessError.message ?? '';
    const short = truncate(full, ERROR_MESSAGE_TRUNCATE_LEN);
    const needsDetails = full.length > ERROR_MESSAGE_TRUNCATE_LEN;
    return (
      <EuiPanel hasBorder paddingSize="m" data-test-subj="serviceSloTab">
        <EuiCallOut
          color="danger"
          iconType="alert"
          title={t.errorTitle}
          data-test-subj="serviceSloTabErrorCallout"
        >
          <p>{short}</p>
          {needsDetails ? (
            <EuiAccordion
              id="serviceSloTabErrorAccordion"
              buttonContent={t.errorShowDetails}
              paddingSize="s"
            >
              <EuiText size="s">
                <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{full}</pre>
              </EuiText>
            </EuiAccordion>
          ) : null}
          <EuiSpacer size="s" />
          <EuiButton size="s" onClick={refetch} data-test-subj="serviceSloTabErrorRetry">
            {t.errorRetry}
          </EuiButton>
        </EuiCallOut>
      </EuiPanel>
    );
  }

  // ---------------- Empty (no SLOs for this service) ----------------
  if (!isLoading && total === 0) {
    return (
      <EuiPanel hasBorder paddingSize="m" data-test-subj="serviceSloTab">
        <EuiEmptyPrompt
          iconType="visGauge"
          title={<h2>{t.emptyTitle}</h2>}
          body={<p>{t.emptyBody}</p>}
          data-test-subj="serviceSloTabEmptyPrompt"
          actions={[
            <EuiButton
              fill
              iconType="wand"
              onClick={onSuggest}
              key="suggest"
              data-test-subj="serviceSloTabEmptyPromptPrimary"
            >
              {t.emptyPrimary}
            </EuiButton>,
            <EuiButtonEmpty
              onClick={onCreateManually}
              key="create"
              data-test-subj="serviceSloTabEmptyPromptSecondary"
            >
              {t.emptySecondary}
            </EuiButtonEmpty>,
          ]}
        />
      </EuiPanel>
    );
  }

  // ---------------- Populated (possibly during a refresh) ----------------
  const items = bucket?.slos ?? [];
  // Suppress "missing" verdict while loading — never call a service "missing"
  // based on incomplete data.
  const showMissingCallout =
    !isLoading && bucket != null && bucket.missingCanonicalPair && total > 0;

  return (
    <EuiPanel hasBorder paddingSize="m" data-test-subj="serviceSloTab">
      {/* State row */}
      <div
        role="group"
        aria-label={t.chipRowAria(serviceName)}
        data-test-subj="serviceSloTabChipRow"
      >
        {isFirstLoad ? (
          showSkeleton ? (
            <EuiLoadingContent lines={1} data-test-subj="serviceSloTabLoading" />
          ) : (
            <div style={{ height: 20 }} />
          )
        ) : bucket ? (
          <ChipRow aggregate={bucket} />
        ) : null}
      </div>

      {showMissingCallout ? (
        <>
          <EuiSpacer size="m" />
          <EuiCallOut
            color="warning"
            iconType="alert"
            size="s"
            title={missingPairTitle(bucket!)}
            data-test-subj="serviceSloTabMissingPairCallout"
          >
            <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
              <EuiFlexItem grow={true}>
                <EuiText size="s">
                  <p>{t.missingBody}</p>
                </EuiText>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButton
                  size="s"
                  iconType="wand"
                  onClick={onSuggest}
                  data-test-subj="serviceSloTabMissingPairCta"
                >
                  {t.missingCta}
                </EuiButton>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiCallOut>
        </>
      ) : null}

      <EuiSpacer size="m" />

      <EuiInMemoryTable<SloSummary>
        items={items}
        columns={columns}
        loading={isLoading}
        pagination={{ initialPageSize: 10, pageSizeOptions: [10, 25, 50] }}
        sorting={{ sort: { field: 'name', direction: 'asc' } }}
        data-test-subj="serviceSloTabTable"
      />

      <EuiSpacer size="xs" />
      <EuiText size="xs" color="subdued" data-test-subj="serviceSloTabFootnote">
        <p>{t.footnote}</p>
      </EuiText>
    </EuiPanel>
  );
};

// ---------------------------------------------------------------------------
// Tab-label helpers (consumed by service_details.tsx)
// ---------------------------------------------------------------------------

export const SERVICE_SLO_TAB_NAME = t.tabName;

interface SloTabLabelProps {
  breached: number;
}

/**
 * Tab label with optional breached-count notification badge. When the badge is
 * present, the visible tab text is aria-hidden and a screen-reader-only span
 * carries the count so the badge doesn't get announced twice.
 */
export const SloTabLabel: React.FC<SloTabLabelProps> = ({ breached }) => {
  if (breached <= 0) return <>{t.tabName}</>;
  const ariaLabel = i18n.translate('observability.apm.serviceDetails.sloTab.label.breachedAria', {
    defaultMessage: 'SLOs, {n, plural, one {# breached} other {# breached}}',
    values: { n: breached },
  });
  return (
    <>
      <span aria-label={ariaLabel}>{t.tabName}</span>
      <EuiToolTip
        content={i18n.translate('observability.apm.serviceDetails.sloTab.label.badgeTooltip', {
          defaultMessage:
            '{n, plural, one {# SLO is breached} other {# SLOs are breached}} for this service.',
          values: { n: breached },
        })}
      >
        <EuiNotificationBadge
          color="accent"
          data-test-subj="serviceDetailsTabSlosBadge"
          style={{ marginLeft: 4 }}
        >
          {breached}
        </EuiNotificationBadge>
      </EuiToolTip>
    </>
  );
};

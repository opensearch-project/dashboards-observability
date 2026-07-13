/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Services Home SLO presentation: the aggregate header panel and the per-row
 * "SLO health" cell. Both consume the same `useServiceSloHealth` rollup; the
 * data hook is owned by the caller so there is a single fetch per page.
 *
 * Note: we use `EuiLoadingContent` rather than `EuiSkeletonText` — the
 * bundled EUI fork exports the older name. Behavior is equivalent.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHealth,
  EuiIcon,
  EuiIconTip,
  EuiLink,
  EuiLoadingContent,
  EuiPanel,
  EuiPopover,
  EuiSelectable,
  EuiSpacer,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { navigateToSloListing, navigateToSloSuggest } from '../../shared/utils/navigation_utils';
import type { SloHealthAccessError, SloHealthBucket } from '../slos/slo_health_summary';
import { ChipRow } from '../slos/slo_health_chip_row';
import { buildServiceFilterOptions } from '../slos/service_filter_options';
import { SloBudgetSparkline } from './slo_budget_sparkline';
import './slo_health_panel.scss';

export interface SloHealthPanelProps {
  aggregate: SloHealthBucket;
  /** Keyed by serviceName. Used only to compute `missingPairServices`. */
  bySvc: Map<string, SloHealthBucket>;
  /** Services currently rendered in the table — drives "View all SLOs". */
  allServices: string[];
  isLoading: boolean;
  error: SloHealthAccessError | undefined;
  onRetry: () => void;
  /**
   * Prometheus datasource id the SLO rules live in. When present, the panel
   * renders a 7d aggregate-error-ratio sparkline below the chip row. Passed
   * in rather than re-derived so the panel stays framework-agnostic.
   */
  prometheusConnectionId?: string;
}

export interface SloHealthCellProps {
  serviceName: string;
  bucket: SloHealthBucket | undefined;
  isLoading: boolean;
  error: SloHealthAccessError | undefined;
}

// ============================================================================
// i18n
// ============================================================================

const t = {
  title: i18n.translate('observability.apm.services.sloHealth.title', {
    defaultMessage: 'SLO health',
  }),
  titleTip: i18n.translate('observability.apm.services.sloHealth.titleTip', {
    defaultMessage:
      "SLO state is evaluated against each SLO's own rolling window, independent of the time picker.",
  }),
  suggestCta: (count: number) =>
    i18n.translate('observability.apm.services.sloHealth.suggestCta', {
      defaultMessage: 'Suggest SLOs for {count, plural, one {# service} other {# services}}',
      values: { count },
    }),
  suggestPick: i18n.translate('observability.apm.services.sloHealth.suggestPick', {
    defaultMessage: 'Suggest SLOs',
  }),
  suggestPickPlaceholder: i18n.translate(
    'observability.apm.services.sloHealth.suggestPickPlaceholder',
    { defaultMessage: 'Filter services' }
  ),
  suggestPickCovered: i18n.translate('observability.apm.services.sloHealth.suggestPickCovered', {
    defaultMessage: 'covered',
  }),
  suggestPickEmpty: i18n.translate('observability.apm.services.sloHealth.suggestPickEmpty', {
    defaultMessage: 'No services to suggest SLOs for.',
  }),
  suggestPickClear: i18n.translate('observability.apm.services.sloHealth.suggestPickClear', {
    defaultMessage: 'Clear',
  }),
  suggestDisabledTip: i18n.translate('observability.apm.services.sloHealth.suggestDisabledTip', {
    defaultMessage: 'All services have an availability and latency SLO.',
  }),
  viewAll: i18n.translate('observability.apm.services.sloHealth.viewAll', {
    defaultMessage: 'View all SLOs',
  }),
  emptyStateCopy: i18n.translate('observability.apm.services.sloHealth.emptyStateCopy', {
    defaultMessage: 'No SLOs tracked for these services.',
  }),
  errorTitle: i18n.translate('observability.apm.services.sloHealth.errorTitle', {
    defaultMessage: 'Failed to load SLO health',
  }),
  retry: i18n.translate('observability.apm.services.sloHealth.retry', {
    defaultMessage: 'Retry',
  }),
  forbidden: i18n.translate('observability.apm.services.sloHealth.forbidden', {
    defaultMessage:
      'You do not have permission to view SLOs. Ask an admin for the observability SLO role.',
  }),
  forbiddenRow: i18n.translate('observability.apm.services.sloHealth.forbiddenRow', {
    defaultMessage: 'No permission',
  }),
  cellLoadError: i18n.translate('observability.apm.services.sloHealth.cellLoadError', {
    defaultMessage: 'Could not load SLO health for this service',
  }),
  suggestRow: i18n.translate('observability.apm.services.sloHealth.suggestRow', {
    defaultMessage: 'Suggest',
  }),
  columnHeader: i18n.translate('observability.apm.services.sloHealth.columnHeader', {
    defaultMessage: 'SLO health',
  }),
  columnHeaderTip: i18n.translate('observability.apm.services.sloHealth.columnHeaderTip', {
    defaultMessage: 'Rolled up across all SLOs for this service. Click to view.',
  }),
  missingLatency: i18n.translate('observability.apm.services.sloHealth.missingLatency', {
    defaultMessage: 'Missing latency SLO',
  }),
  missingAvailability: i18n.translate('observability.apm.services.sloHealth.missingAvailability', {
    defaultMessage: 'Missing availability SLO',
  }),
  missingCanonicalPair: i18n.translate(
    'observability.apm.services.sloHealth.missingCanonicalPair',
    { defaultMessage: 'Missing canonical pair' }
  ),
};

// ============================================================================
// Header panel
// ============================================================================

/**
 * Holds off on the skeleton until the fetch has been pending >150ms. Avoids
 * a visual flash on cache hits.
 */
function useDelayedLoading(isLoading: boolean, delayMs = 150): boolean {
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

/**
 * Dropdown picker for the SLO-suggest CTA. Lists every service in the table,
 * disabling the ones whose canonical availability+latency pair already exists
 * ("covered"). Nothing is checked on open — the user opts services in — and
 * confirming navigates to the Suggest SLOs page scoped to the picks.
 */
const SloSuggestPicker: React.FC<{
  allServices: string[];
  coveredSet: Set<string>;
  isLoading: boolean;
}> = ({ allServices, coveredSet, isLoading }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const options = useMemo(
    () =>
      // Shared builder: covered services disabled, checked services floated to
      // the top so the current selection stays visible as the list scrolls.
      buildServiceFilterOptions(allServices, picked, coveredSet).map((opt) => ({
        label: opt.label,
        checked: opt.checked,
        disabled: opt.disabled,
        append: opt.covered ? (
          <EuiText size="xs" color="success">
            {t.suggestPickCovered}
          </EuiText>
        ) : undefined,
      })),
    [allServices, coveredSet, picked]
  );

  const onChange = useCallback(
    (newOptions: Array<{ label: string; checked?: 'on'; disabled?: boolean }>) => {
      const next = new Set<string>();
      for (const o of newOptions) {
        if (o.checked === 'on' && !coveredSet.has(o.label)) next.add(o.label);
      }
      setPicked(next);
    },
    [coveredSet]
  );

  const onConfirm = useCallback(() => {
    if (picked.size === 0) return;
    setIsOpen(false);
    navigateToSloSuggest([...picked]);
  }, [picked]);

  const clearAll = useCallback(() => setPicked(new Set()), []);

  const allCovered = allServices.length > 0 && allServices.every((s) => coveredSet.has(s));

  return (
    <EuiPopover
      isOpen={isOpen}
      closePopover={() => setIsOpen(false)}
      panelPaddingSize="none"
      anchorPosition="downRight"
      button={
        <EuiToolTip content={allCovered && !isLoading ? t.suggestDisabledTip : undefined}>
          <EuiButton
            // Fill (primary) while closed to draw attention to opening it; once
            // open, drop to a neutral trigger so the footer's "Suggest SLOs for
            // N" button is the single primary action in view.
            fill={!isOpen}
            iconType="arrowDown"
            iconSide="right"
            size="s"
            isLoading={isLoading}
            isDisabled={!isLoading && allCovered}
            onClick={() => setIsOpen((prev) => !prev)}
            data-test-subj="sloHealthPanelCta"
          >
            {picked.size === 0 ? t.suggestPick : t.suggestCta(picked.size)}
          </EuiButton>
        </EuiToolTip>
      }
    >
      {allServices.length === 0 ? (
        <EuiText size="s" color="subdued" className="sloHealthPicker__empty">
          {t.suggestPickEmpty}
        </EuiText>
      ) : (
        <div className="sloHealthPicker__panel">
          <EuiSelectable
            searchable
            searchProps={{ compressed: true, placeholder: t.suggestPickPlaceholder }}
            options={options}
            onChange={onChange}
            listProps={{ bordered: false }}
            height={240}
          >
            {(list, search) => (
              <>
                <div className="sloHealthPicker__search">{search}</div>
                {list}
              </>
            )}
          </EuiSelectable>
          <EuiPanel color="transparent" paddingSize="s">
            <EuiFlexGroup gutterSize="s" responsive={false} alignItems="center">
              <EuiFlexItem grow={false}>
                <EuiButtonEmpty
                  size="s"
                  onClick={clearAll}
                  isDisabled={picked.size === 0}
                  data-test-subj="sloHealthPanelCtaClear"
                >
                  {t.suggestPickClear}
                </EuiButtonEmpty>
              </EuiFlexItem>
              <EuiFlexItem grow={true}>
                <EuiButton
                  fullWidth
                  size="s"
                  fill
                  onClick={onConfirm}
                  isDisabled={picked.size === 0}
                  data-test-subj="sloHealthPanelCtaConfirm"
                >
                  {picked.size === 0 ? t.suggestPick : t.suggestCta(picked.size)}
                </EuiButton>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiPanel>
        </div>
      )}
    </EuiPopover>
  );
};

export const SloHealthPanel: React.FC<SloHealthPanelProps> = ({
  aggregate,
  bySvc,
  allServices,
  isLoading,
  error,
  onRetry,
  prometheusConnectionId,
}) => {
  const showSkeleton = useDelayedLoading(isLoading);

  // Services whose canonical availability+latency pair already exists. These
  // are shown but disabled in the picker so the user can't request duplicate
  // suggestions. A service missing from `bySvc` isn't known to be covered, so
  // it stays enabled (pickable).
  const coveredSet = useMemo(() => {
    const set = new Set<string>();
    for (const name of allServices) {
      const bucket = bySvc.get(name);
      if (bucket && !bucket.missingCanonicalPair) set.add(name);
    }
    return set;
  }, [allServices, bySvc]);

  const onClickViewAll = useCallback(() => {
    navigateToSloListing(allServices);
  }, [allServices]);

  if (error?.kind === 'forbidden') {
    return (
      <>
        <EuiPanel hasBorder paddingSize="m" data-test-subj="sloHealthPanel">
          <EuiCallOut
            announceOnMount
            size="s"
            color="warning"
            iconType="lock"
            title={t.forbidden}
            data-test-subj="sloHealthPanelForbidden"
          />
        </EuiPanel>
        <EuiSpacer size="s" />
      </>
    );
  }

  return (
    <>
      <EuiPanel hasBorder paddingSize="m" data-test-subj="sloHealthPanel">
        <EuiFlexGroup justifyContent="spaceBetween" alignItems="center" responsive={false}>
          <EuiFlexItem grow={true}>
            <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiText size="s">
                  <strong>{t.title}</strong>
                </EuiText>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiIconTip type="iInCircle" size="s" color="subdued" content={t.titleTip} />
              </EuiFlexItem>
              <EuiFlexItem grow={true}>
                {error ? (
                  <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
                    <EuiFlexItem grow={false}>
                      <EuiText size="s" color="danger" data-test-subj="sloHealthPanelError">
                        {t.errorTitle}
                      </EuiText>
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiLink onClick={onRetry} data-test-subj="sloHealthPanelRetry">
                        {t.retry}
                      </EuiLink>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                ) : isLoading ? (
                  showSkeleton ? (
                    <EuiLoadingContent lines={1} data-test-subj="sloHealthPanelSkeleton" />
                  ) : (
                    // Reserve vertical height so the panel doesn't reflow when
                    // the skeleton appears at t=150ms.
                    <div
                      className="sloHealthPanel__loadingPlaceholder"
                      data-test-subj="sloHealthPanelLoadingPlaceholder"
                    />
                  )
                ) : aggregate.total === 0 ? (
                  <EuiText size="s" color="subdued" data-test-subj="sloHealthPanelEmpty">
                    {t.emptyStateCopy}
                  </EuiText>
                ) : (
                  <ChipRow aggregate={aggregate} />
                )}
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>

          <EuiFlexItem grow={false}>
            <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
              {!error && (
                <EuiFlexItem grow={false}>
                  <SloSuggestPicker
                    allServices={allServices}
                    coveredSet={coveredSet}
                    isLoading={isLoading}
                  />
                </EuiFlexItem>
              )}
              <EuiFlexItem grow={false}>
                <EuiButtonEmpty
                  size="s"
                  onClick={onClickViewAll}
                  data-test-subj="sloHealthPanelViewAll"
                >
                  {t.viewAll}
                </EuiButtonEmpty>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
        {!error && aggregate.total > 0 && prometheusConnectionId ? (
          <>
            <EuiSpacer size="s" />
            <SloBudgetSparkline
              services={allServices}
              prometheusConnectionId={prometheusConnectionId}
            />
          </>
        ) : null}
      </EuiPanel>
      <EuiSpacer size="s" />
    </>
  );
};

// ============================================================================
// Per-row cell
// ============================================================================

type WorstStateKey = 'breached' | 'warning' | 'noData' | 'stale' | 'ok' | 'disabled';

interface WorstState {
  key: WorstStateKey;
  color: 'danger' | 'warning' | 'subdued' | 'success' | 'default';
  label: (n: number) => string;
  count: number;
}

/**
 * Pick the worst-severity state that has any occurrences in the bucket.
 * Order is: breached + rulesMissing (danger) → warning → noData → stale → ok
 * → disabled.
 */
function worstStateForBucket(b: SloHealthBucket): WorstState | null {
  const breached = b.breached + b.rulesMissing;
  if (breached > 0) {
    return {
      key: 'breached',
      color: 'danger',
      count: breached,
      label: (n) =>
        i18n.translate('observability.apm.services.sloHealth.cell.breached', {
          defaultMessage: '{n} breached',
          values: { n },
        }),
    };
  }
  if (b.warning > 0) {
    return {
      key: 'warning',
      color: 'warning',
      count: b.warning,
      label: (n) =>
        i18n.translate('observability.apm.services.sloHealth.cell.warning', {
          defaultMessage: '{n} warning',
          values: { n },
        }),
    };
  }
  if (b.noData > 0) {
    return {
      key: 'noData',
      color: 'subdued',
      count: b.noData,
      label: (n) =>
        i18n.translate('observability.apm.services.sloHealth.cell.noData', {
          defaultMessage: '{n} no data',
          values: { n },
        }),
    };
  }
  if (b.stale > 0) {
    return {
      key: 'stale',
      color: 'subdued',
      count: b.stale,
      label: (n) =>
        i18n.translate('observability.apm.services.sloHealth.cell.stale', {
          defaultMessage: '{n} stale',
          values: { n },
        }),
    };
  }
  if (b.ok > 0) {
    return {
      key: 'ok',
      color: 'success',
      count: b.ok,
      label: (n) =>
        i18n.translate('observability.apm.services.sloHealth.cell.ok', {
          defaultMessage: '{n} OK',
          values: { n },
        }),
    };
  }
  if (b.disabled > 0) {
    return {
      key: 'disabled',
      color: 'default',
      count: b.disabled,
      label: (n) =>
        i18n.translate('observability.apm.services.sloHealth.cell.disabled', {
          defaultMessage: '{n} disabled',
          values: { n },
        }),
    };
  }
  return null;
}

function missingPairTooltip(b: SloHealthBucket): string {
  if (!b.hasAvailability && !b.hasLatency) return t.missingCanonicalPair;
  if (!b.hasAvailability) return t.missingAvailability;
  return t.missingLatency;
}

const SloHealthCellUI: React.FC<SloHealthCellProps> = ({
  serviceName,
  bucket,
  isLoading,
  error,
}) => {
  if (error?.kind === 'forbidden') {
    return (
      <EuiToolTip content={t.forbidden}>
        <EuiIcon
          type="lock"
          color="subdued"
          data-test-subj={`sloHealthCellForbidden-${serviceName}`}
          aria-hidden={true}
        />
      </EuiToolTip>
    );
  }
  if (error) {
    return (
      <EuiToolTip content={t.cellLoadError}>
        <EuiIcon
          type="alert"
          color="danger"
          data-test-subj={`sloHealthCellError-${serviceName}`}
          aria-hidden={true}
        />
      </EuiToolTip>
    );
  }
  if (isLoading && !bucket) {
    return (
      <div
        className="sloHealthCell__loading"
        data-test-subj={`sloHealthCellLoading-${serviceName}`}
      >
        <EuiLoadingContent lines={1} />
      </div>
    );
  }
  const b = bucket;
  if (!b || b.total === 0) {
    return (
      <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiText size="s" color="subdued">
            —
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiLink
            onClick={() => navigateToSloSuggest([serviceName])}
            data-test-subj={`sloHealthCellSuggest-${serviceName}`}
          >
            <EuiText size="xs">{t.suggestRow}</EuiText>
          </EuiLink>
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  }

  const worst = worstStateForBucket(b);
  const missingPair = b.missingCanonicalPair;
  const ariaParts = [serviceName];
  if (worst) ariaParts.push(worst.label(worst.count));
  if (missingPair) ariaParts.push(missingPairTooltip(b));
  const ariaLabel = i18n.translate('observability.apm.services.sloHealth.cell.aria', {
    defaultMessage: 'View SLOs for {summary}',
    values: { summary: ariaParts.join(', ') },
  });

  return (
    <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
      <EuiFlexItem grow={false}>
        <EuiLink
          onClick={() => navigateToSloListing([serviceName])}
          aria-label={ariaLabel}
          data-test-subj={`sloHealthCell-${serviceName}`}
        >
          {worst ? (
            <EuiHealth color={worst.color}>{worst.label(worst.count)}</EuiHealth>
          ) : (
            <EuiText size="s" color="subdued">
              {b.total}
            </EuiText>
          )}
        </EuiLink>
      </EuiFlexItem>
      {missingPair && (
        <EuiFlexItem grow={false}>
          <EuiToolTip content={missingPairTooltip(b)}>
            <EuiIcon
              type="alert"
              color="warning"
              data-test-subj={`sloHealthMissingPairIcon-${serviceName}`}
              aria-hidden={true}
            />
          </EuiToolTip>
        </EuiFlexItem>
      )}
    </EuiFlexGroup>
  );
};

export const SloHealthCell = React.memo(SloHealthCellUI);

export const SLO_HEALTH_COLUMN_HEADER = t.columnHeader;
export const SLO_HEALTH_COLUMN_HEADER_TIP = t.columnHeaderTip;
// Percentage so the services-home table's column widths sum to 100% — a
// fixed-pixel cell mixed in with the other percentage columns added up to
// >100% at typical viewports and forced columns to overlap.
export const SLO_HEALTH_COLUMN_WIDTH = '18%';

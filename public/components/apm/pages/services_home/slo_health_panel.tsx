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
  EuiSpacer,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { navigateToSloListing, navigateToSloSuggest } from '../../shared/utils/navigation_utils';
import type { SloHealthAccessError, SloHealthBucket } from '../slos/slo_health_summary';
import { ChipRow } from '../slos/slo_health_chip_row';
import { SloBudgetSparkline } from './slo_budget_sparkline';

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

  const missingPairServices = useMemo(() => {
    const out: string[] = [];
    // Only include services we actually have data for — stale `allServices`
    // entries that are missing from `bySvc` aren't "known to be missing", so
    // don't silently seed the CTA CSV with them.
    for (const name of allServices) {
      const bucket = bySvc.get(name);
      if (bucket?.missingCanonicalPair) out.push(name);
    }
    return out;
  }, [allServices, bySvc]);

  const onClickSuggest = useCallback(() => {
    navigateToSloSuggest(missingPairServices);
  }, [missingPairServices]);

  const onClickViewAll = useCallback(() => {
    navigateToSloListing(allServices);
  }, [allServices]);

  if (error?.kind === 'forbidden') {
    return (
      <>
        <EuiPanel hasBorder paddingSize="m" data-test-subj="sloHealthPanel">
          <EuiCallOut
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
                    <div style={{ height: 20 }} data-test-subj="sloHealthPanelLoadingPlaceholder" />
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
                  <EuiToolTip
                    content={
                      missingPairServices.length === 0 && !isLoading
                        ? t.suggestDisabledTip
                        : undefined
                    }
                  >
                    <EuiButton
                      fill
                      iconType="wand"
                      size="s"
                      isLoading={isLoading}
                      isDisabled={!isLoading && missingPairServices.length === 0}
                      onClick={onClickSuggest}
                      data-test-subj="sloHealthPanelCta"
                    >
                      {t.suggestCta(missingPairServices.length)}
                    </EuiButton>
                  </EuiToolTip>
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
        />
      </EuiToolTip>
    );
  }
  if (error) {
    return (
      <EuiToolTip content={t.cellLoadError}>
        <EuiIcon type="alert" color="danger" data-test-subj={`sloHealthCellError-${serviceName}`} />
      </EuiToolTip>
    );
  }
  if (isLoading && !bucket) {
    return (
      <div style={{ width: 80 }} data-test-subj={`sloHealthCellLoading-${serviceName}`}>
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

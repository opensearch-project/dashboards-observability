/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Service expandable panels for the Suggest SLOs page.
 *
 * Each panel is a service; clicking the chevron expands to show
 * `SuggestionInlineRow` cards for every draft that service owns.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  EuiBadge,
  EuiButtonIcon,
  EuiCheckbox,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiIcon,
  EuiPanel,
  EuiPopover,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import type { Suggestion } from './suggest_engine';
import { suggestionIconType } from './suggest_icon';
import { OverridePatch, OverrideValues, SuggestionInlineRow } from './suggest_inline_row';
import type { RowStatusMap } from './suggest_use_batch_create';
import './suggest_service_tree_table.scss';

const SLI_MIX_VISIBLE_CAP = 4;
/** Grace period before the hover popover closes, so moving into it doesn't dismiss it. */
const HOVER_CLOSE_DELAY_MS = 150;

const t = {
  draftCount: (count: number) =>
    i18n.translate('observability.apm.slo.suggest.serviceTreeTable.draftCount', {
      defaultMessage: '{count, plural, one {# draft} other {# drafts}}',
      values: { count },
    }),
  target: (pct: string) =>
    i18n.translate('observability.apm.slo.suggest.serviceTreeTable.target', {
      defaultMessage: 'Target: {pct}%',
      values: { pct },
    }),
  approxRules: (count: number) =>
    i18n.translate('observability.apm.slo.suggest.serviceTreeTable.approxRules', {
      defaultMessage: '~{count, plural, one {# rule} other {# rules}}',
      values: { count },
    }),
  rules: (count: number) =>
    i18n.translate('observability.apm.slo.suggest.serviceTreeTable.rules', {
      defaultMessage: '{count, plural, one {# rule} other {# rules}}',
      values: { count },
    }),
  covered: i18n.translate('observability.apm.slo.suggest.serviceTreeTable.coveredBadge', {
    defaultMessage: 'Covered',
  }),
  metricLabel: i18n.translate('observability.apm.slo.suggest.serviceTreeTable.metricLabel', {
    defaultMessage: 'Metric:',
  }),
  sliMix: i18n.translate('observability.apm.slo.suggest.serviceTreeTable.sliMix', {
    defaultMessage: 'SLI mix',
  }),
  overflowMore: (count: number) =>
    i18n.translate('observability.apm.slo.suggest.serviceTreeTable.overflowMore', {
      defaultMessage: '+{count} more',
      values: { count },
    }),
};

/** Badge with a popover showing draft details for a given SLI kind (opens on hover). */
const SliMixBadgePopover: React.FC<{
  kind: string;
  iconType: string;
  drafts: Suggestion[];
}> = ({ kind, iconType, drafts }) => {
  const [isOpen, setIsOpen] = useState(false);
  // Keep the hover-close timer in a ref so it survives re-renders — a plain
  // local would reset to undefined every render, leaving `openPopover` unable
  // to cancel a pending close and risking a setState after unmount.
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const openPopover = () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    setIsOpen(true);
  };
  const closePopover = () => {
    closeTimerRef.current = setTimeout(() => setIsOpen(false), HOVER_CLOSE_DELAY_MS);
  };

  // Clear any pending close timer on unmount.
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  return (
    <div onMouseEnter={openPopover} onMouseLeave={closePopover}>
      <EuiPopover
        button={
          <EuiBadge color="hollow" iconType={iconType}>
            {kind}
          </EuiBadge>
        }
        isOpen={isOpen}
        closePopover={() => setIsOpen(false)}
        anchorPosition="downCenter"
        panelPaddingSize="s"
      >
        <div
          className="slo-suggest-sli-mix__popover"
          onMouseEnter={openPopover}
          onMouseLeave={closePopover}
        >
          <EuiText size="xs">
            <strong>{kind}</strong>
            {' — '}
            {t.draftCount(drafts.length)}
          </EuiText>
          <EuiHorizontalRule margin="xs" />
          {drafts.map((d) => (
            <div key={d.key} className="slo-suggest-sli-mix__draft">
              <EuiText size="xs">
                <strong>{d.input.spec.name || d.key}</strong>
              </EuiText>
              <EuiText size="xs" color="subdued">
                {d.reason}
              </EuiText>
              <EuiFlexGroup
                gutterSize="s"
                responsive={false}
                wrap
                className="slo-suggest-sli-mix__draft-badges"
              >
                <EuiFlexItem grow={false}>
                  <EuiBadge color="hollow">
                    {t.target(((d.input.spec.objectives?.[0]?.target ?? 0) * 100).toFixed(1))}
                  </EuiBadge>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiBadge color="hollow">{t.approxRules(d.estimatedRuleCount)}</EuiBadge>
                </EuiFlexItem>
                {d.existingRuleMatch && (
                  <EuiFlexItem grow={false}>
                    <EuiBadge color="warning">{t.covered}</EuiBadge>
                  </EuiFlexItem>
                )}
              </EuiFlexGroup>
              <EuiText size="xs" color="subdued" className="slo-suggest-sli-mix__draft-metric">
                {t.metricLabel} <code>{d.sourceMetric}</code>
              </EuiText>
            </div>
          ))}
        </div>
      </EuiPopover>
    </div>
  );
};

export interface ServiceRowShape {
  serviceName: string;
  environment?: string;
  drafts: Suggestion[];
  /** Creatable drafts currently checked (selected AND not covered). */
  selectedCount: number;
  /** Drafts that can be selected at all (not covered). Denominator for the
   *  master checkbox's "all selected" state. */
  selectableCount: number;
  totalRules: number;
  coveredCount: number;
  kinds: string[];
}

export interface ServiceTreeTableProps {
  serviceRows: ServiceRowShape[];
  expandedMap: Record<string, boolean>;
  onToggleExpand: (serviceName: string) => void;
  onToggleServiceSelection: (row: ServiceRowShape) => void;
  selected: Set<string>;
  overrides: Record<string, OverrideValues>;
  onToggleDraft: (key: string) => void;
  onOverrideChange: (key: string, patch: OverridePatch) => void;
  /** Optional per-draft status for the in-flight batch create. */
  rowStatusMap?: RowStatusMap;
  /**
   * Draft keys that are already covered (from the page's `isDraftCovered` —
   * recording-rule match OR a same-side SLO already existing for the service).
   * Covered drafts are non-selectable. Authoritative and side-aware, so the
   * table never re-derives coverage itself.
   */
  coveredKeys?: Set<string>;
}

export const ServiceTreeTable: React.FC<ServiceTreeTableProps> = ({
  serviceRows,
  expandedMap,
  onToggleExpand,
  onToggleServiceSelection,
  selected,
  overrides,
  onToggleDraft,
  onOverrideChange,
  rowStatusMap,
  coveredKeys,
}) => {
  return (
    <div data-test-subj="slosSuggestTable">
      {serviceRows.map((row) => {
        const isExpanded = expandedMap[row.serviceName] ?? false;
        // "All selected" is relative to the selectable (non-covered) drafts, so
        // a partially-covered service can still reach a fully-checked master box.
        const allSelected = row.selectableCount > 0 && row.selectedCount === row.selectableCount;
        const someSelected = row.selectedCount > 0 && !allSelected;
        // Disable the master checkbox when the service has no selectable drafts
        // left — i.e. every draft it owns is already covered.
        const isCovered = row.selectableCount === 0;

        const iconByKind = new Map<string, string>();
        for (const draft of row.drafts) {
          if (!iconByKind.has(draft.kind)) iconByKind.set(draft.kind, suggestionIconType(draft));
        }
        const draftsByKind = new Map<string, Suggestion[]>();
        for (const draft of row.drafts) {
          const list = draftsByKind.get(draft.kind) ?? [];
          list.push(draft);
          draftsByKind.set(draft.kind, list);
        }

        const visible = row.kinds.slice(0, SLI_MIX_VISIBLE_CAP);
        const overflow = row.kinds.length - visible.length;

        return (
          <div key={row.serviceName} className="slo-suggest-tree__service">
            <EuiPanel
              hasBorder
              paddingSize="m"
              data-test-subj={`slosSuggestServiceRow-${row.serviceName}`}
            >
              {/* Service header row */}
              <EuiFlexGroup alignItems="center" gutterSize="m" responsive={false} wrap>
                <EuiFlexItem grow={false}>
                  <EuiButtonIcon
                    aria-label={
                      isExpanded
                        ? i18n.translate(
                            'observability.apm.slo.suggest.serviceTreeTable.collapseAriaLabel',
                            {
                              defaultMessage: 'Collapse {serviceName}',
                              values: { serviceName: row.serviceName },
                            }
                          )
                        : i18n.translate(
                            'observability.apm.slo.suggest.serviceTreeTable.expandAriaLabel',
                            {
                              defaultMessage: 'Expand {serviceName}',
                              values: { serviceName: row.serviceName },
                            }
                          )
                    }
                    iconType={isExpanded ? 'arrowDown' : 'arrowRight'}
                    onClick={() => onToggleExpand(row.serviceName)}
                    data-test-subj={`slosSuggestServiceExpand-${row.serviceName}`}
                  />
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiCheckbox
                    id={`slosSuggestServiceSelect-${row.serviceName}`}
                    data-test-subj={`slosSuggestServiceSelect-${row.serviceName}`}
                    checked={allSelected}
                    indeterminate={someSelected}
                    disabled={isCovered}
                    onChange={() => onToggleServiceSelection(row)}
                    aria-label={i18n.translate(
                      'observability.apm.slo.suggest.serviceTreeTable.selectAllAriaLabel',
                      {
                        defaultMessage: 'Select all drafts for {serviceName}',
                        values: { serviceName: row.serviceName },
                      }
                    )}
                  />
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiText size="s">
                    <strong>{row.serviceName}</strong>
                  </EuiText>
                </EuiFlexItem>
                {row.environment && (
                  <EuiFlexItem grow={false}>
                    <EuiBadge color="hollow">{row.environment}</EuiBadge>
                  </EuiFlexItem>
                )}
                <EuiFlexItem grow={false}>
                  <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
                    <EuiFlexItem grow={false}>
                      <EuiText size="xs" color="subdued">
                        {t.sliMix}
                      </EuiText>
                    </EuiFlexItem>
                    {visible.map((kind) => (
                      <EuiFlexItem grow={false} key={kind}>
                        <SliMixBadgePopover
                          kind={kind}
                          iconType={iconByKind.get(kind) ?? 'bullseye'}
                          drafts={draftsByKind.get(kind) ?? []}
                        />
                      </EuiFlexItem>
                    ))}
                    {overflow > 0 && (
                      <EuiFlexItem grow={false}>
                        <SliMixBadgePopover
                          kind={t.overflowMore(overflow)}
                          iconType="boxesHorizontal"
                          drafts={row.kinds
                            .slice(SLI_MIX_VISIBLE_CAP)
                            .flatMap((k) => draftsByKind.get(k) ?? [])}
                        />
                      </EuiFlexItem>
                    )}
                  </EuiFlexGroup>
                </EuiFlexItem>
                <EuiFlexItem grow={true} />
                {/* Right-side stats */}
                <EuiFlexItem grow={false}>
                  <EuiText size="xs" color="subdued">
                    {i18n.translate('observability.apm.slo.suggest.servicePanel.slosSelected', {
                      defaultMessage: '{selected}/{total} SLOs selected',
                      values: { selected: row.selectedCount, total: row.drafts.length },
                    })}
                  </EuiText>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiText size="xs" color="subdued">
                    {t.rules(row.totalRules)}
                  </EuiText>
                </EuiFlexItem>
                {row.coveredCount > 0 && (
                  <EuiFlexItem grow={false}>
                    <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
                      <EuiFlexItem grow={false}>
                        <EuiIcon type="check" color="success" size="s" aria-hidden={true} />
                      </EuiFlexItem>
                      <EuiFlexItem grow={false}>
                        <EuiText size="xs" color="success">
                          {i18n.translate('observability.apm.slo.suggest.servicePanel.covered', {
                            defaultMessage: '{count} covered',
                            values: { count: row.coveredCount },
                          })}
                        </EuiText>
                      </EuiFlexItem>
                    </EuiFlexGroup>
                  </EuiFlexItem>
                )}
              </EuiFlexGroup>

              {/* Expanded drafts */}
              {isExpanded && (
                <>
                  <EuiSpacer size="m" />
                  <div data-test-subj={`slosSuggestServiceExpanded-${row.serviceName}`}>
                    {row.drafts.map((draft) => (
                      <SuggestionInlineRow
                        key={draft.key}
                        suggestion={draft}
                        selected={selected.has(draft.key)}
                        onToggle={() => onToggleDraft(draft.key)}
                        overrides={overrides[draft.key] ?? {}}
                        onOverrideChange={(patch) => onOverrideChange(draft.key, patch)}
                        rowStatus={rowStatusMap?.[draft.key]?.status}
                        rowStatusMessage={rowStatusMap?.[draft.key]?.message}
                        // Authoritative per-draft covered flag from the page.
                        covered={coveredKeys?.has(draft.key) ?? false}
                      />
                    ))}
                  </div>
                </>
              )}
            </EuiPanel>
          </div>
        );
      })}
    </div>
  );
};

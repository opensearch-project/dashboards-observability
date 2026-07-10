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

import React, { useState } from 'react';
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

const SLI_MIX_VISIBLE_CAP = 4;

/** Badge with a popover showing draft details for a given SLI kind (opens on hover). */
const SliMixBadgePopover: React.FC<{
  kind: string;
  iconType: string;
  drafts: Suggestion[];
}> = ({ kind, iconType, drafts }) => {
  const [isOpen, setIsOpen] = useState(false);
  let closeTimer: ReturnType<typeof setTimeout> | undefined;

  const openPopover = () => {
    if (closeTimer) clearTimeout(closeTimer);
    setIsOpen(true);
  };
  const closePopover = () => {
    closeTimer = setTimeout(() => setIsOpen(false), 150);
  };

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
        <div style={{ maxWidth: 320 }} onMouseEnter={openPopover} onMouseLeave={closePopover}>
          <EuiText size="xs">
            <strong>{kind}</strong>
            {' — '}
            {drafts.length === 1 ? '1 draft' : `${drafts.length} drafts`}
          </EuiText>
          <EuiHorizontalRule margin="xs" />
          {drafts.map((d) => (
            <div key={d.key} style={{ marginBottom: 6 }}>
              <EuiText size="xs">
                <strong>{d.input.spec.name || d.key}</strong>
              </EuiText>
              <EuiText size="xs" color="subdued">
                {d.reason}
              </EuiText>
              <EuiFlexGroup gutterSize="s" responsive={false} wrap style={{ marginTop: 2 }}>
                <EuiFlexItem grow={false}>
                  <EuiBadge color="hollow">
                    {`Target: ${((d.input.spec.objectives?.[0]?.target ?? 0) * 100).toFixed(1)}%`}
                  </EuiBadge>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiBadge color="hollow">{`~${d.estimatedRuleCount} rules`}</EuiBadge>
                </EuiFlexItem>
                {d.existingRuleMatch && (
                  <EuiFlexItem grow={false}>
                    <EuiBadge color="warning">Covered</EuiBadge>
                  </EuiFlexItem>
                )}
              </EuiFlexGroup>
              <EuiText size="xs" color="subdued" style={{ marginTop: 2 }}>
                Metric: <code>{d.sourceMetric}</code>
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
  selectedCount: number;
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
  /** Services whose canonical SLO pair is fully covered — rendered as disabled. */
  coveredServices?: Set<string>;
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
  coveredServices,
}) => {
  return (
    <div data-test-subj="slosSuggestTable">
      {serviceRows.map((row) => {
        const isExpanded = expandedMap[row.serviceName] ?? false;
        const allSelected = row.selectedCount === row.drafts.length && row.drafts.length > 0;
        const someSelected = row.selectedCount > 0 && !allSelected;
        const isCovered = coveredServices?.has(row.serviceName) ?? false;

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
          <div key={row.serviceName} style={{ marginBottom: 12 }}>
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
                        SLI mix
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
                          kind={`+${overflow} more`}
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
                    {`${row.totalRules} rules`}
                  </EuiText>
                </EuiFlexItem>
                {row.coveredCount > 0 && (
                  <EuiFlexItem grow={false}>
                    <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
                      <EuiFlexItem grow={false}>
                        <EuiIcon type="check" color="success" size="s" />
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

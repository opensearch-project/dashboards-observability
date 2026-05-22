/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Service tree table for the Suggest SLOs page.
 *
 * Each row is a service; expanded rows render `SuggestionInlineRow` for every
 * draft that service owns. Built on EuiBasicTable (no pagination / filtering
 * needed at this scale — 19 services is the target) with
 * `itemIdToExpandedRowMap`. Rows default to expanded so the user sees ~38
 * drafts on first paint.
 */

import React, { useMemo } from 'react';
import {
  EuiBadge,
  EuiBasicTable,
  EuiBasicTableColumn,
  EuiButtonIcon,
  EuiCheckbox,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIconTip,
  EuiPanel,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import type { Suggestion } from './suggest_engine';
import { suggestionIconType } from './suggest_icon';
import { OverridePatch, OverrideValues, SuggestionInlineRow } from './suggest_inline_row';
import type { RowStatusMap } from './suggest_use_batch_create';

const SLI_MIX_VISIBLE_CAP = 4;

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
}) => {
  const itemIdToExpandedRowMap = useMemo(() => {
    const map: Record<string, React.ReactNode> = {};
    for (const row of serviceRows) {
      if (!expandedMap[row.serviceName]) continue;
      map[row.serviceName] = (
        <EuiPanel
          color="subdued"
          paddingSize="s"
          hasShadow={false}
          data-test-subj={`slosSuggestServiceExpanded-${row.serviceName}`}
        >
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
        </EuiPanel>
      );
    }
    return map;
  }, [
    serviceRows,
    expandedMap,
    selected,
    overrides,
    onToggleDraft,
    onOverrideChange,
    rowStatusMap,
  ]);

  const columns: Array<EuiBasicTableColumn<ServiceRowShape>> = useMemo(
    () => [
      {
        width: '40px',
        isExpander: true,
        render: (row: ServiceRowShape) => (
          <EuiButtonIcon
            aria-label={
              expandedMap[row.serviceName]
                ? i18n.translate(
                    'observability.apm.slo.suggest.serviceTreeTable.collapseAriaLabel',
                    {
                      defaultMessage: 'Collapse {serviceName}',
                      values: { serviceName: row.serviceName },
                    }
                  )
                : i18n.translate('observability.apm.slo.suggest.serviceTreeTable.expandAriaLabel', {
                    defaultMessage: 'Expand {serviceName}',
                    values: { serviceName: row.serviceName },
                  })
            }
            iconType={expandedMap[row.serviceName] ? 'arrowDown' : 'arrowRight'}
            onClick={() => onToggleExpand(row.serviceName)}
            data-test-subj={`slosSuggestServiceExpand-${row.serviceName}`}
          />
        ),
      },
      {
        width: '36px',
        render: (row: ServiceRowShape) => {
          const allSelected = row.selectedCount === row.drafts.length && row.drafts.length > 0;
          const someSelected = row.selectedCount > 0 && !allSelected;
          return (
            <EuiCheckbox
              id={`slosSuggestServiceSelect-${row.serviceName}`}
              data-test-subj={`slosSuggestServiceSelect-${row.serviceName}`}
              checked={allSelected}
              indeterminate={someSelected}
              onChange={() => onToggleServiceSelection(row)}
              aria-label={i18n.translate(
                'observability.apm.slo.suggest.serviceTreeTable.selectAllAriaLabel',
                {
                  defaultMessage: 'Select all drafts for {serviceName}',
                  values: { serviceName: row.serviceName },
                }
              )}
            />
          );
        },
      },
      {
        name: i18n.translate('observability.apm.slo.suggest.serviceTreeTable.column.service', {
          defaultMessage: 'Service',
        }),
        field: 'serviceName',
        render: (_value: string, row: ServiceRowShape) => {
          const allSelected = row.selectedCount === row.drafts.length && row.drafts.length > 0;
          const selectionColor = allSelected
            ? 'primary'
            : row.selectedCount === 0
            ? 'hollow'
            : 'accent';
          return (
            <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false} wrap>
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
                <EuiBadge
                  color={selectionColor}
                  data-test-subj={`slosSuggestSelectionBadge-${row.serviceName}`}
                >
                  {i18n.translate('observability.apm.slo.suggest.serviceTreeTable.selectionBadge', {
                    defaultMessage: '{selected} / {total} selected',
                    values: { selected: row.selectedCount, total: row.drafts.length },
                  })}
                </EuiBadge>
              </EuiFlexItem>
            </EuiFlexGroup>
          );
        },
      },
      {
        name: i18n.translate('observability.apm.slo.suggest.serviceTreeTable.column.sliMix', {
          defaultMessage: 'SLI mix',
        }),
        render: (row: ServiceRowShape) => {
          const visible = row.kinds.slice(0, SLI_MIX_VISIBLE_CAP);
          const overflow = row.kinds.length - visible.length;
          const iconByKind = new Map<string, string>();
          for (const draft of row.drafts) {
            if (!iconByKind.has(draft.kind)) iconByKind.set(draft.kind, suggestionIconType(draft));
          }
          return (
            <EuiFlexGroup gutterSize="xs" responsive={false} wrap>
              {visible.map((kind) => (
                <EuiFlexItem grow={false} key={kind}>
                  <EuiBadge color="hollow" iconType={iconByKind.get(kind) ?? 'bullseye'}>
                    {kind}
                  </EuiBadge>
                </EuiFlexItem>
              ))}
              {overflow > 0 && (
                <EuiFlexItem grow={false}>
                  <EuiToolTip
                    content={row.kinds.slice(SLI_MIX_VISIBLE_CAP).join(', ')}
                    position="top"
                  >
                    <EuiBadge color="hollow">
                      {i18n.translate(
                        'observability.apm.slo.suggest.serviceTreeTable.overflowMore',
                        {
                          defaultMessage: '+{count} more',
                          values: { count: overflow },
                        }
                      )}
                    </EuiBadge>
                  </EuiToolTip>
                </EuiFlexItem>
              )}
            </EuiFlexGroup>
          );
        },
      },
      {
        name: i18n.translate('observability.apm.slo.suggest.serviceTreeTable.column.drafts', {
          defaultMessage: 'Drafts',
        }),
        render: (row: ServiceRowShape) => (
          <EuiText size="xs" color="subdued">
            {i18n.translate('observability.apm.slo.suggest.serviceTreeTable.draftsCell', {
              defaultMessage: '{count, plural, one {# draft} other {# drafts}} · ~{rules} rules',
              values: { count: row.drafts.length, rules: row.totalRules },
            })}
          </EuiText>
        ),
      },
      {
        name: i18n.translate('observability.apm.slo.suggest.serviceTreeTable.column.covered', {
          defaultMessage: 'Covered',
        }),
        render: (row: ServiceRowShape) =>
          row.coveredCount > 0 ? (
            <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiText size="xs" color="danger">
                  {row.coveredCount}
                </EuiText>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiIconTip
                  type="questionInCircle"
                  color="subdued"
                  position="top"
                  content={i18n.translate(
                    'observability.apm.slo.suggest.serviceTreeTable.coveredTooltip',
                    {
                      defaultMessage:
                        "{count, plural, one {# draft for this service is} other {# drafts for this service are}} already provisioned by existing recording rules. They're unchecked by default to avoid dual-writing.",
                      values: { count: row.coveredCount },
                    }
                  )}
                />
              </EuiFlexItem>
            </EuiFlexGroup>
          ) : null,
      },
    ],
    [expandedMap, onToggleExpand, onToggleServiceSelection]
  );

  return (
    <EuiBasicTable<ServiceRowShape>
      data-test-subj="slosSuggestTable"
      items={serviceRows}
      itemId="serviceName"
      columns={columns}
      isExpandable
      hasActions={false}
      itemIdToExpandedRowMap={itemIdToExpandedRowMap}
      rowProps={(row) => ({ 'data-test-subj': `slosSuggestServiceRow-${row.serviceName}` })}
    />
  );
};

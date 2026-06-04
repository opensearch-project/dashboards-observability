/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Inline pickers (datasource, indices, time field) rendered as a single
 * compact row above the PPL editor.
 *
 * Replaces the previous "Target Datasource" + "Define index" panels — all
 * three selectors now live alongside the query so users see the data scope
 * and the query body together.
 */
import React from 'react';
import {
  EuiComboBox,
  EuiComboBoxOptionOption,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiSelect,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { Datasource } from '../../../../../common/types/alerting';
import { useIndices } from '../../hooks/use_indices';
import { useIndexMappings } from '../../hooks/use_index_mappings';

const DATE_TYPES = ['date', 'date_nanos'];

export interface QueryToolbarProps {
  /** All datasources of the active backend type. */
  datasources: Datasource[];
  selectedDsId: string;
  onDatasourceChange: (id: string) => void;
  /** Locks the datasource picker (edit mode — datasource is pinned). */
  datasourceLocked?: boolean;

  selectedIndices: string[];
  onIndicesChange: (next: string[]) => void;

  selectedTimeField: string;
  onTimeFieldChange: (next: string) => void;
}

type IndexOption = EuiComboBoxOptionOption<{ aliasFor?: string }>;

export const QueryToolbar: React.FC<QueryToolbarProps> = ({
  datasources,
  selectedDsId,
  onDatasourceChange,
  datasourceLocked,
  selectedIndices,
  onIndicesChange,
  selectedTimeField,
  onTimeFieldChange,
}) => {
  const [indexSearch, setIndexSearch] = React.useState('');
  const { options: discovered, isLoading: indicesLoading, error: indicesError } = useIndices({
    dsId: selectedDsId,
    search: indexSearch,
  });

  const { fieldsByType, isLoading: mappingsLoading } = useIndexMappings({
    dsId: selectedDsId,
    indices: selectedIndices,
  });

  const dsOptions = React.useMemo(
    () => [
      {
        value: '',
        text: i18n.translate('observability.alerting.queryToolbar.datasourcePlaceholder', {
          defaultMessage: 'Select datasource…',
        }),
      },
      ...datasources.map((ds) => ({
        value: ds.id,
        text: ds.name + (ds.workspaceName ? ` (${ds.workspaceName})` : ''),
      })),
    ],
    [datasources]
  );

  const indexSelectedOptions: IndexOption[] = selectedIndices.map((label) => ({ label }));

  const wildcardCandidate =
    indexSearch.trim() &&
    !indexSearch.includes('*') &&
    !selectedIndices.includes(`${indexSearch.trim()}*`)
      ? `${indexSearch.trim()}*`
      : null;

  const wildcardOption: IndexOption | null = wildcardCandidate
    ? {
        label: wildcardCandidate,
        append: i18n.translate('observability.alerting.queryToolbar.indexAddAsPattern', {
          defaultMessage: 'Add as pattern',
        }),
      }
    : null;

  const discoveredIndexOptions: IndexOption[] = discovered
    .filter((d) => !selectedIndices.includes(d.label) && d.label !== wildcardCandidate)
    .map((d) => ({
      label: d.label,
      append: d.aliasFor
        ? i18n.translate('observability.alerting.queryToolbar.indexAlias', {
            defaultMessage: 'alias → {target}',
            values: { target: d.aliasFor },
          })
        : undefined,
    }));

  const indexSuggestionOptions: IndexOption[] = wildcardOption
    ? [wildcardOption, ...discoveredIndexOptions]
    : discoveredIndexOptions;

  const dateFields = React.useMemo(() => {
    const set = new Set<string>();
    for (const t of DATE_TYPES) for (const f of fieldsByType[t] ?? []) set.add(f);
    return Array.from(set).sort();
  }, [fieldsByType]);

  const timeFieldOptions: EuiComboBoxOptionOption[] = dateFields.map((f) => ({ label: f }));
  const timeFieldSelected: EuiComboBoxOptionOption[] = selectedTimeField
    ? [{ label: selectedTimeField }]
    : [];

  const noDs = !selectedDsId;
  const noIndices = selectedIndices.length === 0;

  return (
    <EuiFlexGroup
      gutterSize="s"
      alignItems="flexEnd"
      responsive={false}
      data-test-subj="alertManagerQueryToolbar"
    >
      <EuiFlexItem>
        <EuiFormRow
          label={i18n.translate('observability.alerting.queryToolbar.datasourceLabel', {
            defaultMessage: 'Datasource',
          })}
          display="rowCompressed"
          fullWidth
        >
          <EuiSelect
            options={dsOptions}
            value={selectedDsId}
            onChange={(e) => onDatasourceChange(e.target.value)}
            disabled={datasourceLocked}
            compressed
            fullWidth
            data-test-subj="alertManagerInlineDatasourceSelector"
            aria-label={i18n.translate('observability.alerting.queryToolbar.datasourceAriaLabel', {
              defaultMessage: 'Datasource',
            })}
          />
        </EuiFormRow>
      </EuiFlexItem>

      <EuiFlexItem grow={2}>
        <EuiFormRow
          label={i18n.translate('observability.alerting.queryToolbar.indicesLabel', {
            defaultMessage: 'Indices',
          })}
          display="rowCompressed"
          isInvalid={!!indicesError}
          error={
            indicesError
              ? i18n.translate('observability.alerting.queryToolbar.indicesError', {
                  defaultMessage: 'Could not load indices: {message}',
                  values: { message: indicesError.message || 'unknown error' },
                })
              : undefined
          }
          fullWidth
        >
          <EuiComboBox
            async
            compressed
            isClearable
            isDisabled={noDs}
            isLoading={indicesLoading}
            placeholder={i18n.translate('observability.alerting.queryToolbar.indicesPlaceholder', {
              defaultMessage: 'logs-*, metrics-*',
            })}
            options={indexSuggestionOptions}
            selectedOptions={indexSelectedOptions}
            onChange={(next) => onIndicesChange(next.map((o) => o.label))}
            onCreateOption={(raw) => {
              const trimmed = raw.trim();
              if (!trimmed || selectedIndices.includes(trimmed)) return;
              onIndicesChange([...selectedIndices, trimmed]);
            }}
            onSearchChange={setIndexSearch}
            fullWidth
            data-test-subj="alertManagerIndexPicker"
          />
        </EuiFormRow>
      </EuiFlexItem>

      <EuiFlexItem>
        <EuiFormRow
          label={i18n.translate('observability.alerting.queryToolbar.timeFieldLabel', {
            defaultMessage: 'Time field',
          })}
          display="rowCompressed"
          fullWidth
        >
          <EuiComboBox
            compressed
            singleSelection={{ asPlainText: true }}
            isClearable
            isDisabled={noDs || noIndices}
            isLoading={mappingsLoading}
            placeholder={
              noIndices
                ? i18n.translate(
                    'observability.alerting.queryToolbar.timeFieldPlaceholderNoIndices',
                    { defaultMessage: 'Pick indices first' }
                  )
                : i18n.translate('observability.alerting.queryToolbar.timeFieldPlaceholder', {
                    defaultMessage: '@timestamp',
                  })
            }
            options={timeFieldOptions}
            selectedOptions={timeFieldSelected}
            onChange={(picked) => onTimeFieldChange(picked[0]?.label ?? '')}
            onCreateOption={(raw) => {
              const trimmed = raw.trim();
              if (trimmed) onTimeFieldChange(trimmed);
            }}
            fullWidth
            data-test-subj="alertManagerTimeFieldSelector"
          />
        </EuiFormRow>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};

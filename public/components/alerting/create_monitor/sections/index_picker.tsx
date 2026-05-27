/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Multi-select async combobox for the Create / Edit flyout's "Define index"
 * step. Mirrors alerting-dashboards-plugin's `MonitorIndex` UX:
 *   - Suggestions come from `_cat/indices` + `_cat/aliases` via `useIndices`.
 *   - Free text accepted via `onCreateOption` so wildcards (`logs-*`) and
 *     cross-cluster patterns (`prod:logs-*`) keep working when the cluster
 *     hasn't materialized them yet.
 *   - Multi-select; chips render in the order picked.
 */
import React, { useState } from 'react';
import { EuiComboBox, EuiComboBoxOptionOption, EuiFormRow } from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { useIndices } from '../../hooks/use_indices';

export interface IndexPickerProps {
  dsId: string;
  /** Currently picked index/alias labels. Wildcards preserved verbatim. */
  selected: string[];
  onChange: (next: string[]) => void;
  isInvalid?: boolean;
  error?: string;
  /** Disable the input — used during edit-mode loading. */
  disabled?: boolean;
}

type Option = EuiComboBoxOptionOption<{ aliasFor?: string }>;

export const IndexPicker: React.FC<IndexPickerProps> = ({
  dsId,
  selected,
  onChange,
  isInvalid,
  error,
  disabled,
}) => {
  const [search, setSearch] = useState('');
  const { options: discovered, isLoading, error: discoveryError } = useIndices({ dsId, search });

  const selectedOptions: Option[] = selected.map((label) => ({ label }));

  // Synthesize a `<search>*` row pinned at the top so users can promote a
  // partial typed string into a wildcard pattern without retyping. Only
  // shown when the search is non-empty, doesn't already contain `*`, and
  // the resulting pattern isn't already in the chip list.
  const wildcardCandidate =
    search.trim() && !search.includes('*') && !selected.includes(`${search.trim()}*`)
      ? `${search.trim()}*`
      : null;

  const wildcardOption: Option | null = wildcardCandidate
    ? {
        label: wildcardCandidate,
        append: i18n.translate('observability.alerting.indexPicker.addAsPattern', {
          defaultMessage: 'Add as pattern',
        }),
        'data-test-subj': `indexPicker-option-wildcard-${wildcardCandidate}`,
      }
    : null;

  const discoveredOptions: Option[] = discovered
    .filter((d) => !selected.includes(d.label) && d.label !== wildcardCandidate)
    .map((d) => ({
      label: d.label,
      append: d.aliasFor
        ? i18n.translate('observability.alerting.indexPicker.aliasBadge', {
            defaultMessage: 'alias → {target}',
            values: { target: d.aliasFor },
          })
        : undefined,
      'data-test-subj': `indexPicker-option-${d.label}`,
    }));

  const suggestionOptions: Option[] = wildcardOption
    ? [wildcardOption, ...discoveredOptions]
    : discoveredOptions;

  const handleChange = (next: Option[]) => {
    onChange(next.map((o) => o.label));
  };

  const handleCreate = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed || selected.includes(trimmed)) return;
    onChange([...selected, trimmed]);
  };

  // Surface a discovery failure (e.g. alerting plugin missing, transport
  // error) directly on the form row so the user understands why the
  // dropdown is empty. Free-text wildcards still work — the input itself
  // stays enabled.
  const discoveryErrorMessage = discoveryError
    ? i18n.translate('observability.alerting.indexPicker.discoveryError', {
        defaultMessage: 'Could not load indices: {message}',
        values: {
          message: discoveryError.message || 'unknown error',
        },
      })
    : undefined;

  const combinedError = error ?? discoveryErrorMessage;
  const combinedInvalid = isInvalid || !!discoveryErrorMessage;

  return (
    <EuiFormRow
      label={i18n.translate('observability.alerting.indexPicker.label', {
        defaultMessage: 'Indices',
      })}
      helpText={i18n.translate('observability.alerting.indexPicker.helpText', {
        defaultMessage:
          'Pick one or more indices, aliases, or patterns. Wildcards (e.g. logs-*) are kept verbatim.',
      })}
      isInvalid={combinedInvalid}
      error={combinedError}
      fullWidth
    >
      <EuiComboBox
        async
        isClearable
        isDisabled={disabled || !dsId}
        isLoading={isLoading}
        isInvalid={combinedInvalid}
        placeholder={i18n.translate('observability.alerting.indexPicker.placeholder', {
          defaultMessage: 'logs-*, metrics-*',
        })}
        options={suggestionOptions}
        selectedOptions={selectedOptions}
        onChange={handleChange}
        onCreateOption={handleCreate}
        onSearchChange={setSearch}
        fullWidth
        data-test-subj="alertManagerIndexPicker"
        aria-label={i18n.translate('observability.alerting.indexPicker.ariaLabel', {
          defaultMessage: 'Indices to query',
        })}
      />
    </EuiFormRow>
  );
};

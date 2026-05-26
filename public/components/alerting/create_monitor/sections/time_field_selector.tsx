/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Single-select combobox for the timestamp field, populated from the
 * picked indices' `_mapping`. Restricted to leaf types `date` and
 * `date_nanos` — same heuristic as alerting-dashboards-plugin's
 * `MonitorTimeField`. Wildcards in the picked indices resolve through
 * the backend; if the user picks a wildcard that matches no index yet,
 * the field list is empty and we surface a hint instead of a stale chip.
 */
import React, { useMemo } from 'react';
import { EuiComboBox, EuiComboBoxOptionOption, EuiFormRow, EuiText } from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { useIndexMappings } from '../../hooks/use_index_mappings';

export interface TimeFieldSelectorProps {
  dsId: string;
  /** Indices currently picked in the IndexPicker. */
  indices: string[];
  /** Selected timestamp field path, or empty string when none chosen. */
  value: string;
  onChange: (next: string) => void;
  isInvalid?: boolean;
  error?: string;
  disabled?: boolean;
}

const DATE_TYPES = ['date', 'date_nanos'];

export const TimeFieldSelector: React.FC<TimeFieldSelectorProps> = ({
  dsId,
  indices,
  value,
  onChange,
  isInvalid,
  error,
  disabled,
}) => {
  const { fieldsByType, isLoading } = useIndexMappings({ dsId, indices });

  const dateFields = useMemo(() => {
    const set = new Set<string>();
    for (const t of DATE_TYPES) {
      for (const f of fieldsByType[t] ?? []) set.add(f);
    }
    return Array.from(set).sort();
  }, [fieldsByType]);

  const options: EuiComboBoxOptionOption[] = dateFields.map((f) => ({ label: f }));
  const selectedOptions: EuiComboBoxOptionOption[] = value ? [{ label: value }] : [];

  const noIndices = indices.length === 0;
  const noFields = !isLoading && !noIndices && dateFields.length === 0;

  return (
    <EuiFormRow
      label={i18n.translate('observability.alerting.timeFieldSelector.label', {
        defaultMessage: 'Time field',
      })}
      helpText={
        noIndices
          ? i18n.translate('observability.alerting.timeFieldSelector.helpTextNoIndices', {
              defaultMessage: 'Pick at least one index to populate field choices.',
            })
          : i18n.translate('observability.alerting.timeFieldSelector.helpText', {
              defaultMessage: 'Field used to constrain queries to the evaluation window.',
            })
      }
      isInvalid={isInvalid}
      error={error}
      fullWidth
    >
      <>
        <EuiComboBox
          singleSelection={{ asPlainText: true }}
          isClearable
          isDisabled={disabled || noIndices}
          isLoading={isLoading}
          isInvalid={isInvalid}
          placeholder={
            noIndices
              ? i18n.translate('observability.alerting.timeFieldSelector.placeholderNoIndices', {
                  defaultMessage: 'Select indices first',
                })
              : i18n.translate('observability.alerting.timeFieldSelector.placeholder', {
                  defaultMessage: '@timestamp',
                })
          }
          options={options}
          selectedOptions={selectedOptions}
          onChange={(picked) => onChange(picked[0]?.label ?? '')}
          onCreateOption={(raw) => {
            const trimmed = raw.trim();
            if (trimmed) onChange(trimmed);
          }}
          fullWidth
          data-test-subj="alertManagerTimeFieldSelector"
          aria-label={i18n.translate('observability.alerting.timeFieldSelector.ariaLabel', {
            defaultMessage: 'Timestamp field',
          })}
        />
        {noFields && (
          <EuiText size="xs" color="subdued" style={{ marginTop: 4 }}>
            {i18n.translate('observability.alerting.timeFieldSelector.noFieldsHint', {
              defaultMessage:
                'No date or date_nanos fields found in the picked indices. Type a field path manually if you know one.',
            })}
          </EuiText>
        )}
      </>
    </EuiFormRow>
  );
};

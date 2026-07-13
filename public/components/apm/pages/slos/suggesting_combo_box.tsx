/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Single-select combobox that suggests known values but still accepts free
 * text. Used for the wizard's Service and Primary-team fields: both are
 * free-form business identifiers (not constrained to a registry), but typing
 * them blind invites label drift — `my-api` vs `My API` vs `myapi` fragments
 * the listing facets and breaks Alertmanager routing. Offering the values
 * already in use nudges the user toward a consistent spelling without blocking
 * a genuinely new one.
 *
 * Distinct from `DatasourceSelect`, which is restricted to discovered options
 * (a datasource must resolve to a real saved object). Here free text is the
 * point, so `onCreateOption` is wired.
 */

import React, { useMemo } from 'react';
import { EuiComboBox, EuiComboBoxOptionOption } from '@elastic/eui';

export interface SuggestingComboBoxProps {
  /** Current value (empty string when unset). */
  value: string;
  onChange: (value: string) => void;
  /** Known values to suggest. De-duped and the current value is always offered. */
  suggestions: string[];
  isInvalid?: boolean;
  isLoading?: boolean;
  placeholder?: string;
  'data-test-subj'?: string;
}

export const SuggestingComboBox: React.FC<SuggestingComboBoxProps> = ({
  value,
  onChange,
  suggestions,
  isInvalid,
  isLoading,
  placeholder,
  'data-test-subj': dataTestSubj,
}) => {
  const options: Array<EuiComboBoxOptionOption<string>> = useMemo(() => {
    // Include the current value so a free-text entry not in `suggestions`
    // still renders as a selected chip rather than silently dropping.
    const labels = new Set(suggestions.filter(Boolean));
    if (value) labels.add(value);
    return Array.from(labels).map((label) => ({ label }));
  }, [suggestions, value]);

  const selectedOptions = value ? [{ label: value }] : [];

  const handleChange = (next: Array<EuiComboBoxOptionOption<string>>) => {
    onChange(next[0]?.label ?? '');
  };

  const handleCreate = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed) onChange(trimmed);
  };

  return (
    <EuiComboBox
      singleSelection={{ asPlainText: true }}
      isClearable
      isInvalid={isInvalid}
      isLoading={isLoading}
      placeholder={placeholder}
      options={options}
      selectedOptions={selectedOptions}
      onChange={handleChange}
      onCreateOption={handleCreate}
      data-test-subj={dataTestSubj}
    />
  );
};

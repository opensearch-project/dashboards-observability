/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Two-column key=value editor for the wizard's Labels and Annotations rows.
 * Replaces the former `<EuiTextArea>` lines-of-"key=value" UX so every row
 * can (a) surface its own validation error inline and (b) be added or
 * removed without editing free-form text.
 *
 * State lives in the wizard reducer as `state.labels` / `state.annotations`
 * arrays of `{ key, value }`. Empty rows are tolerated in-state (the user
 * may be mid-edit) and filtered out at build time.
 */

import React from 'react';
import {
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiText,
} from '@elastic/eui';

export interface KeyValueEntry {
  key: string;
  value: string;
}

export interface KeyValueGridProps {
  entries: KeyValueEntry[];
  onChange: (index: number, field: 'key' | 'value', value: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  /** Per-row error messages, aligned by entry index (undefined = no error). */
  rowErrors?: Array<string | undefined>;
  /** data-test-subj prefix, e.g. "slosWizardLabel" or "slosWizardAnnotation". */
  testSubjPrefix: string;
  /** Visible button label on the footer Add action. */
  addLabel?: string;
  /** Placeholder text for the key column. */
  keyPlaceholder?: string;
  /** Placeholder text for the value column. */
  valuePlaceholder?: string;
}

export const WizardKeyValueGrid: React.FC<KeyValueGridProps> = ({
  entries,
  onChange,
  onAdd,
  onRemove,
  rowErrors,
  testSubjPrefix,
  addLabel = 'Add row',
  keyPlaceholder = 'key',
  valuePlaceholder = 'value',
}) => {
  return (
    <div data-test-subj={`${testSubjPrefix}sGrid`}>
      {entries.length === 0 && (
        <EuiText size="xs" color="subdued" data-test-subj={`${testSubjPrefix}sEmpty`}>
          No rows yet.
        </EuiText>
      )}
      {entries.map((entry, i) => {
        const rowError = rowErrors?.[i];
        // Stable per-row key — entry.key is the natural id; fall back to
        // index for blank rows that have just been added.
        const rowKey = entry.key ? `key:${entry.key}` : `idx:${i}`;
        return (
          <EuiFormRow
            key={rowKey}
            isInvalid={!!rowError}
            error={rowError}
            fullWidth
            display="rowCompressed"
          >
            <EuiFlexGroup
              gutterSize="s"
              alignItems="flexStart"
              responsive={false}
              data-test-subj={`${testSubjPrefix}Row-${i}`}
            >
              <EuiFlexItem>
                <EuiFieldText
                  compressed
                  placeholder={keyPlaceholder}
                  value={entry.key}
                  onChange={(e) => onChange(i, 'key', e.target.value)}
                  isInvalid={!!rowError}
                  data-test-subj={`${testSubjPrefix}Key-${i}`}
                />
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiFieldText
                  compressed
                  placeholder={valuePlaceholder}
                  value={entry.value}
                  onChange={(e) => onChange(i, 'value', e.target.value)}
                  isInvalid={!!rowError}
                  data-test-subj={`${testSubjPrefix}Value-${i}`}
                />
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButtonIcon
                  color="danger"
                  iconType="trash"
                  aria-label={`Remove ${testSubjPrefix} ${i}`}
                  onClick={() => onRemove(i)}
                  data-test-subj={`${testSubjPrefix}Remove-${i}`}
                />
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFormRow>
        );
      })}
      <EuiButtonEmpty
        iconType="plusInCircle"
        size="s"
        onClick={onAdd}
        data-test-subj={`${testSubjPrefix}Add`}
      >
        {addLabel}
      </EuiButtonEmpty>
    </div>
  );
};

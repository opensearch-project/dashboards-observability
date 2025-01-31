/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiSmallButton,
  EuiSmallButtonEmpty,
  EuiCompressedComboBox,
  EuiComboBoxOptionOption,
  EuiFlexGroup,
  EuiFlexItem,
  EuiCompressedFormRow,
  EuiSpacer,
} from '@elastic/eui';
import React, { useState } from 'react';
import { i18n } from '@osd/i18n';
import { getInvertedOperator, getOperatorOptions, getValueComponent } from './filter_helpers';
import { FilterType } from './filters';

export function FilterEditPopover(props: {
  filter?: FilterType;
  index: number;
  setFilter: (newFilter: FilterType, index: number) => void;
  closePopover: () => void;
  filterFieldOptions: Array<{ label: string }>;
}) {
  const [selectedFieldOptions, setSelectedFieldOptions] = useState<
    Array<EuiComboBoxOptionOption<string>>
  >(props.filter ? [{ label: props.filter.field }] : []);
  const [selectedOperatorOptions, setSelectedOperatorOptions] = useState<
    Array<EuiComboBoxOptionOption<string>>
  >(
    props.filter
      ? [{ label: getInvertedOperator(props.filter.operator, props.filter.inverted) }]
      : []
  );
  const [filterValue, setFilterValue] = useState(props.filter?.value || '');

  return (
    <div style={{ width: 600 }}>
      {/* invisible button workaround to prevent auto focus on context menu panel switch */}
      <button style={{ width: 0, height: 0, position: 'fixed', marginLeft: -1000, bottom: 0 }} />
      <EuiFlexGroup gutterSize="m" direction="column">
        <EuiFlexItem grow={true}>
          <EuiCompressedFormRow label={'Field'} fullWidth>
            <EuiCompressedComboBox
              placeholder={i18n.translate('addFilter.selectFieldPlaceholder', {
                defaultMessage: 'Select a field first',
              })}
              data-test-subj="field-selector-filter-panel"
              isClearable={false}
              options={props.filterFieldOptions}
              selectedOptions={selectedFieldOptions}
              onChange={(e) => {
                setSelectedFieldOptions(e);
                setSelectedOperatorOptions([]);
                setFilterValue('');
              }}
              singleSelection={{ asPlainText: true }}
              fullWidth
            />
          </EuiCompressedFormRow>
        </EuiFlexItem>
        <EuiFlexItem grow={true}>
          <EuiCompressedFormRow label={'Operator'} fullWidth>
            <EuiCompressedComboBox
              placeholder={
                selectedFieldOptions.length === 0
                  ? i18n.translate('addFilter.waitingPlaceholder', {
                      defaultMessage: 'Waiting',
                    })
                  : i18n.translate('addFilter.selectPlaceholder', {
                      defaultMessage: 'Select',
                    })
              }
              data-test-subj="operator-selector-filter-panel"
              isClearable={false}
              isDisabled={selectedFieldOptions.length === 0}
              options={
                selectedFieldOptions.length === 0
                  ? []
                  : getOperatorOptions(selectedFieldOptions[0].label)
              }
              selectedOptions={selectedOperatorOptions}
              onChange={(e) => {
                setSelectedOperatorOptions(e);
                setFilterValue('');
              }}
              singleSelection={{ asPlainText: true }}
              fullWidth
            />
          </EuiCompressedFormRow>
        </EuiFlexItem>
      </EuiFlexGroup>
      {selectedOperatorOptions.length > 0 &&
        getValueComponent(
          selectedFieldOptions[0].label,
          selectedOperatorOptions[0].label,
          filterValue,
          setFilterValue
        )}
      <EuiSpacer size="m" />
      <EuiFlexGroup gutterSize="s" justifyContent="flexEnd">
        <EuiFlexItem grow={false}>
          <EuiSmallButtonEmpty
            data-test-subj="filter-popover-cancel-button"
            onClick={props.closePopover}
          >
            Cancel
          </EuiSmallButtonEmpty>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiSmallButton
            fill
            disabled={
              selectedFieldOptions.length === 0 ||
              selectedOperatorOptions.length === 0 ||
              (filterValue.length === 0 && !selectedOperatorOptions[0]?.label?.includes('exist'))
            }
            onClick={() => {
              props.closePopover();
              props.setFilter(
                {
                  field: selectedFieldOptions[0].label,
                  operator: selectedOperatorOptions[0].label,
                  value: selectedOperatorOptions[0].label.includes('exist')
                    ? 'exists'
                    : filterValue,
                  inverted: selectedOperatorOptions[0].label.includes('not'),
                  disabled: props.filter ? props.filter.disabled : false,
                },
                props.index
              );
            }}
          >
            Save
          </EuiSmallButton>
        </EuiFlexItem>
      </EuiFlexGroup>
    </div>
  );
}

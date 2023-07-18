/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiComboBox, EuiFlexGroup, EuiFlexItem } from '@elastic/eui';
import React, { useState } from 'react';
import { AGGREGATION_OPTIONS } from '../../../../common/constants/metrics';

export const MapMetricsToEditPanel = (props) => {
  const [selectedAttributes, setSelectedAttributes] = useState('');
  const [selectedAggregation, setSelectedAggregation] = useState('avg');

  const onAttributeChange = (selectedAttributeOptions) => {
    setSelectedAttributes(selectedAttributeOptions);
  };

  const onAggregationChange = (selectedAggregationOption) => {
    setSelectedAggregation(selectedAggregationOption);
  };

  return (
    <>
      <EuiFlexGroup direction="column">
        <EuiFlexItem grow={false}>
          <EuiComboBox
            placeholder="Select required attributes"
            options={options}
            selectedOptions={selectedAttributeOptions}
            onChange={onAttributeChange}
            isClearable={true}
            data-test-subj="metrics__attributesComboBox"
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiComboBox
            placeholder="Select required aggregation type"
            options={AGGREGATION_OPTIONS}
            selectedOptions={selectedAggregationOption}
            onChange={onAggregationChange}
            isClearable={true}
            data-test-subj="metrics__aggregationsComboBox"
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>Using the column direction</EuiFlexItem>
      </EuiFlexGroup>
    </>
  );
};

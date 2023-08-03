/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiComboBox, EuiFlexGroup, EuiFlexItem } from '@elastic/eui';
import React, { useState } from 'react';
import { AGGREGATION_OPTIONS } from '../../../../common/constants/metrics';

export const MetricsEditPanel = ({
  selectedAttributes,
  availableAttributes,
  selectedAggregation,
  updateMetricConfig,
}: {
  selectedAttributes: string[];
  availableAttributes: string[];
  selectedAggregation: string;
  updateMetricConfig: (config: {}) => void;
}) => {
  // const [selectedAttributes, setSelectedAttributes] = useState('');
  // const [selectedAggregation, setSelectedAggregation] = useState('avg');

  const onAttributeChange = (newAttributesSelection) => {
    console.log('selectedAttributes', newAttributesSelection);
    updateMetricConfig({ selectedAttributes: newAttributesSelection });
  };

  const onAggregationChange = (newAggregationSelection) => {
    console.log('selectedAggregation', newAggregationSelection);
    updateMetricConfig({ selectedAggregation: newAggregationSelection });
  };

  console.log('metric edit panel', {
    selectedAttributes,
    availableAttributes,
    selectedAggregation,
  });

  return (
    <>
      <EuiFlexGroup direction="column">
        <EuiFlexItem grow={false}>
          <EuiComboBox
            placeholder="Select grouping attributes"
            options={availableAttributes}
            selectedOptions={selectedAttributes}
            onChange={onAttributeChange}
            isClearable={true}
            data-test-subj="metrics__attributesComboBox"
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiComboBox
            placeholder="Select required aggregation type"
            options={AGGREGATION_OPTIONS}
            selectedOptions={selectedAggregation}
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

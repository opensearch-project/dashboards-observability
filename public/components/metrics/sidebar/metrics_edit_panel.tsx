/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiComboBox,
  EuiFlexGroup,
  EuiFlexItem,
  EuiForm,
  EuiFormRow,
  EuiSelect,
} from '@elastic/eui';
import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { AGGREGATION_OPTIONS } from '../../../../common/constants/metrics';
import { metricQuerySelector, updateMetricQuery } from '../redux/slices/metrics_slice';

export const MetricsEditPanel = ({ visualizationId }: { visualizationId: string }) => {
  // const [selectedAttributes, setSelectedAttributes] = useState('');
  // const [selectedAggregation, setSelectedAggregation] = useState('avg');

  const dispatch = useDispatch();

  const query = useSelector(metricQuerySelector(visualizationId));
  useEffect(() => {
    console.log({ visualizationId, query });
  }, [query, visualizationId]);

  const availableAttributesLabels = query.availableAttributes.map((attribute) => ({
    label: attribute,
    name: attribute,
  }));

  const onChangeAggregation = (e) => {
    dispatch(updateMetricQuery(visualizationId, { aggregation: e.target.value }));
  };

  const onChangeAttributesGroupBy = async (selectedAttributes) => {
    console.log('onChangeAttributes', selectedAttributes);
    const attributesGroupBy = selectedAttributes.map(({ label }) => label);
    dispatch(updateMetricQuery(visualizationId, { attributesGroupBy }));
  };

  const flexForm = (
    <EuiFlexGroup direction="column">
      <EuiFlexItem grow={false}>
        <EuiSelect
          compressed
          value={query.aggregation}
          onChange={onChangeAggregation}
          options={AGGREGATION_OPTIONS}
        />
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiComboBox
          placeholder="Select grouping attributes"
          options={availableAttributesLabels}
          selectedOptions={query.attributesGroupBy.map((label) => ({ label, value: label }))}
          onChange={onChangeAttributesGroupBy}
          isClearable={true}
          data-test-subj="metrics__attributesComboBox"
        />
      </EuiFlexItem>
    </EuiFlexGroup>
  );
  const formGroup = (
    <EuiForm>
      <EuiFormRow label="Aggregation">
        <EuiSelect
          compressed
          value={query.aggregation}
          onChange={onChangeAggregation}
          options={AGGREGATION_OPTIONS}
        />
      </EuiFormRow>
      <EuiFormRow label="Aggregations Group By">
        <EuiComboBox
          placeholder="Select grouping attributes"
          options={availableAttributesLabels}
          selectedOptions={query.attributesGroupBy.map((label) => ({ label, value: label }))}
          onChange={onChangeAttributesGroupBy}
          isClearable={true}
          data-test-subj="metrics__attributesComboBox"
        />
      </EuiFormRow>
    </EuiForm>
  );

  return formGroup;
};

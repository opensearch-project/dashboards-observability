/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  EuiComboBox,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormControlLayout,
  EuiFormLabel,
  EuiSelect,
} from '@elastic/eui';
import { useDispatch } from 'react-redux';
import { AGGREGATION_OPTIONS } from '../../../../common/constants/metrics';
import { updateMetricQuery } from '../redux/slices/metrics_slice';

const availableAttributesLabels = (attributes) =>
  attributes.map((a) => ({
    label: a,
    name: a,
  }));

export const MetricsEditInline = ({ visualization }: { visualizationId: string }) => {
  const dispatch = useDispatch();

  const onChangeAggregation = (e) => {
    dispatch(updateMetricQuery(visualization.id, { aggregation: e.target.value }));
  };

  const onChangeAttributesGroupBy = async (selectedAttributes) => {
    const attributesGroupBy = selectedAttributes.map(({ label }) => label);
    dispatch(updateMetricQuery(visualization.id, { attributesGroupBy }));
  };

  const renderAggregationEditor = () => (
    <EuiFlexGroup>
      <EuiFlexItem id="aggregation__field">
        <EuiSelect
          compressed
          value={visualization?.aggregation ?? 'avg'}
          onChange={onChangeAggregation}
          options={AGGREGATION_OPTIONS}
          prepend="AGGREGATION"
        />
      </EuiFlexItem>
    </EuiFlexGroup>
  );

  const renderAttributesGroupByEditor = () => (
    <EuiFormControlLayout
      readOnly
      compressed
      fullWidth
      prepend={<EuiFormLabel htmlFor="attributeGroupBy">ATTRIBUTES GROUP BY</EuiFormLabel>}
    >
      <EuiComboBox
        className={'attributesGroupBy'}
        compressed
        fullWidth
        selectedOptions={
          visualization?.attributesGroupBy?.map((label) => ({ label, value: label })) ?? []
        }
        onChange={onChangeAttributesGroupBy}
        options={availableAttributesLabels(visualization?.availableAttributes ?? [])}
        prepend={'ATTRIBUTES GROUP BY'}
      />
    </EuiFormControlLayout>
  );

  return (
    <EuiFlexGroup id="metricsEditInline">
      <EuiFlexItem grow={false}>{renderAggregationEditor()}</EuiFlexItem>
      <EuiFlexItem>{renderAttributesGroupByEditor()}</EuiFlexItem>
    </EuiFlexGroup>
  );
};

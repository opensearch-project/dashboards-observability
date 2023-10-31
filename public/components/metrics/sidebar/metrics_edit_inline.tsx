/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  EuiComboBox,
  EuiFormControlLayout,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormLabel,
  EuiSelect,
} from '@elastic/eui';
import { useDispatch, useSelector } from 'react-redux';
import { AGGREGATION_OPTIONS } from '../../../../common/constants/metrics';
import {
  metricQuerySelector,
  setMetricSelectedAttributes,
  updateMetricQuery,
} from '../redux/slices/metrics_slice';

const availableAttributesLabels = (attributes) =>
  attributes.map((a) => ({
    label: a,
    name: a,
  }));

export const MetricsEditInline = ({ visualization }: { visualizationId: string }) => {
  const [aggregationIsOpen, setAggregationIsOpen] = useState(false);
  const [attributesGroupByIsOpen, setAttributesGroupByIsOpen] = useState(false);

  const dispatch = useDispatch();

  // const availableAttributesLabels =
  //   visualization.availableAttributes?.map((attribute) => ({
  //     label: attribute,
  //     name: attribute,
  //   })) ?? [];

  const onChangeAggregation = (e) => {
    console.log('onChangeAggregation', e.target.value);

    dispatch(updateMetricQuery(visualization.id, { aggregation: e.target.value }));
    setAggregationIsOpen(false);
  };

  const onChangeAttributesGroupBy = async (selectedAttributes) => {
    console.log('onChangeAttributes', selectedAttributes);
    const attributesGroupBy = selectedAttributes.map(({ label }) => label);
    dispatch(updateMetricQuery(visualization.id, { attributesGroupBy }));

    setAttributesGroupByIsOpen(false);
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

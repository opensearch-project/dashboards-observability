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

const useObservable = (observable, observer, deps) => {
  // useEffect with empty deps will call this only once
  useEffect(() => {
    const sub = observable.subscribe(observer); // connect
    return () => sub.unsubscribe(); // < unsub on unmount
  }, deps);
};

export const MetricsEditInline = ({ visualizationId }: { visualizationId: string }) => {
  const [aggregationIsOpen, setAggregationIsOpen] = useState(false);
  const [attributesGroupByIsOpen, setAttributesGroupByIsOpen] = useState(false);

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
    setAggregationIsOpen(false);
  };

  const onChangeAttributesGroupBy = async (selectedAttributes) => {
    console.log('onChangeAttributes', selectedAttributes);
    const attributesGroupBy = selectedAttributes.map(({ label }) => label);
    dispatch(setMetricSelectedAttributes({ visualizationId, attributesGroupBy }));

    setAttributesGroupByIsOpen(false);
  };

  const renderAggregationEditor = () => (
    <EuiFlexGroup>
      <EuiFlexItem id="aggregation__field">
        <EuiSelect
          compressed
          value={query.aggregation}
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
        selectedOptions={query.attributesGroupBy.map((label) => ({ label, value: label }))}
        onChange={onChangeAttributesGroupBy}
        options={availableAttributesLabels}
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

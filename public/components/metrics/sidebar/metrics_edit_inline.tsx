/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  EuiComboBox,
  EuiExpression,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormLabel,
  EuiFormRow,
  EuiPopover,
  EuiPopoverTitle,
  EuiSelect,
} from '@elastic/eui';
import { from } from 'rxjs';
import { distinct, filter, map, mergeMap, tap, toArray } from 'rxjs/operators';
import { MetricType } from '../../../../common/types/metrics';
import { AGGREGATION_OPTIONS } from '../../../../common/constants/metrics';

const useObservable = (observable, observer, deps) => {
  // useEffect with empty deps will call this only once
  useEffect(() => {
    const sub = observable.subscribe(observer); // connect
    return () => sub.unsubscribe(); // < unsub on unmount
  }, deps);
};

export const MetricsEditInline = ({
  visualizationData,
  metricMetaData,
  updateMetricConfig,
}: {
  visualizationData?: any;
  metricMetaData?: MetricType;
  updateMetricConfig: ({}: { aggregation?: string; attributesGroupBy?: string[] }) => void;
  availableAttributes?: string[];
}) => {
  const [aggregationIsOpen, setAggregationIsOpen] = useState(false);
  const [attributesGroupByIsOpen, setAttributesGroupByIsOpen] = useState(false);

  const availableAttributesLabels =
    metricMetaData?.query?.availableAttributes?.map((attribute) => ({
      label: attribute,
      name: attribute,
    })) || [];

  const selectedOptionsFrom = (query) => {
    return query.attributesGroupBy.map((attribute) => ({ label: attribute, name: attribute }));
  };
  // useEffect(() => {
  //   console.log({ availableAttributes });
  // }, [availableAttributes]);

  const onChangeAggregation = (value) => {
    updateMetricConfig({ aggregation: value });
    setAggregationIsOpen(false);
  };

  const onChangeAttributesGroupBy = (selectedAttributes) => {
    const attributesGroupBy = selectedAttributes.map(({ label }) => label);
    updateMetricConfig({ attributesGroupBy });

    setAttributesGroupByIsOpen(false);
  };

  const renderAggregationEditor = () => (
    <EuiFlexGroup>
      <EuiFlexItem>
        <EuiFormRow label="AGGREGATION">
          <EuiSelect
            compressed
            value={metricMetaData.query.aggregation}
            onChange={onChangeAggregation}
            options={AGGREGATION_OPTIONS}
          />
        </EuiFormRow>
      </EuiFlexItem>
    </EuiFlexGroup>
  );

  const renderAttributesGroupByEditor = () => (
    <EuiFlexGroup>
      <EuiFlexItem>
        <EuiFormRow label="ATTRIBUTES GROUP BY">
          <EuiComboBox
            className={'attributesGroupBy'}
            compressed
            selectedOptions={selectedOptionsFrom(metricMetaData.query)}
            onChange={onChangeAttributesGroupBy}
            options={availableAttributesLabels}
            prepend={'ATTRIBUTES GROUP BY'}
          />
        </EuiFormRow>
      </EuiFlexItem>
    </EuiFlexGroup>
  );

  return (
    <div>
      <EuiFlexGroup>
        <EuiFlexItem grow={false}>{renderAggregationEditor()}</EuiFlexItem>
        <EuiFlexItem grow={false}>{renderAttributesGroupByEditor()}</EuiFlexItem>
      </EuiFlexGroup>
    </div>
  );
};

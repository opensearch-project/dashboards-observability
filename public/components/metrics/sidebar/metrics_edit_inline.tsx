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
}) => {
  const [aggregationIsOpen, setAggregationIsOpen] = useState(false);
  const [attributesGroupByIsOpen, setAttributesGroupByIsOpen] = useState(false);
  const [availableAttributes, setAvailableAttributes] = useState([]);

  useObservable(
    from(visualizationData?.datarows || []).pipe(
      mergeMap((row) => Object.keys(row[0])),
      filter((attributeKey) => attributeKey !== '__name__'),
      distinct((attributeKey) => attributeKey),
      map((attributeKey) => ({ label: attributeKey, value: attributeKey })),
      toArray()
    ),
    setAvailableAttributes,
    [visualizationData]
  );

  // useEffect(() => {
  //   console.log({ availableAttributes });
  // }, [availableAttributes]);

  const onChangeAggregation = (e) => {
    updateMetricConfig({ aggregation: e.target.value });
    setAggregationIsOpen(false);
  };

  const onChangeAttributesGroupBy = (e) => {
    updateMetricConfig({ selectedAttributesGroupBy: e.target.value });
    setAttributesGroupByIsOpen(false);
  };

  useEffect(() => {
    console.log({ availableAttributes, metricMetaData, visualizationData });
  }, [availableAttributes, metricMetaData, visualizationData]);

  const renderAggregationEditor = () => (
    <div>
      <EuiPopoverTitle>Aggregation</EuiPopoverTitle>
      <EuiSelect
        compressed
        value={metricMetaData.query.aggregation}
        onChange={onChangeAggregation}
        options={AGGREGATION_OPTIONS}
      />
    </div>
  );

  const renderAttributesGroupByEditor = () => (
    <div>
      <EuiPopoverTitle>Group By Attributes</EuiPopoverTitle>
      <EuiComboBox
        compressed
        value={metricMetaData.query.attributesGroupBy}
        onChange={onChangeAggregation}
        options={[{ label: 'host' }]}
      />
    </div>
  );

  return (
    <div>
      <EuiFlexGroup>
        <EuiFlexItem grow={false}>
          <EuiPopover
            id="aggregation"
            button={
              <EuiExpression
                description="aggregation"
                value={metricMetaData.query.aggregation}
                isActive={aggregationIsOpen}
                onClick={() => setAggregationIsOpen(true)}
              />
            }
            isOpen={aggregationIsOpen}
            closePopover={() => setAggregationIsOpen(false)}
            panelPaddingSize="s"
            anchorPosition="downLeft"
          >
            {renderAggregationEditor()}
          </EuiPopover>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiPopover
            id="attributes"
            button={
              <EuiExpression
                description="group by attributes"
                value={'(none selected)'}
                isActive={attributesGroupByIsOpen}
                onClick={() => setAttributesGroupByIsOpen(true)}
              />
            }
            isOpen={attributesGroupByIsOpen}
            closePopover={() => setAttributesGroupByIsOpen(false)}
            panelPaddingSize="s"
            anchorPosition="downLeft"
          >
            {renderAttributesGroupByEditor()}
          </EuiPopover>
        </EuiFlexItem>
      </EuiFlexGroup>
    </div>
  );
};

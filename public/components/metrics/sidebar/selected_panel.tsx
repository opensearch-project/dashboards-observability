/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { EuiFlexGroup, EuiFlexItem, EuiFormLabel, EuiPanel } from '@elastic/eui';
import { deSelectMetric, selectedMetricsSelector } from '../redux/slices/metrics_slice';
import { MetricName } from './metric_name';

export const SelectedPanel = () => {
  const selectedMetrics = useSelector(selectedMetricsSelector);

  const dispatch = useDispatch();

  const handleRemoveMetric = (metric) => {
    dispatch(deSelectMetric(metric));
  };
  return (
    <EuiPanel>
      <EuiFlexGroup direction="column" gutterSize="s">
        <EuiFlexItem>
          <EuiFormLabel>Selected Metrics</EuiFormLabel>
        </EuiFlexItem>
        {selectedMetrics.slice(0, 100).map((metric: any) => (
          <EuiFlexItem key={metric.id}>
            <MetricName metric={metric} handleClick={handleRemoveMetric} showDeleteIcon={true} />
          </EuiFlexItem>
        ))}
      </EuiFlexGroup>
    </EuiPanel>
  );
};

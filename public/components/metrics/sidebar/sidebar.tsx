/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import './sidebar.scss';

import React, { useEffect } from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiFormLabel, EuiPanel } from '@elastic/eui';
import { batch, useDispatch, useSelector } from 'react-redux';
import { selectMetric, loadMetrics, searchedMetricsSelector } from '../redux/slices/metrics_slice';
import { MetricName } from './metric_name';
import { SearchBar } from './search_bar';

export const Sidebar = () => {
  const dispatch = useDispatch();

  const searchedMetrics = useSelector(searchedMetricsSelector);

  useEffect(() => {
    batch(() => {
      dispatch(loadMetrics());
    });
  }, []);

  const handleAddMetric = (metric: any) => dispatch(selectMetric(metric));

  return (
    <EuiPanel>
      <EuiFlexGroup direction="column" gutterSize="s">
        <EuiFlexItem>
          <SearchBar />
        </EuiFlexItem>

        <EuiFlexItem>
          <EuiFormLabel>Available metrics</EuiFormLabel>
        </EuiFlexItem>
        {searchedMetrics.slice(0, 100).map((metric: any) => (
          <EuiFlexItem key={metric.id}>
            <MetricName metric={metric} handleClick={handleAddMetric} />
          </EuiFlexItem>
        ))}
      </EuiFlexGroup>
    </EuiPanel>
  );
};

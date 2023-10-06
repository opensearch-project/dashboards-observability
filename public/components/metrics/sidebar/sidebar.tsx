/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import './sidebar.scss';

import React, { useEffect } from 'react';
import { EuiSpacer } from '@elastic/eui';
import { I18nProvider } from '@osd/i18n/react';
import { batch, useDispatch, useSelector } from 'react-redux';
import {
  availableMetricsSelector,
  deSelectMetric,
  selectMetric,
  loadMetrics,
  selectedMetricsSelector,
  addSelectedMetric,
  removeSelectedMetric,
} from '../redux/slices/metrics_slice';
import { CoreStart } from '../../../../../../src/core/public';
import PPLService from '../../../services/requests/ppl';
import { MetricsAccordion } from './metrics_accordion';
import { SearchBar } from './search_bar';

export const Sidebar = () => {
  const dispatch = useDispatch();

  const availableMetrics = useSelector(availableMetricsSelector);
  const selectedMetrics = useSelector(selectedMetricsSelector);

  useEffect(() => {
    dispatch(loadMetrics());
  }, []);

  const handleAddMetric = (metric: any) => {
    console.log('handleAddMetric', metric);
    dispatch(addSelectedMetric(metric.id));
  };
  const handleRemoveMetric = (metric: any) => {
    dispatch(removeSelectedMetric(metric.id));
  };

  return (
    <I18nProvider>
      <section className="sidebarHeight">
        <SearchBar />
        <EuiSpacer size="s" />

        <MetricsAccordion
          metricsList={selectedMetrics}
          headerName="Selected Metrics"
          handleClick={handleRemoveMetric}
          dataTestSubj="metricsListItems_selectedMetrics"
          showRemoveIcon={true}
        />
        <EuiSpacer size="s" />
        <MetricsAccordion
          metricsList={availableMetrics}
          headerName="Available Metrics"
          handleClick={handleAddMetric}
          dataTestSubj="metricsListItems_availableMetrics"
        />
      </section>
    </I18nProvider>
  );
};

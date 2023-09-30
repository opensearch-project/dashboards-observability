/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import './sidebar.scss';

import React, { useContext, useEffect } from 'react';
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
} from '../redux/slices/metrics_slice';
import { CoreStart } from '../../../../../../src/core/public';
import PPLService from '../../../services/requests/ppl';
import { MetricsAccordion } from './metrics_accordion';
import { SearchBar } from './search_bar';
import { MetricsLayoutContext } from '../index';

export const Sidebar = () => {
  const dispatch = useDispatch();

  const availableMetrics = useSelector(availableMetricsSelector);
  const selectedMetrics = useSelector(selectedMetricsSelector);

  const { addToLayout } = useContext(MetricsLayoutContext);

  useEffect(() => {
    batch(() => {
      dispatch(loadMetrics());
    });
  }, [dispatch]);

  const handleAddMetric = (metric: any) => {
    addToLayout(metric.id);
    dispatch(addSelectedMetric(metric.id));
  };
  const handleRemoveMetric = (metric: any) => {
    dispatch(deSelectMetric(metric));
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

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import './sidebar.scss';

import React, { useEffect } from 'react';
import { EuiSpacer } from '@elastic/eui';
import { I18nProvider } from '@osd/i18n/react';
import {
  useMetricStore,
  availableMetricsSelector,
  selectedMetricsSelector,
  loadMetrics,
} from '../metrics_store';
import { MetricsAccordion } from './metrics_accordion';
import { SearchBar } from './search_bar';

export const Sidebar = () => {
  const availableMetrics = useMetricStore(availableMetricsSelector);
  const selectedMetrics = useMetricStore(selectedMetricsSelector);
  const { deSelectMetric, selectMetric } = useMetricStore();

  useEffect(() => {
    loadMetrics();
  }, []);

  return (
    <I18nProvider>
      <section className="sidebarHeight">
        <SearchBar />
        <EuiSpacer size="s" />

        <MetricsAccordion
          metricsList={selectedMetrics}
          headerName="Selected Metrics"
          handleClick={deSelectMetric}
          dataTestSubj="metricsListItems_selectedMetrics"
        />
        <EuiSpacer size="s" />
        <MetricsAccordion
          metricsList={availableMetrics}
          headerName="Available Metrics"
          handleClick={selectMetric}
          dataTestSubj="metricsListItems_availableMetrics"
        />
      </section>
    </I18nProvider>
  );
};

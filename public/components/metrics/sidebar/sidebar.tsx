/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiSpacer } from '@elastic/eui';
import { I18nProvider } from '@osd/i18n/react';
import keyBy from 'lodash/keyBy';
import sortBy from 'lodash/sortBy';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { batch, useDispatch, useSelector } from 'react-redux';
import { OTEL_METRIC_SUBTYPE, PPL_METRIC_SUBTYPE } from '../../../../common/constants/shared';
import { OptionType } from '../../../../common/types/metrics';
import {
  addSelectedMetric,
  availableMetricsSelector,
  clearSelectedMetrics,
  coloredIconsFrom,
  fetchOpenTelemetryDocumentNames,
  loadMetrics,
  loadOTIndices,
  mergeMetrics,
  otelIndexSelector,
  removeSelectedMetric,
  selectMetricByIdSelector,
  selectedMetricsIdsSelector,
  selectedMetricsSelector,
  setDataSourceIcons,
  setSortedIds,
} from '../redux/slices/metrics_slice';
import { DataSourcePicker } from './data_source_picker';
import { IndexPicker } from './index_picker';
import { MetricsAccordion } from './metrics_accordion';
import { SearchBar } from './search_bar';
import './sidebar.scss';

interface SideBarMenuProps {
  selectedDataSource: OptionType[];
  setSelectedDataSource: (sources: OptionType[]) => void;
  selectedOTIndex: React.SetStateAction<Array<{}>>;
  setSelectedOTIndex: React.Dispatch<React.SetStateAction<unknown>>;
  additionalSelectedMetricId?: string;
  dataSourceMDSId: string;
}
export const Sidebar = ({
  selectedDataSource,
  setSelectedDataSource,
  selectedOTIndex,
  setSelectedOTIndex,
  additionalSelectedMetricId,
  dataSourceMDSId,
}: SideBarMenuProps) => {
  const dispatch = useDispatch();
  const [availableOTDocuments, setAvailableOTDocuments] = useState([]);
  const availableOTDocumentsRef = useRef();
  availableOTDocumentsRef.current = availableOTDocuments;
  const promethuesMetrics = useSelector(availableMetricsSelector);
  const selectedMetrics = useSelector(selectedMetricsSelector);
  const selectedMetricsIds = useSelector(selectedMetricsIdsSelector);

  const additionalMetric = useSelector(selectMetricByIdSelector(additionalSelectedMetricId));
  const otelIndices = useSelector(otelIndexSelector);

  useEffect(() => {
    (async function () {
      setSelectedDataSource([]);
      setSelectedOTIndex([]);
      await dispatch(clearSelectedMetrics());
    })();
  }, [dataSourceMDSId]);

  useEffect(() => {
    batch(() => {
      dispatch(loadMetrics(dataSourceMDSId));
    });
  }, [dispatch, selectedDataSource, dataSourceMDSId]);

  useEffect(() => {
    batch(() => {
      dispatch(loadOTIndices(dataSourceMDSId));
    });
  }, [dispatch, selectedDataSource, dataSourceMDSId]);

  useEffect(() => {
    if (additionalMetric) {
      (async function () {
        await dispatch(clearSelectedMetrics());
        await dispatch(addSelectedMetric(additionalMetric, dataSourceMDSId));
      })();
    }
  }, [additionalMetric?.id, dataSourceMDSId]);

  const selectedMetricsList = useMemo(() => {
    return selectedMetricsIds.map((id) => selectedMetrics[id]).filter((m) => m); // filter away null entries
  }, [selectedMetrics, selectedMetricsIds, dataSourceMDSId]);

  useEffect(() => {
    if (selectedOTIndex.length > 0 && selectedDataSource[0]?.label === 'OpenTelemetry') {
      const fetchOtelDocuments = async () => {
        try {
          const documentNames = await fetchOpenTelemetryDocumentNames(
            selectedOTIndex[0]?.label,
            dataSourceMDSId
          )();
          const availableOtelDocuments = documentNames?.aggregations?.distinct_names?.buckets.map(
            (item: any) => {
              return {
                id: item.key,
                name: item.key,
                catalog: 'OpenTelemetry',
                subType: PPL_METRIC_SUBTYPE,
                metricType: OTEL_METRIC_SUBTYPE,
                type: 'Histogram',
                index: selectedOTIndex[0]?.label,
              };
            }
          );
          setAvailableOTDocuments(availableOtelDocuments);
          const metricsMapById = keyBy(availableOtelDocuments, 'id');

          dispatch(mergeMetrics(metricsMapById));

          const sortedIds = sortBy(availableOtelDocuments, 'catalog', 'id').map((m) => m.id);
          dispatch(setSortedIds(sortedIds));
          dispatch(setDataSourceIcons(coloredIconsFrom(['OpenTelemetry'])));
        } catch (error) {
          console.error('Error fetching OpenTelemetry documents:', error);
        }
      };
      fetchOtelDocuments();
    }
  }, [dispatch, selectedDataSource, selectedOTIndex, dataSourceMDSId]);

  const indexPicker = useMemo(() => {
    const isOpenTelemetry = selectedDataSource[0]?.label === 'OpenTelemetry' ? true : false;
    if (isOpenTelemetry) {
      return <IndexPicker otelIndices={otelIndices} setSelectedOTIndex={setSelectedOTIndex} />;
    }
  }, [selectedDataSource, dataSourceMDSId]);

  const availableMetrics = useMemo(() => {
    if (selectedDataSource[0]?.label === 'OpenTelemetry' && selectedOTIndex.length > 0)
      return promethuesMetrics;
    else if (selectedDataSource[0]?.label === 'Prometheus') return promethuesMetrics;
    else return [];
  }, [
    promethuesMetrics,
    selectedDataSource,
    availableOTDocuments,
    selectedOTIndex,
    dataSourceMDSId,
  ]);

  const handleAddMetric = (metric: any) => {
    dispatch(addSelectedMetric(metric, dataSourceMDSId));
  };

  const handleRemoveMetric = (metric: any) => {
    dispatch(removeSelectedMetric(metric));
  };

  return (
    <I18nProvider>
      <div id="sidebar">
        <DataSourcePicker
          selectedDataSource={selectedDataSource}
          setSelectedDataSource={setSelectedDataSource}
        />
        <EuiSpacer size="s" />
        {indexPicker}
        <EuiSpacer size="s" />
        <SearchBar />
        <EuiSpacer size="s" />
        <section className="sidebar">
          <MetricsAccordion
            metricsList={selectedMetricsList}
            headerName="Selected Metrics"
            handleClick={handleRemoveMetric}
            dataTestSubj="metricsListItems_selectedMetrics"
            dataSourceMDSId={dataSourceMDSId}
          />
          <EuiSpacer size="s" />
          <MetricsAccordion
            metricsList={availableMetrics}
            headerName="Available Metrics"
            handleClick={handleAddMetric}
            dataTestSubj="metricsListItems_availableMetrics"
            dataSourceMDSId={dataSourceMDSId}
          />
        </section>
      </div>
    </I18nProvider>
  );
};
